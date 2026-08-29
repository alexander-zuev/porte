import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@web/ui/components/ai-elements/conversation.tsx'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@web/ui/components/ai-elements/message.tsx'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@web/ui/components/ai-elements/reasoning.tsx'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@web/ui/components/ai-elements/sources.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import { isFileUIPart, isReasoningUIPart, isTextUIPart, type UIMessage } from 'ai'
import { Fragment, type ReactNode } from 'react'

import { groupParts, messageSettled, messageText } from '../models/tool-runs.ts'
import { ConversationContentPart } from './conversation-content-part.tsx'
import { ConversationTurnFailed, NoMessagesYet, TurnPending } from './conversation-states.tsx'
import { MessageCopy } from './message-copy.tsx'
import { MessageFiles } from './message-files.tsx'
import { ToolRun } from './tool-run.tsx'

export type ConversationMessagesProps = {
  readonly messages: readonly UIMessage[]
  /** A prompt is sent and no part of the answer has arrived. */
  readonly pending: boolean
  /** The last turn stopped on its own. Shown under what it managed to say. */
  readonly error?: Error
  /** Older turns exist. Absent once the whole transcript has been read. */
  readonly onReadOlder: (() => void) | null
  readonly readingOlder: boolean
}

/**
 * The transcript, rendered by AI Elements.
 *
 * Every part type is theirs. Porte decides only which part a canonical event
 * became, which happened before this component saw anything.
 */
export function ConversationMessages({
  messages,
  pending,
  error,
  onReadOlder,
  readingOlder,
}: ConversationMessagesProps) {
  return (
    <Conversation className="min-h-0 flex-1">
      {/* 32px between turns; the composer below uses the same 12px inset, so text edges line up. */}
      <ConversationContent className="gap-8 px-3 py-4">
        {messages.length === 0 ? <NoMessagesYet /> : null}

        {onReadOlder === null ? null : (
          <Button
            className="mx-auto min-h-11"
            disabled={readingOlder}
            variant="ghost"
            onClick={onReadOlder}
          >
            {readingOlder ? 'Reading…' : 'Earlier messages'}
          </Button>
        )}

        {messages.map((message) => (
          <Message key={message.id} from={message.role}>
            <MessageContent>
              <MessageParts message={message} />
            </MessageContent>
            {/* Only once there are words to take: an answer still arriving, or one with no text, gets none. */}
            {message.role === 'assistant' &&
            messageSettled(message) &&
            messageText(message) !== '' ? (
              <MessageCopy text={messageText(message)} />
            ) : null}
          </Message>
        ))}

        {/* The answer's slot, held until the answer takes it. */}
        {pending ? (
          <Message from="assistant">
            <MessageContent>
              <TurnPending />
            </MessageContent>
          </Message>
        ) : null}

        {error === undefined ? null : (
          <Message className="-mt-4" from="assistant">
            <ConversationTurnFailed error={error} />
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

function MessageParts({ message }: { readonly message: UIMessage }) {
  const phone = usePhone()
  const sources = message.parts.filter((part) => part.type === 'source-url')
  const files = message.parts.filter(isFileUIPart)
  return (
    <>
      {files.length === 0 ? null : <MessageFiles files={files} />}
      {sources.length === 0 ? null : (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source key={source.sourceId} href={source.url}>
                {source.title ?? source.url}
              </Source>
            ))}
          </SourcesContent>
        </Sources>
      )}
      {groupParts(message.parts.filter((part) => !isFileUIPart(part))).map((stretch, index) => {
        const key = `${message.id}-${String(index)}`
        if (stretch.type === 'run') {
          return <ToolRun key={key} calls={stretch.calls} settled={stretch.settled} />
        }
        // On a phone the calls live in the thought's sheet; on a desktop they follow it.
        if (stretch.type === 'thought') {
          const run = <ToolRun calls={stretch.calls} settled={stretch.settled} />
          return (
            <Fragment key={key}>
              <ReasoningPart part={stretch.part} steps={run} />
              {phone ? null : run}
            </Fragment>
          )
        }
        if (stretch.part.type === 'source-url') return null
        return <MessagePart key={key} part={stretch.part} />
      })}
    </>
  )
}

/** Per part, not per turn: one global flag would re-time every stored block when a prompt is sent. */
function ReasoningPart({
  part,
  steps,
}: {
  readonly part: Extract<UIMessage['parts'][number], { type: 'reasoning' }>
  readonly steps?: ReactNode
}) {
  return (
    <Reasoning isStreaming={part.state === 'streaming'}>
      <ReasoningTrigger />
      <ReasoningContent steps={steps}>{part.text}</ReasoningContent>
    </Reasoning>
  )
}

function MessagePart({ part }: { readonly part: UIMessage['parts'][number] }) {
  if (isTextUIPart(part)) return <MessageResponse>{part.text}</MessageResponse>
  if (isReasoningUIPart(part)) return <ReasoningPart part={part} />
  return <ConversationContentPart part={part} />
}
