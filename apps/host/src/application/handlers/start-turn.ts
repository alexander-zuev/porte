import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import type { CommandDataMap } from '@host/domain/messages/commands.ts'
import { createCommand, type CommandMap } from '@host/domain/messages/types.ts'
import {
  CODING_AGENT_UNAVAILABLE_ERROR,
  INTERNAL_SERVER_ERROR,
  IsoDateTimeSchema,
  isClassifiedError,
} from '@porte/core/client'

/**
 * Begin the turn now, run the prompt in the background, and end the turn with
 * `FinishTurn` when the agent answers. The relay sees `turn.started` before this returns.
 *
 * The aggregate mints the turn id and dedupes the attempt; a repeated attempt
 * begins nothing and sends no second prompt. A session the process no longer
 * holds (cancel deadline, idle eviction) is loaded again first.
 */
export const startTurn: CommandHandler<CommandMap['StartTurn'], void> = async (command, deps) => {
  const conversation = deps.conversations.get(command.conversationId)
  if (!deps.codingAgent.isOpen(conversation.id)) {
    await deps.codingAgent.loadSession(conversation.id, conversation.cwd)
  }
  const wasRunning = conversation.turn.state === 'running'
  const turnId = conversation.beginTurn(command.attemptId, command.userMessage)
  const turnAfter: typeof conversation.turn = conversation.turn
  if (wasRunning || turnAfter.state !== 'running') {
    // The attempt repeated: the running prompt (or the finished turn) already answered it.
    deps.conversations.save(conversation)
    return
  }
  const promptIndex = conversation.promptIndexOf(turnId)
  conversation.touch(IsoDateTimeSchema.parse(deps.now().toISOString()))
  deps.conversations.save(conversation)

  const { conversationId } = command
  deps.background.run(
    deps.codingAgent.prompt(conversationId, turnId, promptIndex, command.userMessage.content).then(
      (result) => {
        const finish: CommandDataMap['FinishTurn'] = {
          conversationId,
          turnId,
          outcome: result.outcome,
        }
        if (result.usage !== undefined) finish.usage = result.usage
        return deps.bus.handle(createCommand('FinishTurn', finish))
      },
      (cause: unknown) =>
        deps.bus.handle(
          createCommand('FinishTurn', { conversationId, turnId, outcome: failedOutcome(cause) }),
        ),
    ),
  )
}

/** The relay contract allows three tags; anything not transient is internal. */
function failedOutcome(cause: unknown): TurnOutcome {
  const message = cause instanceof Error && cause.message.length > 0 ? cause.message : 'Turn failed'
  const transient = isClassifiedError(cause) && cause.classification === 'transient'
  return {
    type: 'failed',
    error: { _tag: transient ? CODING_AGENT_UNAVAILABLE_ERROR : INTERNAL_SERVER_ERROR, message },
  }
}
