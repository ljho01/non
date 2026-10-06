import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        outline: 'border border-border bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-foreground text-muted-foreground',
        destructive: 'text-destructive hover:bg-destructive/10',
      },
      size: { default: 'h-9 px-3', sm: 'h-7 px-2 text-xs', icon: 'size-8' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
