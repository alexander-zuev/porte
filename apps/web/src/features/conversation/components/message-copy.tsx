import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import {
  MessageAction,
  MessageActions,
  MessageToolbar,
} from '@web/ui/components/ai-elements/message.tsx'
import { useEffect, useRef, useState } from 'react'

const COPIED_FOR_MS = 2000

/** The one action under an answer: take its words. Quiet, so it does not compete with them. */
export function MessageCopy({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    <MessageToolbar className="mt-0">
      <MessageActions>
        <MessageAction
          label={copied ? 'Copied' : 'Copy answer'}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              timer.current = window.setTimeout(() => {
                setCopied(false)
              }, COPIED_FOR_MS)
            })
          }}
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        </MessageAction>
      </MessageActions>
    </MessageToolbar>
  )
}
