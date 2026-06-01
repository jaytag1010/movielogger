'use client'

import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/utils/cn'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  glow?: boolean
  gradient?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function GlassCard({
  className,
  children,
  glow = false,
  gradient = false,
  padding = 'md',
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm',
        glow && 'shadow-neon',
        gradient && 'bg-gradient-to-br from-blue-600/10 to-purple-600/10',
        {
          'p-0': padding === 'none',
          'p-3': padding === 'sm',
          'p-5': padding === 'md',
          'p-7': padding === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
