/* The command scrolls sideways on a phone, so a keyboard has to reach it and
   move it. This rule forbids the tab stop that WCAG 2.1.1 requires here. */
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { cn } from '@web/lib/utils.ts'
import { TextType } from '@web/ui/components/react-bits/text-type.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { useEffect, useRef, useState } from 'react'

const COPIED_RESET_MS = 2000

/** Props for a terminal command the reader runs on their own machine. */
export type TerminalCommandProps = {
  readonly command: string
  /** Type the command out on first paint instead of showing it at once. */
  readonly typed?: boolean
  readonly className?: string
}

/** Show one shell command and copy it to the clipboard on request. */
export function TerminalCommand({ command, typed = false, className }: TerminalCommandProps) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef(0)

  useEffect(
    () => () => {
      window.clearTimeout(resetTimer.current)
    },
    [],
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      // Clipboard is unavailable or denied; the command stays selectable.
      return
    }
    setCopied(true)
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => {
      setCopied(false)
    }, COPIED_RESET_MS)
  }

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border border-border bg-surface py-2 pr-2 pl-4',
        className,
      )}
    >
      <code
        tabIndex={0}
        className="flex-1 overflow-x-auto rounded-sm bg-transparent p-0 text-left whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <span aria-hidden className="text-muted-foreground select-none">
          ${' '}
        </span>
        {typed ? <TextType text={command} /> : command}
      </code>
      <Button
        aria-label={copied ? 'Command copied' : `Copy ${command}`}
        size="icon-sm"
        variant="ghost"
        onClick={() => {
          void copy()
        }}
      >
        {copied ? <CheckIcon className="text-status-success-muted-foreground" /> : <CopyIcon />}
      </Button>
    </div>
  )
}
