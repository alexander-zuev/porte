import { BrainIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useControllableState } from '@radix-ui/react-use-controllable-state'
import { cn } from '@web/lib/utils.ts'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@web/ui/components/ui/drawer.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import type { ComponentProps, ReactNode } from 'react'
import { createContext, memo, useContext, useEffect, useMemo, useRef } from 'react'

import { MessageResponse } from './message.tsx'
import { Shimmer } from './shimmer'

interface ReasoningContextValue {
  isStreaming: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  duration: number | undefined
  /** Below `md` the text opens in a sheet; above, it unfolds in place. */
  phone: boolean
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null)

export const useReasoning = () => {
  const context = useContext(ReasoningContext)
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning')
  }
  return context
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  duration?: number
}

const MS_IN_S = 1000

/**
 * What the agent thought, folded under one row.
 *
 * Closed until the reader opens it, streaming or not: a block that springs
 * open and snaps shut on its own moves the transcript twice per thought, and
 * on a phone it pushes the answer off the screen. The row itself says it is
 * thinking.
 */
export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = false,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const phone = usePhone()
    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: defaultOpen,
      onChange: onOpenChange,
      prop: open,
    })
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    })

    const startTimeRef = useRef<number | null>(null)

    // How long it thought, from the first streaming render to the last.
    useEffect(() => {
      if (isStreaming) {
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now()
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S))
        startTimeRef.current = null
      }
    }, [isStreaming, setDuration])

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, setIsOpen, phone }),
      [duration, isOpen, isStreaming, setIsOpen, phone],
    )

    if (phone) {
      return (
        <ReasoningContext.Provider value={contextValue}>
          <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <div className={cn('not-prose', className)}>{children}</div>
          </Drawer>
        </ReasoningContext.Provider>
      )
    }

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn('not-prose', className)}
          onOpenChange={setIsOpen}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    )
  },
)

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
}

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  // A span, not a p: the base `p` rule would lift this row to 16px above the tool rows.
  if (isStreaming || duration === 0) {
    return (
      <Shimmer as="span" duration={1}>
        Thinking...
      </Shimmer>
    )
  }
  if (duration === undefined) {
    return <span>Thought for a few seconds</span>
  }
  return <span>Thought for {duration} seconds</span>
}

const TRIGGER =
  'group flex min-h-11 w-full items-center gap-2 text-left text-muted-foreground text-sm transition-colors hover:text-foreground'

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, duration, phone } = useReasoning()
    const label = children ?? (
      <>
        <BrainIcon className="size-4" />
        {getThinkingMessage(isStreaming, duration)}
        {/* Same caret and timing as a project row, so one gesture is learnt once. */}
        <CaretRightIcon
          aria-hidden
          className="size-3 shrink-0 transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
        />
      </>
    )

    // The collapsible's own props have no meaning on a sheet trigger.
    if (phone) {
      return <DrawerTrigger className={cn(TRIGGER, className)}>{label}</DrawerTrigger>
    }
    return (
      <CollapsibleTrigger className={cn(TRIGGER, className)} {...props}>
        {label}
      </CollapsibleTrigger>
    )
  },
)

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string
}

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => {
  const { phone } = useReasoning()
  if (phone) {
    return (
      <DrawerContent>
        <DrawerTitle className="px-4" render={<h3>Thoughts</h3>} />
        <div className={cn('flex flex-col gap-4 px-4 text-sm text-muted-foreground', className)}>
          <MessageResponse>{children}</MessageResponse>
        </div>
      </DrawerContent>
    )
  }
  return (
    // The same rule a call hangs its result from, so a thought and the calls it made read as one family.
    <CollapsibleContent
      className={cn(
        'ml-2 flex flex-col border-l pt-1 pb-2 pl-4 text-sm text-muted-foreground outline-none',
        className,
      )}
      {...props}
    >
      <MessageResponse>{children}</MessageResponse>
    </CollapsibleContent>
  )
})

Reasoning.displayName = 'Reasoning'
ReasoningTrigger.displayName = 'ReasoningTrigger'
ReasoningContent.displayName = 'ReasoningContent'
