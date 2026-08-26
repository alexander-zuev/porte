import { ArrowElbowDownRightIcon, CaretRightIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import type { ComponentProps, ReactNode } from 'react'
import { isValidElement } from 'react'

import { CodeBlock } from './code-block'

export type ToolProps = ComponentProps<typeof Collapsible>

/**
 * One call the agent made, as a line in the answer rather than a card in it.
 *
 * A border and a fill would make every call a box on a page that is otherwise
 * plain text, and a turn can hold several. The dot carries the state, so the
 * row needs nothing drawn around it.
 */
export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn('group not-prose w-full', className)} {...props} />
)

export type ToolPart = ToolUIPart | DynamicToolUIPart

export type ToolHeaderProps = {
  title?: string
  className?: string
} & (
  | { type: ToolUIPart['type']; state: ToolUIPart['state']; toolName?: never }
  | {
      type: DynamicToolUIPart['type']
      state: DynamicToolUIPart['state']
      toolName: string
    }
)

const statusLabels: Record<ToolPart['state'], string> = {
  'approval-requested': 'Awaiting approval',
  'approval-responded': 'Responded',
  'input-available': 'Running',
  'input-streaming': 'Pending',
  'output-available': 'Completed',
  'output-denied': 'Denied',
  'output-error': 'Error',
}

/**
 * One dot, not seven words: a call is idle, working, done, or broken.
 *
 * Only a call that is moving right now blinks — running, or stopped waiting for
 * an answer. Everything settled holds still, so motion on the screen always
 * means work in flight. Colour is spent on the two outcomes alone.
 */
const statusDots: Record<ToolPart['state'], string> = {
  'approval-requested': 'bg-muted-foreground animate-pulse',
  'approval-responded': 'bg-muted-foreground',
  'input-available': 'bg-muted-foreground animate-pulse',
  'input-streaming': 'bg-muted-foreground/40',
  'output-available': 'bg-status-success',
  'output-denied': 'bg-destructive',
  'output-error': 'bg-destructive',
}

/** The dot is the whole status. The word stays for anyone not reading colour. */
export const getStatusDot = (status: ToolPart['state']) => (
  <span className="flex size-4 shrink-0 items-center justify-center">
    <span aria-hidden className={cn('size-2 rounded-full', statusDots[status])} />
    <span className="sr-only">{statusLabels[status]}</span>
  </span>
)

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName = type === 'dynamic-tool' ? toolName : type.split('-').slice(1).join('-')

  return (
    <CollapsibleTrigger
      className={cn(
        'group flex min-h-11 w-full items-center gap-2 text-left text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      {getStatusDot(state)}
      <span className="min-w-0 truncate font-mono text-sm">{title ?? derivedName}</span>
      <CaretRightIcon
        aria-hidden
        className="size-3 shrink-0 transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  )
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>

// Indented under the call rather than boxed: the rule says these belong to the
// row above without drawing a card around them.
export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn('ml-2 space-y-3 border-l pb-2 pl-4 text-foreground outline-none', className)}
    {...props}
  />
)

export type ToolInputProps = ComponentProps<'div'> & {
  input: ToolPart['input']
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn('space-y-2 overflow-hidden', className)} {...props}>
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Parameters</p>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
)

export type ToolOutputProps = ComponentProps<'div'> & {
  output: ToolPart['output']
  errorText: ToolPart['errorText']
}

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null
  }

  // What came back from the call it hangs under, so the elbow says so rather
  // than a second caps label repeating what the status dot already reported.
  if (errorText !== undefined && errorText !== '') {
    return (
      <div className={cn('flex gap-2 text-destructive-muted-foreground', className)} {...props}>
        <ArrowElbowDownRightIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <small className="min-w-0 break-words">{errorText}</small>
      </div>
    )
  }

  let Output = <div>{output as ReactNode}</div>

  if (typeof output === 'object' && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
  } else if (typeof output === 'string') {
    Output = <CodeBlock code={output} language="json" />
  }

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Result</p>
      <div className="overflow-x-auto rounded-md bg-muted/50 text-xs text-foreground [&_table]:w-full">
        {Output}
      </div>
    </div>
  )
}
