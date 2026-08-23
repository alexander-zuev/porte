import { PlusIcon } from '@phosphor-icons/react'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import { Skeleton } from '@web/ui/components/ui/skeleton.tsx'

/**
 * One waiting transcript: what the Mac said, and what was asked before it.
 *
 * Widths are written out rather than generated. A column of identical bars
 * reads as a chart, and fixing them by hand keeps the same shape on every
 * render instead of flickering to a new one.
 */
const MESSAGES = [
  { role: 'user', lines: ['w-2/3'] },
  { role: 'assistant', lines: ['w-full', 'w-11/12', 'w-3/4'] },
  { role: 'user', lines: ['w-1/2'] },
  { role: 'assistant', lines: ['w-5/6', 'w-full', 'w-2/3', 'w-4/5'] },
  { role: 'user', lines: ['w-3/5'] },
  { role: 'assistant', lines: ['w-full', 'w-3/4'] },
] as const

/**
 * The conversation before it has anything to say.
 *
 * Shaped like `ConversationChat` and filling the frame, rather than one spinner
 * in the middle of an empty page. The transcript then replaces this in place,
 * and the prompt sits where it will stay — disabled, because nothing can be
 * sent into a conversation that has not been read yet.
 *
 * Rows fill from the bottom, which is where the newest turn lands. The top
 * fades so the first one reads as the transcript continuing rather than as the
 * conversation starting there.
 */
export function ConversationSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <output
        aria-busy
        aria-label="Loading conversation"
        className="flex flex-1 flex-col justify-end gap-6 overflow-hidden px-1 py-4 [mask-image:linear-gradient(to_bottom,transparent,black_35%)] md:px-4"
      >
        {MESSAGES.map(({ role, lines }) =>
          role === 'user' ? (
            // The bubble is the bar: a filled block already reads as a short prompt.
            <Skeleton key={lines.join(' ')} className={`ml-auto h-11 rounded-lg ${lines[0]}`} />
          ) : (
            <div key={lines.join(' ')} className="flex max-w-[95%] flex-col gap-2">
              {lines.map((width) => (
                <Skeleton key={width} className={`h-3.5 ${width}`} />
              ))}
            </div>
          ),
        )}
      </output>

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={() => {
          // Nothing to send into: the transcript is still being read.
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea disabled placeholder="Reading this conversation…" />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton aria-label="Add attachment" disabled>
                <PlusIcon className="size-4" />
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit className="ml-auto" disabled />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}
