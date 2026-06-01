import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-blue-600/20 text-blue-400 border-blue-500/20',
        secondary: 'border-transparent bg-white/10 text-white/70',
        destructive: 'border-transparent bg-red-600/20 text-red-400',
        outline: 'text-white/70 border-white/20',
        success: 'border-transparent bg-emerald-600/20 text-emerald-400 border-emerald-500/20',
        warning: 'border-transparent bg-amber-600/20 text-amber-400 border-amber-500/20',
        purple: 'border-transparent bg-purple-600/20 text-purple-400 border-purple-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
