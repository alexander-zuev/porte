import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import { cn } from '@web/lib/utils.ts'

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

/**
 * Opens and closes with one movement, wherever it is used.
 *
 * Height comes from Base UI's own measurement, so the panel can travel between
 * zero and its natural size. The fade is quicker than the slide: on the way out
 * the content is gone before the box finishes closing, which reads as one
 * movement rather than text squashed by a shrinking box.
 */
function CollapsibleContent({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        'h-[var(--collapsible-panel-height)] overflow-hidden',
        '[transition:height_150ms_ease-out,opacity_100ms_ease-out]',
        'data-starting-style:h-0 data-starting-style:opacity-0',
        'data-ending-style:h-0 data-ending-style:opacity-0',
        'motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
