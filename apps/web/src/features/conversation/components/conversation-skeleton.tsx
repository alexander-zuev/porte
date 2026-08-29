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
const TURNS = [
  { prompt: 'w-2/3', response: ['w-full', 'w-11/12', 'w-3/4'] },
  { prompt: 'w-1/2', response: ['w-5/6', 'w-full', 'w-2/3', 'w-4/5'] },
  { prompt: 'w-3/5', response: ['w-full', 'w-3/4'] },
  { prompt: 'w-2/5', response: ['w-11/12', 'w-4/5', 'w-2/3'] },
  { prompt: 'w-3/4', response: ['w-full', 'w-5/6', 'w-1/2'] },
  { prompt: 'w-1/3', response: ['w-4/5', 'w-full', 'w-3/5', 'w-3/4'] },
  { prompt: 'w-4/5', response: ['w-11/12', 'w-2/3'] },
  { prompt: 'w-1/2', response: ['w-full', 'w-3/4', 'w-5/6'] },
] as const

/**
 * The conversation before it has anything to say.
 *
 * Shaped like `ConversationChat` and filling the frame, rather than one spinner
 * in the middle of an empty page. The transcript then replaces this in place,
 * and the prompt sits where it will stay — disabled, because nothing can be
 * sent into a conversation that has not been read yet.
 *
 * Rows start below the header like the project list. Extra turns continue past
 * the frame, and the bottom fade shows that more content is still loading.
 */
export function ConversationSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <output
        aria-busy
        aria-label="Loading conversation"
        className="flex flex-1 flex-col gap-6 overflow-hidden px-1 py-4 [mask-image:linear-gradient(to_bottom,black_65%,transparent)] md:px-4"
      >
        {TURNS.flatMap(({ prompt, response }, turnIndex) => [
          // The bubble is the bar: a filled block already reads as a short prompt.
          <Skeleton
            key={`prompt-${String(turnIndex)}`}
            className={`ml-auto h-11 rounded-lg ${prompt}`}
          />,
          <div key={`response-${String(turnIndex)}`} className="flex max-w-[95%] flex-col gap-2">
            {response.map((width, lineIndex) => (
              <Skeleton key={`${width}-${String(lineIndex)}`} className={`h-3.5 ${width}`} />
            ))}
          </div>,
        ])}
      </output>

      <PromptInput
        className="mb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={() => {
          // Nothing to send into: the transcript is still being read.
        }}
      >
        <PromptInputBody>
          {/* The same words as the live box: the state is "not yet", not a message to read. */}
          <PromptInputTextarea disabled placeholder="Message Grok…" />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton
                aria-label="Add attachment"
                className="rounded-full"
                disabled
                size="icon-sm"
                variant="outline"
              >
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
