import { cn } from '@web/lib/utils.ts'
import { MessageResponse } from '@web/ui/components/ai-elements/message.tsx'
import { Alert, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { ToolUIPart } from 'ai'
import type { ComponentProps, ReactNode } from 'react'
import { createContext, useContext, useMemo } from 'react'

type ToolUIPartApproval =
  | {
      id: string
      approved?: never
      reason?: never
    }
  | {
      id: string
      approved: boolean
      reason?: string
    }
  | {
      id: string
      approved: true
      reason?: string
    }
  | {
      id: string
      approved: true
      reason?: string
    }
  | {
      id: string
      approved: false
      reason?: string
    }
  | undefined

interface ConfirmationContextValue {
  approval: ToolUIPartApproval
  state: ToolUIPart['state']
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null)

const useConfirmation = () => {
  const context = useContext(ConfirmationContext)

  if (!context) {
    throw new Error('Confirmation components must be used within Confirmation')
  }

  return context
}

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: ToolUIPartApproval
  state: ToolUIPart['state']
}

export const Confirmation = ({ className, approval, state, ...props }: ConfirmationProps) => {
  const contextValue = useMemo(() => ({ approval, state }), [approval, state])

  if (!approval || state === 'input-streaming' || state === 'input-available') {
    return null
  }

  return (
    <ConfirmationContext.Provider value={contextValue}>
      <Alert className={cn('flex flex-col gap-2', className)} {...props} />
    </ConfirmationContext.Provider>
  )
}

export type ConfirmationTitleProps = Omit<ComponentProps<typeof AlertTitle>, 'children'> & {
  /** What the agent asked to do, as the agent wrote it. */
  children: string
}

/**
 * The question itself, in title type rather than description type.
 *
 * Rendered as markdown because that is how the agent writes it: the command or
 * path arrives already fenced in backticks, so the code span is marked at the
 * source and nothing here has to guess what kind of thing it is.
 */
export const ConfirmationTitle = ({ className, children, ...props }: ConfirmationTitleProps) => (
  // A title often names a path in inline code, which has no natural break.
  <AlertTitle className={cn('wrap-anywhere text-foreground', className)} {...props}>
    <MessageResponse>{children}</MessageResponse>
  </AlertTitle>
)

export interface ConfirmationRequestProps {
  children?: ReactNode
}

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
  const { state } = useConfirmation()

  // Only show when approval is requested
  if (state !== 'approval-requested') {
    return null
  }

  return children
}

export interface ConfirmationAcceptedProps {
  children?: ReactNode
}

export const ConfirmationAccepted = ({ children }: ConfirmationAcceptedProps) => {
  const { approval, state } = useConfirmation()

  // Only show when approved and in response states
  if (
    !approval?.approved ||
    (state !== 'approval-responded' && state !== 'output-denied' && state !== 'output-available')
  ) {
    return null
  }

  return children
}

export interface ConfirmationRejectedProps {
  children?: ReactNode
}

export const ConfirmationRejected = ({ children }: ConfirmationRejectedProps) => {
  const { approval, state } = useConfirmation()

  // Only show when rejected and in response states
  if (
    approval?.approved !== false ||
    (state !== 'approval-responded' && state !== 'output-denied' && state !== 'output-available')
  ) {
    return null
  }

  return children
}

export type ConfirmationActionsProps = ComponentProps<'div'>

export const ConfirmationActions = ({ className, ...props }: ConfirmationActionsProps) => {
  const { state } = useConfirmation()

  // Only show when approval is requested
  if (state !== 'approval-requested') {
    return null
  }

  return (
    <div className={cn('flex items-center justify-end gap-2 self-end', className)} {...props} />
  )
}

export type ConfirmationActionProps = ComponentProps<typeof Button>

/** Neutral by default: a primary fill here would push one answer over the rest. */
export const ConfirmationAction = ({ variant = 'outline', ...props }: ConfirmationActionProps) => (
  <Button className="h-8 px-3 text-sm" type="button" variant={variant} {...props} />
)
