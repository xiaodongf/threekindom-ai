import type { ImgHTMLAttributes } from 'react';
import { avifOf } from '../../utils/art.js';

interface ArtProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  /** Use the 256px thumbnail: for avatars, tokens and tiles shown small. */
  thumb?: boolean;
}

/**
 * A painted image: AVIF where the browser supports it, the original JPG otherwise. The <picture>
 * wrapper takes no box of its own, so layout classes on the image behave as on a bare <img>.
 */
export function Art({ src, thumb = false, alt = '', ...rest }: ArtProps) {
  const avif = avifOf(src, thumb);
  return (
    <picture className="contents">
      {avif && <source srcSet={avif} type="image/avif" />}
      <img src={src} alt={alt} {...rest} />
    </picture>
  );
}
