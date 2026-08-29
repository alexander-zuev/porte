import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import { codePlugin, TitledCodeBlock } from '@web/ui/components/ai-elements/code-block.tsx'
import { ButtonGroup, ButtonGroupText } from '@web/ui/components/ui/button-group.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@web/ui/components/ui/tooltip.tsx'
import type { UIMessage } from 'ai'
import type { ComponentProps, HTMLAttributes, ReactElement, ReactNode } from 'react'
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Streamdown } from 'streamdown'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role']
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full max-w-[95%] flex-col gap-2',
      from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
      className,
    )}
    {...props}
  />
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      // 16px between blocks, the same as between two paragraphs, so a tool run
      // reads as a block of the answer rather than something dropped between two.
      'flex min-w-0 max-w-full flex-col gap-4 overflow-hidden text-sm',
      // The prompt is a bubble, so it sizes to its words. The answer is the
      // page: it takes the column, or a tool call inside it shrinks to a chip.
      'group-[.is-user]:ml-auto group-[.is-user]:w-fit group-[.is-user]:rounded-2xl group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
      'group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageActionsProps = ComponentProps<'div'>

export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
)

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  className,
  variant = 'ghost',
  size = 'icon-sm',
  ...props
}: MessageActionProps) => {
  const button = (
    // Quiet until wanted: these sit under every answer, so full contrast on all
    // of them would compete with the answer itself for the eye.
    <Button
      className={cn(
        'text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none',
        className,
      )}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

interface MessageBranchContextType {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(null)

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext)

  if (!context) {
    throw new Error('MessageBranch components must be used within MessageBranch')
  }

  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch)
      onBranchChange?.(newBranch)
    },
    [onBranchChange],
  )

  const goToPrevious = useCallback(() => {
    const newBranch = currentBranch > 0 ? currentBranch - 1 : branches.length - 1
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const goToNext = useCallback(() => {
    const newBranch = currentBranch < branches.length - 1 ? currentBranch + 1 : 0
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious],
  )

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div className={cn('grid w-full gap-2 [&>div]:pb-0', className)} {...props} />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>

export const MessageBranchContent = ({ children, ...props }: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch()
  const childrenArray = useMemo(() => (Array.isArray(children) ? children : [children]), [children])

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray)
    }
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        'grid gap-2 overflow-hidden [&>div]:pb-0',
        index === currentBranch ? 'block' : 'hidden',
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>

export const MessageBranchSelector = ({ className, ...props }: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch()

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null
  }

  return (
    <ButtonGroup
      className={cn(
        '[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md',
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  )
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export const MessageBranchPrevious = ({ children, ...props }: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <CaretLeftIcon size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({ children, ...props }: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <CaretRightIcon size={14} />}
    </Button>
  )
}

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>

export const MessageBranchPage = ({ className, ...props }: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <ButtonGroupText
      className={cn('border-none bg-transparent text-muted-foreground shadow-none', className)}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  )
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>

// Only the highlighter. Math, mermaid, and CJK are bundles nothing here has needed.
const STREAMDOWN_PLUGINS = { code: codePlugin }

/** A fence in markdown, in the same block a tool call uses, so the page has one kind of code. */
const MarkdownCodeBlock = ({ className, children }: ComponentProps<'code'>) => {
  const language = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? 'text'
  return (
    <TitledCodeBlock code={codeText(children).replace(/\n$/, '')} language={language} title={language} />
  )
}

function codeText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(codeText).join('')
  return ''
}

// `inlineCode` stays Streamdown's own; only fences come here.
const STREAMDOWN_COMPONENTS = { code: MarkdownCodeBlock }

/** Every markdown on the page: answers, reasoning, plans, tool text. One highlighter, one theme. */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      components={STREAMDOWN_COMPONENTS}
      plugins={STREAMDOWN_PLUGINS}
      shikiTheme={codePlugin.getThemes()}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && nextProps.isAnimating === prevProps.isAnimating,
)

MessageResponse.displayName = 'MessageResponse'

export type MessageToolbarProps = ComponentProps<'div'>

export const MessageToolbar = ({ className, children, ...props }: MessageToolbarProps) => (
  <div className={cn('mt-4 flex w-full items-center justify-between gap-4', className)} {...props}>
    {children}
  </div>
)
