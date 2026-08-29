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
import { isFileUIPart, isReasoningUIPart, isTextUIPart, type UIMessage } from 'ai'

import { groupParts } from '../models/tool-runs.ts'
import { ConversationContentPart } from './conversation-content-part.tsx'
import { NoMessagesYet, TurnPending } from './conversation-states.tsx'
import { MessageFiles } from './message-files.tsx'
import { ToolRun } from './tool-run.tsx'

export type ConversationMessagesProps = {
  readonly messages: readonly UIMessage[]
  /** A prompt is sent and no part of the answer has arrived. */
  readonly pending: boolean
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
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

function MessageParts({ message }: { readonly message: UIMessage }) {
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
      {groupParts(message.parts.filter((part) => !isFileUIPart(part))).map((stretch, index) =>
        stretch.type === 'run' ? (
          <ToolRun
            key={stretch.calls[0]?.part.toolCallId ?? String(index)}
            calls={stretch.calls}
            settled={stretch.settled}
          />
        ) : stretch.part.type === 'source-url' ? null : (
          <MessagePart key={`${message.id}-${String(index)}`} part={stretch.part} />
        ),
      )}
    </>
  )
}

function MessagePart({ part }: { readonly part: UIMessage['parts'][number] }) {
  if (isTextUIPart(part)) return <MessageResponse>{part.text}</MessageResponse>

  // Per part, not per turn: one global flag re-opens and re-times every stored
  // block on the screen the moment any prompt is sent.
  if (isReasoningUIPart(part)) {
    return (
      <Reasoning isStreaming={part.state === 'streaming'}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    )
  }

  return <ConversationContentPart part={part} />
}
