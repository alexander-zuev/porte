import { CheckIcon, SparkleIcon } from '@phosphor-icons/react'
import { Button } from '@web/ui/components/ui/button.tsx'
import { useEffect, useRef, useState } from 'react'

const COPIED_RESET_MS = 2000

export type CopyPromptProps = {
  /** The line the person pastes into their agent. */
  readonly prompt: string
  readonly className?: string
}

/**
 * Copies one line for an AI agent, beside the command a person would type.
 *
 * The same shape as the "Copy prompt" on developers.cloudflare.com: the agent
 * fetches a page of steps and runs them, so the person never reads the steps.
 * The label stays put on success; only the icon says it happened.
 */
export function CopyPrompt({ prompt, className }: CopyPromptProps) {
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
      await navigator.clipboard.writeText(prompt)
    } catch {
      // Clipboard is unavailable or denied; nothing to show for it.
      return
    }
    setCopied(true)
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => {
      setCopied(false)
    }, COPIED_RESET_MS)
  }

  return (
    // Filled, the same surface as the command box beside it: one instrument, one action.
    <Button
      aria-live="polite"
      className={className}
      variant="secondary"
      onClick={() => {
        void copy()
      }}
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <SparkleIcon data-icon="inline-start" />}
      Copy prompt
      <span className="sr-only">{copied ? ' — copied' : ' for your agent'}</span>
    </Button>
  )
}
