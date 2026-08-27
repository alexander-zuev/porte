import type {
  CommandMap,
  DomainCommand,
  DomainEvent,
  DomainQuery,
  EventMap,
  QueryMap,
} from '@host/domain/messages/types.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'

/**
 * The three handler shapes the message bus routes. Each receives its message plus the
 * application dependencies; commands return a result, events return void, and domain
 * events reach the bus through the outbox, never as a handler return value.
 */
export type CommandHandler<TCommand extends DomainCommand, TResult> = (
  command: TCommand,
  deps: AppDeps,
) => Promise<TResult>
export type EventHandler<TEvent extends DomainEvent> = (
  event: TEvent,
  deps: AppDeps,
) => Promise<void>
export type QueryHandler<TQuery extends DomainQuery, TResult> = (
  query: TQuery,
  deps: AppDeps,
) => Promise<TResult>

/**
 * Registry maps keyed by message name, each slot typed for THAT message. `satisfies`
 * against these proves every command and query has exactly one handler.
 */
export type CommandRegistry = { [K in keyof CommandMap]: CommandHandler<CommandMap[K], unknown> }
export type EventRegistry = { [K in keyof EventMap]: readonly EventHandler<EventMap[K]>[] }
export type QueryRegistry = { [K in keyof QueryMap]: QueryHandler<QueryMap[K], unknown> }
export type MessageRegistry = {
  readonly commands: CommandRegistry
  readonly events: EventRegistry
  readonly queries: QueryRegistry
}
