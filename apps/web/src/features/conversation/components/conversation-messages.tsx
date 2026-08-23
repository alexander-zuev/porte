import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@web/ui/components/ai-elements/tool.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { isDynamicToolUIPart, isReasoningUIPart, isTextUIPart, type UIMessage } from 'ai'

import { ConversationContentPart } from './conversation-content-part.tsx'
import { ConversationToolOutput } from './conversation-tool-output.tsx'

export type ConversationMessagesProps = {
  readonly messages: readonly UIMessage[]
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
  onReadOlder,
  readingOlder,
}: ConversationMessagesProps) {
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="gap-6 px-1 py-4 md:px-4">
        {messages.length === 0 ? (
          <ConversationEmptyState
            description="Send a prompt and it runs on your Mac."
            title="Nothing here yet"
          />
        ) : null}

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
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

function MessageParts({ message }: { readonly message: UIMessage }) {
  const sources = message.parts.filter((part) => part.type === 'source-url')
  return (
    <>
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
      {message.parts.map((part, index) =>
        part.type === 'source-url' ? null : (
          <MessagePart key={`${message.id}-${String(index)}`} part={part} />
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

  if (isDynamicToolUIPart(part)) {
    return (
      <Tool>
        <ToolHeader state={part.state} toolName={part.toolName} type={part.type} />
        <ToolContent>
          <ToolInput input={part.input} />
          {part.state === 'output-available' ? (
            <ConversationToolOutput output={part.output} />
          ) : null}
          {part.state === 'output-error' ? (
            <ToolOutput errorText={part.errorText} output={undefined} />
          ) : null}
        </ToolContent>
      </Tool>
    )
  }

  return <ConversationContentPart part={part} />
}
