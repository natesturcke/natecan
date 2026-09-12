/**
 * Art pipeline: generates every asset listed in scripts/art-manifest.ts into
 * public/art/<key>.png using the OpenAI Images API, then post-processes with
 * sharp so the output matches the renderer contract in src/board-phaser/assets.ts.
 *
 *   npm run art                       # generate everything that is missing
 *   npm run art -- --only hex-forest  # only these keys (comma separated)
 *   npm run art -- --force hex-forest # regenerate even if the PNG exists (or --force all)
 *   npm run art -- --reprocess        # no API calls: re-run post-processing from scripts/.art-cache/*.raw.png
 *   npm run art -- --dry-run          # list what would be generated
 *
 * Needs OPENAI_API_KEY in .env (or the environment). The key is never logged.
 * Raw API output is cached in scripts/.art-cache/<key>.raw.png (gitignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { allAssetPaths } from '../src/board-phaser/assets';
import { MANIFEST, PLAYER_PIECE_KEYS, TILE_VARIANT_KEYS, type ArtEntry, type Fit } from './art-manifest';
import {
  ART_CACHE_DIR,
  pieceTemplatePng,
  roadBBox,
  roadClipPng,
  roadMaskPng,
  roadTemplatePng,
  tileMaskPng,
  tileSilhouettePng,
  tileTemplatePng,
} from './templates';
import { warpTileToContract } from './art-warp';
import { PORTRAIT_KEYS } from '../src/ui/portraits';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'art');
const EDIT_MODEL = 'gpt-image-2.5-sunburst';
const GENERATE_MODEL = 'gpt-image-2.5-flare';
/** Dilation (asset px) of the editable top-face region for tiles; mirrored by the post clip. */
const TILE_DILATE = 12;
const ROAD_DILATE = 6;

// ---------------------------------------------------------------------------
// env + args
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

interface Args {
  only: Set<string> | null;
  force: Set<string> | 'all' | null;
  reprocess: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { only: null, force: null, reprocess: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = new Set(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--force') {
      const v = argv[++i];
      args.force = v === 'all' ? 'all' : new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--reprocess') args.reprocess = true;
    else if (a === '--dry-run') args.dryRun = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Code-drawn assets: number tokens
// ---------------------------------------------------------------------------

export function tokenSvg(n: number, size = 128): string {
  const cx = size / 2;
  const cy = size / 2;
  const rx = size / 2 - 1;
  const ry = Math.round(size * 0.6) / 2 - 1; // 128 -> 77 tall
  const rim = 6;
  const pips = { 2: 1, 12: 1, 3: 2, 11: 2, 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 }[n] ?? 0;
  const red = n === 6 || n === 8;
  const ink = red ? '#b3261e' : '#2b2118';
  const pipRow = Array.from({ length: pips }, (_, i) => {
    const x = (i - (pips - 1) / 2) * 11;
    return `<ellipse cx="${x}" cy="0" rx="3.6" ry="3.6" fill="${ink}"/>`;
  }).join('');
  // The number and pips are drawn in an un-squashed space and then scaled by 0.6
  // vertically so they lie flat on the foreshortened disc.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="disc" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#fbf3dd"/><stop offset="1" stop-color="#e6d3a8"/></radialGradient>
  </defs>
  <ellipse cx="${cx}" cy="${cy + rim + 2}" rx="${rx}" ry="${ry}" fill="#000" fill-opacity="0.25"/>
  <ellipse cx="${cx}" cy="${cy + rim}" rx="${rx}" ry="${ry}" fill="#a8905f"/>
  <ellipse cx="${cx}" cy="${cy + rim}" rx="${rx}" ry="${ry}" fill="none" stroke="#7d6a45" stroke-width="1"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#disc)" stroke="#8a7449" stroke-width="1.5"/>
  <g transform="translate(${cx} ${cy}) scale(1 0.6)">
    <text x="0" y="18" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="${red ? 64 : 60}" text-anchor="middle" fill="${ink}">${n}</text>
    <g transform="translate(0 36)">${pipRow}</g>
  </g>
</svg>`;
}

async function renderToken(entry: ArtEntry): Promise<Buffer> {
  return sharp(Buffer.from(tokenSvg(entry.token!, entry.width))).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

async function alphaBounds(png: Buffer, threshold = 8): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function isNeutralPiece(key: string): boolean {
  return key === 'settlement' || key === 'city' || key.startsWith('road-');
}

/**
 * Tiles: the model never keeps the template outline exactly, so the painted prism
 * is warped onto the contract geometry (see art-warp.ts) at 2x, shrunk to the
 * asset size, and finally clipped to the exact silhouette.
 */
async function postTile(raw: Buffer, e: ArtEntry): Promise<Buffer> {
  const { png, fitted } = await warpTileToContract(raw, 2);
  if (fitted) {
    console.log(
      `    silhouette fit (2x rows): N ${fitted.nY.toFixed(0)}  NE ${fitted.neY.toFixed(0)}  SE+h ${fitted.seBottomY.toFixed(0)}  S+h ${fitted.sBottomY.toFixed(0)}`,
    );
  } else {
    console.log('    WARNING: could not fit the tile silhouette; plain resize used');
  }
  const resized = await sharp(png).resize(e.width, e.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const clip = await tileSilhouettePng(1);
  return sharp(resized).composite([{ input: clip, blend: 'dest-in' }]).png().toBuffer();
}

/** Roads: fit the painted plank's alpha bounding box onto the template plank's bounding box, then clip. */
async function postRoad(raw: Buffer, e: ArtEntry): Promise<Buffer> {
  const orientation = e.template?.type === 'road' ? e.template.orientation : 'vertical';
  const meta = await sharp(raw).metadata();
  const scale = (meta.width ?? e.width * 4) / e.width;
  const bounds = await alphaBounds(raw, 40);
  if (!bounds) throw new Error('road is fully transparent');
  const want = roadBBox(orientation, scale);
  const plank = await sharp(raw)
    .ensureAlpha()
    .extract(bounds)
    .resize(Math.round(want.width), Math.round(want.height), { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  let img = sharp({ create: { width: meta.width!, height: meta.height!, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: plank, left: Math.round(want.left), top: Math.round(want.top) }])
    .png();
  const placed = await img.toBuffer();
  img = sharp(placed).resize(e.width, e.height, { fit: 'fill', kernel: 'lanczos3' });
  // Roads come out mid-grey; lift them so a multiply tint stays bright.
  if (isNeutralPiece(e.key)) img = img.modulate({ saturation: 0, brightness: 1.2 });
  const resized = await img.png().toBuffer();
  const clip = await roadClipPng(orientation, 1, ROAD_DILATE);
  return sharp(resized).composite([{ input: clip, blend: 'dest-in' }]).png().toBuffer();
}

/** Trim to alpha bounds, scale to fit, and drop onto the canvas so the bottom sits at fit.bottomY. */
async function postSprite(raw: Buffer, e: ArtEntry): Promise<Buffer> {
  const fit: Fit = e.fit ?? { maxWidth: e.width * 0.8, maxHeight: e.height * 0.8, bottomY: e.height * 0.9, centerX: e.width / 2 };
  const bounds = await alphaBounds(raw);
  if (!bounds) throw new Error('sprite is fully transparent');
  let img = sharp(raw).ensureAlpha().extract(bounds);
  if (isNeutralPiece(e.key)) img = img.modulate({ saturation: 0 });
  const scale = Math.min(fit.maxWidth / bounds.width, fit.maxHeight / bounds.height);
  const w = Math.max(1, Math.round(bounds.width * scale));
  const h = Math.max(1, Math.round(bounds.height * scale));
  const sprite = await img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const left = Math.round(fit.centerX - w / 2);
  const top = Math.round(fit.bottomY - h);
  return sharp({ create: { width: e.width, height: e.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }])
    .png()
    .toBuffer();
}

/**
 * Make a texture tileable: blend it with a copy rolled by half its size, using a
 * smooth cross-shaped weight so the original borders (now the seams of the rolled
 * copy) are hidden under the original's centre.
 */
async function postSeamless(raw: Buffer, e: ArtEntry): Promise<Buffer> {
  const { data, info } = await sharp(raw)
    .removeAlpha()
    .resize(e.width, e.height, { fit: 'cover', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const out = Buffer.alloc(data.length);
  const band = 0.28; // fraction of the size over which the blend fades
  const smooth = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
  };
  for (let y = 0; y < H; y++) {
    const ry = (y + H / 2) % H;
    const wy = smooth(1 - Math.abs(y - H / 2) / (H * band));
    for (let x = 0; x < W; x++) {
      const rx = (x + W / 2) % W;
      const wx = smooth(1 - Math.abs(x - W / 2) / (W * band));
      const wa = Math.max(wx, wy); // weight of the original near the centre cross
      const a = (y * W + x) * C;
      const b = (ry * W + rx) * C;
      for (let c = 0; c < C; c++) out[a + c] = Math.round(data[a + c] * wa + data[b + c] * (1 - wa));
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: C as 3 } }).png().toBuffer();
}

async function postCard(raw: Buffer, e: ArtEntry): Promise<Buffer> {
  const r = 18;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${e.width}" height="${e.height}"><rect width="${e.width}" height="${e.height}" rx="${r}" ry="${r}" fill="white"/></svg>`,
  );
  return sharp(raw)
    .resize(e.width, e.height, { fit: 'cover', kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function postProcess(raw: Buffer, e: ArtEntry): Promise<Buffer> {
  switch (e.post) {
    case 'tile':
      return postTile(raw, e);
    case 'road':
      return postRoad(raw, e);
    case 'sprite':
      return postSprite(raw, e);
    case 'seamless':
      return postSeamless(raw, e);
    case 'card':
      return postCard(raw, e);
    case 'token':
      return raw;
  }
}

// ---------------------------------------------------------------------------
// OpenAI calls
// ---------------------------------------------------------------------------

async function templateFor(e: ArtEntry): Promise<{ image: Buffer; mask?: Buffer }> {
  const t = e.template;
  if (!t) throw new Error(`${e.key}: edit entry without template`);
  const [w, h] = e.apiSize.split('x').map(Number);
  switch (t.type) {
    case 'tile': {
      const scale = w / e.width;
      return { image: await tileTemplatePng(scale), mask: e.mask ? await tileMaskPng(scale, TILE_DILATE) : undefined };
    }
    case 'road': {
      const scale = w / e.width;
      return {
        image: await roadTemplatePng(t.orientation, scale),
        mask: e.mask ? await roadMaskPng(t.orientation, scale, ROAD_DILATE) : undefined,
      };
    }
    case 'piece':
      return { image: await pieceTemplatePng(w / e.width) };
  }
  void h;
}

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (status === undefined) return true; // network / timeout
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isModeration(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  const msg = String((err as { message?: string }).message ?? '').toLowerCase();
  const code = String((err as { code?: string }).code ?? '').toLowerCase();
  return status === 400 && (code.includes('moderation') || msg.includes('safety') || msg.includes('moderation'));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransient(err)) throw err;
    console.log(`    transient error (${(err as Error).message}); retrying once`);
    await new Promise((r) => setTimeout(r, 4000));
    return fn();
  }
}

async function callApi(client: OpenAI, e: ArtEntry): Promise<Buffer> {
  const common = {
    prompt: e.prompt,
    size: e.apiSize,
    output_format: 'png' as const,
    quality: e.quality,
    background: e.transparent ? ('transparent' as const) : ('opaque' as const),
    n: 1,
  };
  const res = await withRetry(async () => {
    if (e.kind === 'edit') {
      const { image, mask } = await templateFor(e);
      const images = [await toFile(image, 'template.png', { type: 'image/png' })];
      for (const refKey of e.references ?? []) {
        const refPath = path.join(OUT_DIR, `${refKey}.png`);
        if (!fs.existsSync(refPath)) {
          console.log(`    reference ${refKey} not generated yet; continuing without it`);
          continue;
        }
        images.push(await toFile(fs.readFileSync(refPath), `${refKey}.png`, { type: 'image/png' }));
      }
      return client.images.edit({
        ...common,
        model: EDIT_MODEL,
        image: images,
        mask: mask ? await toFile(mask, 'mask.png', { type: 'image/png' }) : undefined,
      });
    }
    return client.images.generate({ ...common, model: GENERATE_MODEL, moderation: 'low' });
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('API returned no image data');
  return Buffer.from(b64, 'base64');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ART_CACHE_DIR, { recursive: true });

  // Sanity: the manifest must cover exactly the renderer's asset keys.
  const wanted = new Set([...allAssetPaths().map((a) => a.key), ...TILE_VARIANT_KEYS, ...PLAYER_PIECE_KEYS, ...PORTRAIT_KEYS]);
  const have = new Set(MANIFEST.map((m) => m.key));
  for (const k of wanted) if (!have.has(k)) console.warn(`WARNING: manifest has no entry for asset key ${k}`);
  for (const k of have) if (!wanted.has(k)) console.warn(`WARNING: manifest entry ${k} is not an asset key`);

  const queue = MANIFEST.filter((e) => !args.only || args.only.has(e.key));
  if (args.only) for (const k of args.only) if (!have.has(k)) console.warn(`WARNING: --only key ${k} is not in the manifest`);

  const needsKey = !args.reprocess && !args.dryRun && queue.some((e) => e.kind !== 'code');
  const client = needsKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10 * 60 * 1000 }) : null;
  if (needsKey && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set (put it in .env)');

  let apiCalls = 0;
  let failures = 0;
  for (let i = 0; i < queue.length; i++) {
    const e = queue[i];
    const outPath = path.join(OUT_DIR, `${e.key}.png`);
    const rawPath = path.join(ART_CACHE_DIR, `${e.key}.raw.png`);
    const forced = args.force === 'all' || (args.force instanceof Set && args.force.has(e.key));
    const tag = `[${String(i + 1).padStart(2)}/${queue.length}] ${e.key.padEnd(18)}`;

    if (fs.existsSync(outPath) && !forced && !args.reprocess) {
      console.log(`${tag} exists, skipping`);
      continue;
    }
    if (args.dryRun) {
      console.log(`${tag} would ${e.kind === 'code' ? 'draw in code' : `${e.kind} ${e.apiSize} ${e.quality}`}`);
      continue;
    }

    const t0 = Date.now();
    try {
      let raw: Buffer;
      if (e.kind === 'code') {
        raw = await renderToken(e);
      } else if (args.reprocess) {
        if (!fs.existsSync(rawPath)) {
          console.log(`${tag} no cached raw image, skipping`);
          continue;
        }
        raw = fs.readFileSync(rawPath);
      } else {
        raw = await callApi(client!, e);
        apiCalls++;
        fs.writeFileSync(rawPath, raw);
      }
      const finalPng = await postProcess(raw, e);
      fs.writeFileSync(outPath, finalPng);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const how = e.kind === 'code' ? 'code' : args.reprocess ? 'reprocessed' : `${e.kind} ${e.apiSize} ${e.quality}`;
      console.log(`${tag} ${how.padEnd(28)} ${secs}s ok`);
    } catch (err) {
      failures++;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const msg = (err as Error).message ?? String(err);
      if (isModeration(err)) console.log(`${tag} REJECTED by moderation after ${secs}s: ${msg}`);
      else console.log(`${tag} FAILED after ${secs}s: ${msg}`);
    }
  }
  console.log(`done: ${apiCalls} API call(s), ${failures} failure(s)`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
