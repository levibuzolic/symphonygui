import * as React from 'react'
import { cn } from '@shared/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return <div data-slot="card" ref={ref} className={cn('rounded-2xl border bg-card text-card-foreground shadow-[var(--shadow-panel)]', className)} {...props} />
})

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div data-slot="card-header" ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
})

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return <h3 data-slot="card-title" ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
})

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(function CardDescription(
  { className, ...props },
  ref,
) {
  return <p data-slot="card-description" ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
})

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div data-slot="card-content" ref={ref} className={cn('p-6 pt-0', className)} {...props} />
})

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div data-slot="card-footer" ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
})

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
