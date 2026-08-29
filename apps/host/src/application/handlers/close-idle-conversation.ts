import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import { notYetImplemented } from '@porte/core/client'

/**
 * Bound the Host's memory: close a conversation that has had no running turn for
 * the idle window. A returning viewer re-attaches and the session reloads.
 */
export const closeIdleConversation: CommandHandler<
  CommandMap['CloseIdleConversation'],
  void
> = async (command) => {
  // TODO(step 2): no-op when a turn runs or the last turn ended inside the window; otherwise `CloseConversation`.
  void command
  return notYetImplemented('step 2')
}
