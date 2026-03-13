import * as React from 'react'
import { cn } from '@shared/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      data-slot="input"
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm transition-[color,box-shadow,border-color] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
})

export { Input }
