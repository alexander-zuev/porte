import type { ConversationId, PendingPermission } from '@porte/core/client'
import { useRelayConnection } from '@web/entities/host/relay-context.tsx'
import { useCallback, useEffect, useState } from 'react'

/** One question the agent is waiting on, and whether an answer is on its way. */
export type ConversationPermission = {
  readonly permission: PendingPermission
  readonly answering: boolean
}

/**
 * Permissions this conversation is waiting on, oldest first.
 *
 * Kept beside the chat rather than inside it. A chat's approval flow answers
 * yes or no to a tool it has already seen; a coding agent asks a named question
 * ("allow always?") and can ask it before the tool call it guards exists.
 */
export function usePendingPermissions(conversationId: ConversationId) {
  const relay = useRelayConnection()
  const [held, setHeld] = useState<Held>({ conversationId, waiting: [] })

  // Another conversation's questions are not this one's. Derived rather than
  // cleared in an effect, so the empty list is there in the same render.
  const waiting = held.conversationId === conversationId ? held.waiting : EMPTY

  // Held with the conversation it belongs to, so an event that arrives while
  // the screen is moving cannot land under the wrong one.
  const change = useCallback(
    (next: (waiting: readonly ConversationPermission[]) => readonly ConversationPermission[]) => {
      setHeld((current) => ({
        conversationId,
        waiting: next(current.conversationId === conversationId ? current.waiting : EMPTY),
      }))
    },
    [conversationId],
  )

  useEffect(
    () =>
      relay.onConversationEvent((event) => {
        if (event.conversationId !== conversationId) return

        if (event.type === 'permission.requested') {
          change((current) => [...current, { permission: event, answering: false }])
          return
        }

        if (event.type === 'permission.resolved') {
          change((current) =>
            current.filter((one) => one.permission.permissionId !== event.permissionId),
          )
          return
        }

        // A turn that ended answers nothing further, and a question nobody can
        // answer must not stay on screen.
        if (event.type === 'turn.finished' || event.type === 'conversation.failed') {
          change(() => EMPTY)
        }
      }),
    [relay, conversationId, change],
  )

  // The answer is removed by the `permission.resolved` event, not here: the Mac
  // is what decides a question is closed, and a failed answer must stay askable.
  const answer = useCallback(
    async (permission: PendingPermission, optionId: string) => {
      const mark = (answering: boolean) => {
        change((current) =>
          current.map((one) =>
            one.permission.permissionId === permission.permissionId ? { ...one, answering } : one,
          ),
        )
      }

      mark(true)
      try {
        await relay.request('permission.answer', {
          conversationId,
          turnId: permission.turnId,
          permissionId: permission.permissionId,
          optionId,
        })
      } catch {
        mark(false)
      }
    },
    [relay, conversationId, change],
  )

  return { waiting, answer }
}

/** Questions waiting, and the conversation that was asked them. */
type Held = {
  readonly conversationId: ConversationId
  readonly waiting: readonly ConversationPermission[]
}

/** One empty list, so a render that has nothing waiting is not a new render. */
const EMPTY: readonly ConversationPermission[] = []
