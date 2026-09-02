import { outcomeOfRow } from '@web/lib/conversation/conversation-state-messages.ts'
import {
  Conversation,
  ConversationRow,
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
import { Fragment, useRef } from 'react'

import {
  useTranscriptVirtualizer,
  type TranscriptRow,
} from '../hooks/use-transcript-virtualizer.ts'
import { groupParts, messageSettled, messageText } from '../models/tool-runs.ts'
import { ConversationContentPart } from './conversation-content-part.tsx'
import {
  ConversationTurnFailed,
  ConversationTurnStopped,
  NoMessagesYet,
  TurnPending,
} from './conversation-states.tsx'
import { MessageCopy } from './message-copy.tsx'
import { MessageFiles } from './message-files.tsx'
import { ToolRun } from './tool-run.tsx'

export type ConversationMessagesProps = {
  readonly messages: readonly UIMessage[]
  /** A turn is in flight. The answer's slot is held until the answer shows something. */
  readonly running: boolean
  /** The last turn stopped on its own. Shown under what it managed to say. */
  readonly error?: Error
  /** Older turns exist. Absent once the whole transcript has been read. */
  readonly onReadOlder: (() => void) | null
  readonly readingOlder: boolean
}

/** Everything the transcript lays out, in order: one row each, keyed for the virtualizer. */
type Row =
  | (TranscriptRow & { readonly kind: 'empty' })
  | (TranscriptRow & { readonly kind: 'older' })
  | (TranscriptRow & { readonly kind: 'message'; readonly message: UIMessage })
  | (TranscriptRow & { readonly kind: 'pending' })
  | (TranscriptRow & { readonly kind: 'failed'; readonly error: Error })

function transcriptRows({
  messages,
  running,
  error,
  onReadOlder,
}: ConversationMessagesProps): Row[] {
  const rows: Row[] = []
  if (messages.length === 0) rows.push({ kind: 'empty', key: 'empty' })
  if (onReadOlder !== null) rows.push({ kind: 'older', key: 'older' })
  // The stream's first chunks make an answer with nothing to draw. It gets no row,
  // so the slot below holds "Thinking…" in place until the first part lands.
  const shown = messages.filter(
    (message) => message.role !== 'assistant' || hasVisiblePart(message),
  )
  for (const message of shown) rows.push({ kind: 'message', key: message.id, message })
  if (running && shown.at(-1)?.role !== 'assistant') rows.push({ kind: 'pending', key: 'pending' })
  if (error !== undefined) rows.push({ kind: 'failed', key: 'failed', error })
  return rows
}

/** `step-start` draws nothing; every other part takes space. */
function hasVisiblePart(message: UIMessage): boolean {
  return message.parts.some((part) => part.type !== 'step-start')
}

/**
 * The transcript, rendered by AI Elements and windowed by row.
 *
 * Every part type is theirs. Porte decides only which part a canonical event
 * became, which happened before this component saw anything. Only rows near
 * the viewport are in the DOM; the rest is a measured runway.
 */
export function ConversationMessages(props: ConversationMessagesProps) {
  const rows = transcriptRows(props)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { virtualizer, runwayRef, following, jumpToLatest } = useTranscriptVirtualizer(
    rows,
    scrollerRef,
  )

  return (
    <Conversation
      className="min-h-0 flex-1"
      runwayRef={runwayRef}
      scrollButton={following ? null : <ConversationScrollButton onClick={jumpToLatest} />}
      scrollerRef={scrollerRef}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index]
        if (row === undefined) return null
        return (
          <ConversationRow
            key={item.key}
            index={item.index}
            measureRef={virtualizer.measureElement}
          >
            <TranscriptRowContent
              readingOlder={props.readingOlder}
              row={row}
              onReadOlder={props.onReadOlder}
            />
          </ConversationRow>
        )
      })}
    </Conversation>
  )
}

function TranscriptRowContent({
  row,
  onReadOlder,
  readingOlder,
}: {
  readonly row: Row
  readonly onReadOlder: (() => void) | null
  readonly readingOlder: boolean
}) {
  if (row.kind === 'empty') return <NoMessagesYet />
  if (row.kind === 'older') {
    return (
      <Button
        className="mx-auto flex min-h-11"
        disabled={readingOlder}
        variant="ghost"
        onClick={onReadOlder ?? undefined}
      >
        {readingOlder ? 'Reading…' : 'Earlier messages'}
      </Button>
    )
  }
  if (row.kind === 'pending') {
    return (
      <Message from="assistant">
        <MessageContent>
          <TurnPending />
        </MessageContent>
      </Message>
    )
  }
  if (row.kind === 'failed') {
    return (
      <Message from="assistant">
        <ConversationTurnFailed error={row.error} />
      </Message>
    )
  }
  const { message } = row
  return (
    <Message from={message.role}>
      <MessageContent>
        <MessageParts message={message} />
      </MessageContent>
      {outcomeOfRow(message) === 'cancelled' ? <ConversationTurnStopped /> : null}
      {/* Only once there are words to take: an answer still arriving, or one with no text, gets none. */}
      {message.role === 'assistant' && messageSettled(message) && messageText(message) !== '' ? (
        <MessageCopy text={messageText(message)} />
      ) : null}
    </Message>
  )
}

/** One message's parts, grouped as the transcript shows them. */
export function MessageParts({ message }: { readonly message: UIMessage }) {
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
        // The calls a thought made follow it, on every screen: the transcript reads the same anywhere.
        if (stretch.type === 'thought') {
          return (
            <Fragment key={key}>
              <ReasoningPart part={stretch.part} />
              <ToolRun calls={stretch.calls} settled={stretch.settled} />
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
}: {
  readonly part: Extract<UIMessage['parts'][number], { type: 'reasoning' }>
}) {
  return (
    <Reasoning isStreaming={part.state === 'streaming'}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  )
}

function MessagePart({ part }: { readonly part: UIMessage['parts'][number] }) {
  if (isTextUIPart(part)) return <MessageResponse>{part.text}</MessageResponse>
  if (isReasoningUIPart(part)) return <ReasoningPart part={part} />
  return <ConversationContentPart part={part} />
}
