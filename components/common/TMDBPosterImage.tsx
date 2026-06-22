import Image, { ImageProps } from 'next/image'

interface TMDBPosterImageProps extends Omit<ImageProps, 'src'> {
  src: string
}

export function isTMDBImageUrl(src: string): boolean {
  try {
    return new URL(src).hostname === 'image.tmdb.org'
  } catch {
    return false
  }
}

export function TMDBPosterImage({ src, unoptimized, ...props }: TMDBPosterImageProps) {
  // TMDB already serves resized CDN images. Bypassing Next/Vercel optimization
  // avoids a transformation for every external poster while local assets remain optimized.
  return (
    <Image
      {...props}
      src={src}
      unoptimized={Boolean(unoptimized) || isTMDBImageUrl(src)}
    />
  )
}
