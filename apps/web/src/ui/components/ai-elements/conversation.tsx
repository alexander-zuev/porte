import { ArrowDownIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { ComponentProps, ReactNode, RefObject } from 'react'

export type ConversationProps = {
  readonly scrollerRef: RefObject<HTMLDivElement | null>
  /** Total height of every row, measured or estimated; the scroller's runway. */
  readonly totalSize: number
  readonly className?: string
  readonly children: ReactNode
  /** The way back to the end, shown while the reader is above it. */
  readonly scrollButton?: ReactNode
}

/**
 * The transcript's scroller. Rows position themselves inside the runway, so
 * only what is near the viewport exists; the button floats over the frame.
 */
export const Conversation = ({
  scrollerRef,
  totalSize,
  className,
  children,
  scrollButton,
}: ConversationProps) => (
  <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
    <div
      ref={scrollerRef}
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
      role="log"
      tabIndex={0}
    >
      <div className="relative w-full" style={{ height: totalSize }}>
        {children}
      </div>
    </div>
    {scrollButton}
  </div>
)

export type ConversationRowProps = ComponentProps<'div'> & {
  readonly index: number
  /** Pixel offset of the row's top inside the runway. */
  readonly start: number
  /** The virtualizer's measurer; it reads `data-index` back from the element. */
  readonly measureRef: (element: HTMLDivElement | null) => void
}

/** One positioned row. Vertical padding is the gap between turns, measured with the row. */
export const ConversationRow = ({
  index,
  start,
  measureRef,
  className,
  style,
  ...props
}: ConversationRowProps) => (
  <div
    ref={measureRef}
    data-index={index}
    className={cn('absolute top-0 left-0 w-full px-3 py-4', className)}
    style={{ ...style, transform: `translateY(${String(start)}px)` }}
    {...props}
  />
)

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  title?: string
  description?: string
  icon?: ReactNode
}

export const ConversationEmptyState = ({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </>
    )}
  </div>
)

export type ConversationScrollButtonProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  readonly onClick: () => void
}

/** Back to the latest message. Render it only while the reader is above the end. */
export const ConversationScrollButton = ({
  className,
  onClick,
  ...props
}: ConversationScrollButtonProps) => (
  <Button
    className={cn(
      'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted',
      className,
    )}
    aria-label="Scroll to bottom"
    onClick={onClick}
    size="icon"
    type="button"
    variant="outline"
    {...props}
  >
    <ArrowDownIcon className="size-4" />
  </Button>
)
