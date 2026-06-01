'use client'

import { MediaStatus, MEDIA_STATUS_LABELS, MEDIA_STATUS_COLORS } from '@/types/media'
import { cn } from '@/utils/cn'

interface StatusBadgeProps {
  status: MediaStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border',
        MEDIA_STATUS_COLORS[status],
        className
      )}
    >
      {MEDIA_STATUS_LABELS[status]}
    </span>
  )
}
