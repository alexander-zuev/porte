import {
  createTurnId,
  type ConversationEvent,
  type ConversationId,
  type TurnId,
} from '@porte/core/client'
import type { RelayConnection } from '@web/entities/host/relay-connection.ts'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

import { createChunkStreamState, porteEventToChunks } from './porte-event-to-chunks.ts'

/**
 * One turn, as a chat transport.
 *
 * The relay answers a request and then pushes that turn's events to everyone
 * watching the conversation, so a turn is a request followed by a filtered
 * subscription. Both halves are here, and nothing else about the socket is.
 *
 * History is not a transport concern: `ChatTransport` sends and reconnects, and
 * the caller loads the transcript before the chat mounts.
 */
export class PorteChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly relay: RelayConnection,
    private readonly conversationId: ConversationId,
  ) {}

  sendMessages = async ({
    messages,
    abortSignal,
  }: {
    messages: UIMessage[]
    abortSignal: AbortSignal | undefined
  }): Promise<ReadableStream<UIMessageChunk>> => {
    const turnId = createTurnId()
    const prompt = lastUserText(messages)

    // The conversation must be open before it can run: reading it did not start
    // an agent, so the first prompt is what starts one.
    await this.relay.request('conversation.open', { conversationId: this.conversationId })

    // Stopping during the round-trip must not start work. A signal that fired
    // while we waited never fires again, so it is read rather than listened to.
    if (abortSignal?.aborted === true) return closedStream()

    await this.relay.request('turn.start', {
      conversationId: this.conversationId,
      turnId,
      prompt,
    })

    return this.streamTurn(turnId, abortSignal)
  }

  /**
   * Re-attach to a turn that outlived the socket.
   *
   * Opening reports whether one is running. `null` means the answer already
   * arrived while the browser was away, and the caller re-reads instead.
   */
  reconnectToStream = async (): Promise<ReadableStream<UIMessageChunk> | null> => {
    const opened = await this.relay.request('conversation.open', {
      conversationId: this.conversationId,
    })
    if (opened.turn.state !== 'running') return null

    // `turn.started` went out before the browser came back, and a chat cannot
    // read a stream that never opened one.
    return this.streamTurn(opened.turn.turnId, undefined, [
      { type: 'start' },
      { type: 'start-step' },
    ])
  }

  /** Everything one turn says, until it says it has finished. */
  private streamTurn(
    turnId: TurnId,
    abortSignal: AbortSignal | undefined,
    opening: UIMessageChunk[] = [],
  ) {
    const relay = this.relay
    const conversationId = this.conversationId
    const state = createChunkStreamState()

    const stopListening: (() => void)[] = []
    let closed = false

    const release = () => {
      closed = true
      for (const stop of stopListening) stop()
      stopListening.length = 0
    }

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of opening) controller.enqueue(chunk)

        const finish = () => {
          if (closed) return
          release()
          controller.close()
        }

        stopListening.push(
          relay.onConversationEvent((event) => {
            if (closed || !belongsToTurn(event, turnId)) return

            for (const chunk of porteEventToChunks(event, state)) controller.enqueue(chunk)
            if (event.type === 'turn.finished' || event.type === 'conversation.failed') finish()
          }),
        )

        // A dropped line ends the stream rather than leaving it open forever.
        // The turn may still be running on the Mac, and re-attaching is what
        // picks it up; what this must not do is wait on a socket that is gone.
        stopListening.push(
          relay.subscribe(() => {
            if (relay.getState() !== WebSocket.OPEN) finish()
          }),
        )

        // Cancelling stops the agent; the stream ends when the turn says so, so
        // the tokens already produced stay on screen.
        abortSignal?.addEventListener(
          'abort',
          () => {
            void relay.request('turn.cancel', { conversationId, turnId })
          },
          { once: true },
        )
      },

      // A reader that cancels never runs `close`, so unsubscribing lives here
      // too. Without it a stopped turn leaves a listener enqueueing into a
      // closed stream, and that throw starves every listener behind it.
      cancel: release,
    })
  }
}

/**
 * Whether one event is part of this turn.
 *
 * A conversation-scoped failure has no turn but ends any turn under it, so it
 * passes; every other conversation-scoped event is not this stream's business.
 */
function belongsToTurn(event: ConversationEvent, turnId: TurnId): boolean {
  return 'turnId' in event ? event.turnId === turnId : event.type === 'conversation.failed'
}

/** A turn that was stopped before it started. Nothing to say, so it says nothing. */
function closedStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.close()
    },
  })
}

/** The prompt is the text of the message the chat just added. */
function lastUserText(messages: readonly UIMessage[]): string {
  const last = messages.at(-1)
  if (last === undefined) return ''

  return last.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter((text) => text !== '')
    .join('\n')
}
