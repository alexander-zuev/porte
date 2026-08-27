import { HandlerNotImplementedError } from '@host/application/errors/message-bus-errors.ts'
import type { AnyMessage } from '@host/domain/messages/base.ts'
import type { CommandName, QueryName } from '@host/domain/messages/types.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'

/** Registry slot for a handler that has not landed yet. Keeps the registry exhaustive. */
export function notImplemented(
  name: CommandName | QueryName,
): (message: AnyMessage, deps: AppDeps) => Promise<never> {
  return async () => {
    throw new HandlerNotImplementedError({ name })
  }
}
