'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  List,
  PlusCircle,
  TrendingUp,
  User,
} from 'lucide-react'
import { cn } from '@/utils/cn'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/my-list', icon: List, label: 'My List' },
  { href: '/add-entry', icon: PlusCircle, label: 'Add' },
  { href: '/progress', icon: TrendingUp, label: 'Progress' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <motion.nav
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
        className="pointer-events-auto mx-auto max-w-sm"
      >
        <div className="flex items-center justify-around bg-[#0A0A14]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2 py-2 shadow-2xl shadow-black/50">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className="relative flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200 group"
              >
                {isActive && (
                  <motion.div
                    layoutId="bottomNavActive"
                    className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl border border-blue-500/20"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon
                  className={cn(
                    'relative z-10 w-5 h-5 transition-all duration-200',
                    isActive
                      ? 'text-blue-400'
                      : 'text-white/40 group-hover:text-white/70'
                  )}
                />
                <span
                  className={cn(
                    'relative z-10 text-[10px] font-medium transition-all duration-200',
                    isActive ? 'text-blue-400' : 'text-white/40 group-hover:text-white/70'
                  )}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </motion.nav>
    </div>
  )
}
