'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { cn } from '@/utils/cn'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

export function LoadingSpinner({ size = 'md', className, text }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={cn(
          'rounded-full border-white/20 border-t-blue-500 animate-spin',
          sizes[size]
        )}
      />
      {text && <p className="text-sm text-white/50">{text}</p>}
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="min-h-screen bg-cinema-darker flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5"
      >
        <motion.div
          animate={{ opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/logo.png"
            alt="MovieLogger"
            width={260}
            height={170}
            priority
            unoptimized
            className="w-[220px] sm:w-[260px] h-auto"
          />
        </motion.div>
        <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-blue-500 animate-spin" />
      </motion.div>
    </div>
  )
}
