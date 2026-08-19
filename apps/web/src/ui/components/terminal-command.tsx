import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '#/lib/utils.ts'
import { TextType } from '#/ui/components/react-bits/text-type.tsx'
import { Button } from '#/ui/components/ui/button.tsx'

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
      <code className="flex-1 overflow-x-auto bg-transparent p-0 text-left whitespace-nowrap">
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
