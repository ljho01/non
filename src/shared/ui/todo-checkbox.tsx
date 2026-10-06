import { Button } from './button'
import { Check } from './icon'
import { cn } from '@/shared/lib/utils'

export function TodoCheckbox({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Button
      unstyled
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // Centers the 1rem circle on a text-sm first line in stacked rows.
        'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-muted-foreground/50 hover:border-foreground',
        checked && 'border-primary bg-primary text-primary-foreground',
        className,
      )}
    >
      {checked && <Check className="size-3" />}
    </Button>
  )
}
