import Image, { type ImageProps } from 'next/image';

/**
 * next/image wrapper that serves SVGs unoptimized (the optimizer rejects local
 * SVGs) while letting real raster images (jpg/webp/png) be optimised normally.
 * Lets brand SVG placeholders and future real photos share the same call site.
 */
export function SmartImage(props: ImageProps) {
  const src = typeof props.src === 'string' ? props.src : '';
  const isSvg = src.toLowerCase().endsWith('.svg');
  return <Image {...props} unoptimized={props.unoptimized ?? isSvg} />;
}
