'use client'

import { motion } from 'framer-motion'
import { BottomNav } from './BottomNav'
import { cn } from '@/utils/cn'

interface AppLayoutProps {
  children: React.ReactNode
  className?: string
  title?: string
  subtitle?: string
  headerRight?: React.ReactNode
}

export function AppLayout({ children, className, title, subtitle, headerRight }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-cinema-darker">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-pink-600/5 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <main
        className={cn('relative z-10 px-4 pt-6 max-w-4xl mx-auto', className)}
        style={{ paddingBottom: 'max(7rem, calc(env(safe-area-inset-bottom) + 5.5rem))' }}
      >
        {(title || subtitle || headerRight) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-start justify-between"
          >
            <div>
              {title && (
                <h1 className="text-2xl font-bold text-white">{title}</h1>
              )}
              {subtitle && (
                <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>
              )}
            </div>
            {headerRight && <div>{headerRight}</div>}
          </motion.div>
        )}
        {children}
      </main>

      <BottomNav />
    </div>
  )
}
