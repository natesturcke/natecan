/**
 * Silhouette-fitting warp for tile artwork.
 *
 * The image models repaint the whole tile with their own idea of the camera (a
 * flatter hexagon, slightly shrunk, tapered cliffs) even when given a template
 * and mask. Tessellation needs the outline to be pixel-exact, so we measure the
 * painted prism's silhouette, fit straight lines to its eight edges, and warp the
 * image so the fitted polygon lands exactly on the contract polygon
 * (templates.ts#tileSilhouette). Rows are mapped piecewise-linearly through the
 * corner rows, and each row is stretched horizontally between the fitted edges.
 */
import sharp from 'sharp';
import { TILE_IMAGE } from '../src/board-phaser/assets';
import { tileTopCorners, type Pt } from './templates';

interface Line {
  /** x = a*y + b */
  a: number;
  b: number;
}

interface Extents {
  l: number[];
  r: number[];
  top: number;
  bottom: number;
}

function fitLine(pts: Pt[]): Line {
  const n = pts.length;
  let sy = 0;
  let sx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sy += p.y;
    sx += p.x;
    syy += p.y * p.y;
    sxy += p.x * p.y;
  }
  const den = n * syy - sy * sy;
  if (Math.abs(den) < 1e-9) return { a: 0, b: sx / n };
  const a = (n * sxy - sy * sx) / den;
  return { a, b: (sx - a * sy) / n };
}

function xAt(line: Line, y: number): number {
  return line.a * y + line.b;
}

function intersectY(p: Line, q: Line): number {
  // p.a*y + p.b = q.a*y + q.b
  return (q.b - p.b) / (p.a - q.a);
}

function measureExtents(data: Buffer, W: number, H: number, threshold: number): Extents | null {
  const l = new Array<number>(H).fill(-1);
  const r = new Array<number>(H).fill(-1);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < H; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > threshold) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    l[y] = lo;
    r[y] = hi;
    if (lo >= 0) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) return null;
  return { l, r, top, bottom };
}

/**
 * Classify rows of one side (right: r(y) rising then flat then falling) into
 * upper edge / side / lower edge using the smoothed slope, and fit a line to each.
 */
function fitSide(xs: number[], top: number, bottom: number, sign: 1 | -1): { upper: Line; side: Line; lower: Line } | null {
  const rows: Pt[] = [];
  for (let y = top; y <= bottom; y++) if (xs[y] >= 0) rows.push({ x: xs[y] * sign, y });
  if (rows.length < 40) return null;
  // slope over a window of +-6 rows
  const win = 6;
  const slope = rows.map((_, i) => {
    const a = rows[Math.max(0, i - win)];
    const b = rows[Math.min(rows.length - 1, i + win)];
    return (b.x - a.x) / Math.max(1, b.y - a.y);
  });
  const upper: Pt[] = [];
  const side: Pt[] = [];
  const lower: Pt[] = [];
  // Trim the first/last 4% of rows of each class to avoid corner rounding.
  const upperRows = rows.filter((_, i) => slope[i] > 0.9);
  const sideRows = rows.filter((_, i) => Math.abs(slope[i]) <= 0.35);
  const lowerRows = rows.filter((_, i) => slope[i] < -0.9);
  const trim = (arr: Pt[], frac: number) => {
    const k = Math.floor(arr.length * frac);
    return arr.slice(k, arr.length - k);
  };
  upper.push(...trim(upperRows, 0.12));
  side.push(...trim(sideRows, 0.08));
  lower.push(...trim(lowerRows, 0.12));
  if (upper.length < 10 || side.length < 10 || lower.length < 10) return null;
  const un = (line: Line): Line => ({ a: line.a * sign, b: line.b * sign });
  return { upper: un(fitLine(upper)), side: un(fitLine(side)), lower: un(fitLine(lower)) };
}

export interface FittedPrism {
  /** Rows (in source pixels) of the fitted corners. */
  nY: number;
  neY: number;
  seBottomY: number;
  sBottomY: number;
  /** Fitted edge lines (x as a function of y). */
  right: { upper: Line; side: Line; lower: Line };
  left: { upper: Line; side: Line; lower: Line };
}

export function fitPrism(ext: Extents): FittedPrism | null {
  const right = fitSide(ext.r, ext.top, ext.bottom, 1);
  const left = fitSide(ext.l, ext.top, ext.bottom, -1);
  if (!right || !left) return null;
  const nY = intersectY(right.upper, left.upper);
  const neY = (intersectY(right.upper, right.side) + intersectY(left.upper, left.side)) / 2;
  const seBottomY = (intersectY(right.side, right.lower) + intersectY(left.side, left.lower)) / 2;
  const sBottomY = intersectY(right.lower, left.lower);
  if (!(nY < neY && neY < seBottomY && seBottomY < sBottomY)) return null;
  return { nY, neY, seBottomY, sBottomY, right, left };
}

/** Measured extents at a fitted row: which fitted edge applies depends on the segment. */
function fittedExtents(f: FittedPrism, y: number): { l: number; r: number } {
  if (y < f.neY) return { l: xAt(f.left.upper, y), r: xAt(f.right.upper, y) };
  if (y < f.seBottomY) return { l: xAt(f.left.side, y), r: xAt(f.right.side, y) };
  return { l: xAt(f.left.lower, y), r: xAt(f.right.lower, y) };
}

/** Exact prism extents at a target row (target pixels, `scale` x asset space). */
function exactExtents(y: number, scale: number): { l: number; r: number } | null {
  const [n, ne, se, s] = tileTopCorners(scale);
  const h = TILE_IMAGE.sideHeight * scale;
  const cx = n.x;
  if (y < n.y || y > s.y + h) return null;
  let half: number;
  if (y < ne.y) half = ((y - n.y) / (ne.y - n.y)) * (ne.x - cx);
  else if (y <= se.y + h) half = ne.x - cx;
  else half = ((s.y + h - y) / (s.y + h - se.y - h)) * (ne.x - cx);
  return { l: cx - half, r: cx + half };
}

function bilinear(data: Buffer, W: number, H: number, x: number, y: number, out: number[]): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const px = (xx: number, yy: number, c: number): number => {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) return 0;
    return data[(yy * W + xx) * 4 + c];
  };
  for (let c = 0; c < 4; c++) {
    const v =
      px(x0, y0, c) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, c) * fx * (1 - fy) + px(x0, y0 + 1, c) * (1 - fx) * fy + px(x0 + 1, y0 + 1, c) * fx * fy;
    out[c] = v;
  }
}

export interface WarpResult {
  png: Buffer;
  fitted: FittedPrism | null;
}

/**
 * Warp a painted tile (any size, transparent outside) onto the exact prism
 * geometry at `scale` x the asset size. Returns null fit (and a plain resize)
 * when the silhouette cannot be fitted.
 */
export async function warpTileToContract(raw: Buffer, scale: number): Promise<WarpResult> {
  const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const outW = TILE_IMAGE.width * scale;
  const outH = TILE_IMAGE.height * scale;
  const ext = measureExtents(data, W, H, 40);
  const fitted = ext ? fitPrism(ext) : null;
  if (!fitted) {
    const png = await sharp(raw).ensureAlpha().resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    return { png, fitted: null };
  }

  const [n, ne, se, s] = tileTopCorners(scale);
  const h = TILE_IMAGE.sideHeight * scale;
  // Piecewise-linear vertical map: exact corner rows -> fitted corner rows.
  const keysOut = [n.y, ne.y, se.y + h, s.y + h];
  const keysIn = [fitted.nY, fitted.neY, fitted.seBottomY, fitted.sBottomY];
  const mapY = (y: number): number => {
    let i = 0;
    while (i < keysOut.length - 2 && y > keysOut[i + 1]) i++;
    const t = (y - keysOut[i]) / (keysOut[i + 1] - keysOut[i]);
    return keysIn[i] + t * (keysIn[i + 1] - keysIn[i]);
  };

  const out = Buffer.alloc(outW * outH * 4);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < outH; y++) {
    const ey = exactExtents(Math.min(Math.max(y, n.y), s.y + h), scale)!;
    const srcY = mapY(y);
    const fe = fittedExtents(fitted, Math.min(Math.max(srcY, fitted.nY), fitted.sBottomY));
    if (ey.r - ey.l < 1 || y < n.y || y > s.y + h) continue; // outside the prism: transparent
    const scaleX = (fe.r - fe.l) / (ey.r - ey.l);
    for (let x = 0; x < outW; x++) {
      const srcX = fe.l + (x - ey.l) * scaleX;
      bilinear(data, W, H, srcX, srcY, px);
      const o = (y * outW + x) * 4;
      out[o] = px[0];
      out[o + 1] = px[1];
      out[o + 2] = px[2];
      out[o + 3] = px[3];
    }
  }
  const png = await sharp(out, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer();
  return { png, fitted };
}
