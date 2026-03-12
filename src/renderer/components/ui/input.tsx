import type { InputHTMLAttributes } from 'react'
import { cn } from '@shared/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/20',
        className,
      )}
      {...props}
    />
  )
}
