import type { AnyMessage } from '@host/domain/messages/base.ts'
import type { DomainCommand, DomainQuery } from '@host/domain/messages/types.ts'

import type { COMMAND_HANDLERS, QUERY_HANDLERS } from './handlers/registry.ts'

type CommandResult<TCommand extends DomainCommand> =
  TCommand['name'] extends keyof typeof COMMAND_HANDLERS
    ? Awaited<ReturnType<(typeof COMMAND_HANDLERS)[TCommand['name']]>>
    : never

type QueryResult<TQuery extends DomainQuery> = TQuery['name'] extends keyof typeof QUERY_HANDLERS
  ? Awaited<ReturnType<(typeof QUERY_HANDLERS)[TQuery['name']]>>
  : never

/**
 * The value `bus.handle(message)` resolves to, derived from the registered handler for that
 * message. Handlers throw on failure; this is the bare success type, not a `Result` wrapper.
 * Events are never handled from outside, so they resolve to `never`.
 */
export type MessageResult<TMessage extends AnyMessage> = TMessage extends DomainCommand
  ? CommandResult<TMessage>
  : TMessage extends DomainQuery
    ? QueryResult<TMessage>
    : never
