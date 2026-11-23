// Converts the painted JPGs in public/ to AVIF and writes 256px thumbnails for art that is mostly
// shown small (portraits, terrain tiles). The JPGs stay in place as the fallback for browsers
// without AVIF. Re-run after adding or replacing art:  npm run optimize:art
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const FULL = { quality: 58, effort: 5 };
const THUMB = { quality: 60, effort: 5 };
const THUMB_SIZE = 256;

const needsThumb = (dir, file) => dir === 'portraits' || file.startsWith('tile_');

async function isStale(src, out) {
  try {
    const [a, b] = await Promise.all([stat(src), stat(out)]);
    return a.mtimeMs > b.mtimeMs;
  } catch {
    return true;
  }
}

let before = 0;
let after = 0;
let written = 0;

for (const dir of ['art', 'portraits']) {
  const files = (await readdir(path.join(root, dir))).filter((f) => f.endsWith('.jpg')).sort();
  for (const file of files) {
    const src = path.join(root, dir, file);
    const base = file.slice(0, -4);
    const full = path.join(root, dir, `${base}.avif`);
    if (await isStale(src, full)) {
      await sharp(src).avif(FULL).toFile(full);
      written += 1;
    }
    if (needsThumb(dir, file)) {
      const thumb = path.join(root, dir, `${base}_${THUMB_SIZE}.avif`);
      if (await isStale(src, thumb)) {
        await sharp(src)
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'top' })
          .avif(THUMB)
          .toFile(thumb);
        written += 1;
      }
    }
    before += (await stat(src)).size;
    after += (await stat(full)).size;
  }
}

const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`${written} file(s) written. Full-size art: ${mb(before)} MB JPG -> ${mb(after)} MB AVIF.`);
