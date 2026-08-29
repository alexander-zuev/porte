import type { CommandHandler } from '@host/application/handlers/types.ts'
import { CANCEL_DEADLINE_MS } from '@host/application/turn-policy.ts'
import { createCommand, type CommandMap } from '@host/domain/messages/types.ts'

/**
 * Cancel the running turn. A turn that already ended is a no-op: cancel and
 * the natural end race, and both outcomes are final.
 *
 * Order matters: ACP wants pending permission requests answered as cancelled,
 * so the parked agent requests are released before `session/cancel`. The
 * outbox-driven release that follows is a no-op on an empty park. The deadline
 * then bounds an agent that never settles (`ExpireCancel`).
 */
export const cancelTurn: CommandHandler<CommandMap['CancelTurn'], void> = async (command, deps) => {
  const conversation = deps.conversations.get(command.conversationId)
  if (conversation.turn.state !== 'running' || conversation.turn.turnId !== command.turnId) return

  const pending = conversation.snapshot().pending
  conversation.cancelTurn(command.turnId)
  deps.conversations.save(conversation)
  for (const permission of pending.permissions) {
    deps.codingAgent.resolvePermission(permission.permissionId, { type: 'cancelled' })
  }
  for (const elicitation of pending.elicitations) {
    deps.codingAgent.resolveElicitation(elicitation.elicitationId, { type: 'cancel' })
  }
  await deps.codingAgent.cancel(command.conversationId)
  deps.scheduler.schedule(CANCEL_DEADLINE_MS, () => {
    deps.background.run(
      deps.bus.handle(
        createCommand('ExpireCancel', {
          conversationId: command.conversationId,
          turnId: command.turnId,
        }),
      ),
    )
  })
}
