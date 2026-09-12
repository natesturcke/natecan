/** Quantizes the PNGs in public/art in place to cut download size. Raw originals stay in scripts/.art-cache. */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = join(process.cwd(), 'public', 'art');
let before = 0;
let after = 0;
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.png')) continue;
  const path = join(dir, file);
  const size = statSync(path).size;
  before += size;
  const buf = await sharp(path).png({ palette: true, quality: 82, effort: 8, compressionLevel: 9 }).toBuffer();
  if (buf.length < size) {
    await sharp(buf).toFile(path + '.tmp');
    const { renameSync } = await import('node:fs');
    renameSync(path + '.tmp', path);
    after += buf.length;
  } else {
    after += size;
  }
}
console.log(`art: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
