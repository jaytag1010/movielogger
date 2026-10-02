import type { ImgHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

interface ProfilePhotoImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
}

export function ProfilePhotoImage({ src, alt, className, ...props }: ProfilePhotoImageProps) {
  // User-uploaded profile images may come from different ImgBB CDN hosts.
  // A native lazy image avoids Next/Vercel host allow-list and cache issues.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      key={src}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn('object-cover', className)}
    />
  )
}
