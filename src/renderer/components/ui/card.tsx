import type { HTMLAttributes } from 'react'
import { cn } from '@shared/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-white/10 bg-[rgba(9,9,11,0.94)]', className)} {...props} />
}
