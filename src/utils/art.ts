/**
 * Painted art ships as AVIF (about a tenth of the JPG weight) with the original JPG as fallback.
 * Portraits and terrain tiles also have a 256px thumbnail for the many places they are shown small.
 * Files are produced by `npm run optimize:art`.
 */
const THUMB_SIZE = 256;

const hasThumb = (src: string) => src.startsWith('/portraits/') || src.startsWith('/art/tile_');

/** AVIF sibling of a painted JPG, or null when the path is not one of ours. */
export function avifOf(src: string, thumb = false): string | null {
  if (!src.endsWith('.jpg') || !(src.startsWith('/art/') || src.startsWith('/portraits/'))) {
    return null;
  }
  const base = src.slice(0, -4);
  return thumb && hasThumb(src) ? `${base}_${THUMB_SIZE}.avif` : `${base}.avif`;
}

let avifSupported: boolean | null = null;

if (typeof Image !== 'undefined') {
  // Smallest valid AVIF: decoding it tells us whether script-loaded art can use the format.
  const probe = new Image();
  probe.onload = () => {
    avifSupported = probe.width > 0;
  };
  probe.onerror = () => {
    avifSupported = false;
  };
  probe.src =
    'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
}

/**
 * Best URL for art loaded from script (WebGL textures, canvas images), where <picture> cannot
 * choose for us. Falls back to the JPG until AVIF support has been confirmed.
 */
export function bestArt(src: string): string {
  return avifSupported ? avifOf(src) ?? src : src;
}
