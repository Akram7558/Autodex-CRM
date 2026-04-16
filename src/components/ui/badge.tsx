import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = {
  default:   'bg-gray-100 text-gray-600',
  success:   'bg-emerald-50 text-emerald-700',
  warning:   'bg-amber-50 text-amber-700',
  danger:    'bg-red-50 text-red-700',
  info:      'bg-blue-50 text-blue-700',
  purple:    'bg-violet-50 text-violet-700',
  indigo:    'bg-indigo-50 text-indigo-700',
  orange:    'bg-orange-50 text-orange-700',
} as const

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge, type BadgeProps }
