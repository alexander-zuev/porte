import type { PermissionRequest, TranscriptItem } from '#/entities/session/transcript.ts'
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '#/ui/components/ai-elements/confirmation.tsx'
import { Message, MessageContent, MessageResponse } from '#/ui/components/ai-elements/message.tsx'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '#/ui/components/ai-elements/reasoning.tsx'
import { Tool, ToolContent, ToolHeader, ToolOutput } from '#/ui/components/ai-elements/tool.tsx'

type SessionTranscriptProps = {
  readonly items: readonly TranscriptItem[]
  readonly permission: PermissionRequest | undefined
  readonly onAnswerPermission: (optionId: string) => void
}

export function SessionTranscript({
  items,
  permission,
  onAnswerPermission,
}: SessionTranscriptProps) {
  return (
    <>
      {items.map((item) => (
        <TranscriptPart item={item} key={item.id} />
      ))}
      {permission ? (
        <PermissionConfirmation onAnswer={onAnswerPermission} request={permission} />
      ) : null}
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

function PermissionConfirmation({
  request,
  onAnswer,
}: {
  readonly request: PermissionRequest
  readonly onAnswer: (optionId: string) => void
}) {
  return (
    <Confirmation approval={{ id: request.id }} state="approval-requested">
      <ConfirmationTitle>
        <ConfirmationRequest>
          {request.title}
          <span className="mt-2 block">{request.detail}</span>
        </ConfirmationRequest>
      </ConfirmationTitle>
      <ConfirmationActions>
        {request.options.map((option) => (
          <ConfirmationAction
            key={option.id}
            onClick={() => {
              onAnswer(option.id)
            }}
            variant={option.id.includes('reject') ? 'outline' : 'default'}
          >
            {option.label}
          </ConfirmationAction>
        ))}
      </ConfirmationActions>
    </Confirmation>
  )
}
