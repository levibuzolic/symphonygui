import type { HTMLAttributes } from 'react'
import { cn } from '@shared/utils'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300',
        className,
      )}
      {...props}
    />
  )
}
