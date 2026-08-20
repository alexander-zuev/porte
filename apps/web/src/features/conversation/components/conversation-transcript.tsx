import type { TranscriptItem } from '@web/entities/conversation/transcript.ts'
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
import { Tool, ToolContent, ToolHeader, ToolOutput } from '@web/ui/components/ai-elements/tool.tsx'

type ConversationTranscriptProps = {
  readonly items: readonly TranscriptItem[]
}

/** Render the ordered transcript projection for one conversation. */
export function ConversationTranscript({ items }: ConversationTranscriptProps) {
  return (
    <>
      {items.map((item) => (
        <TranscriptPart item={item} key={item.id} />
      ))}
    </>
  )
}

function TranscriptPart({ item }: { readonly item: TranscriptItem }) {
  if (item.kind === 'user') {
    return (
      <Message from="user">
        <MessageContent>{item.text}</MessageContent>
      </Message>
    )
  }
  if (item.kind === 'thought') {
    return (
      <Reasoning defaultOpen>
        <ReasoningTrigger />
        <ReasoningContent>{item.text}</ReasoningContent>
      </Reasoning>
    )
  }
  if (item.kind === 'agent') {
    return (
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>{item.text}</MessageResponse>
        </MessageContent>
      </Message>
    )
  }
  return (
    <Tool defaultOpen={item.status === 'running'}>
      <ToolHeader
        state={item.status === 'running' ? 'input-available' : 'output-available'}
        toolName={item.name}
        type="dynamic-tool"
      />
      <ToolContent>
        <ToolOutput errorText={undefined} output={item.summary} />
      </ToolContent>
    </Tool>
  )
}
