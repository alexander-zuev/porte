import type { MessageBase } from './base.ts'
import type { CommandDataMap } from './commands.ts'
import type { EventDataMap } from './events.ts'
import type { QueryDataMap } from './queries.ts'

export type CommandName = keyof CommandDataMap
export type EventName = keyof EventDataMap
export type QueryName = keyof QueryDataMap

export type CommandMap = { [K in CommandName]: MessageBase<'command', K, CommandDataMap[K]> }
export type EventMap = { [K in EventName]: MessageBase<'event', K, EventDataMap[K]> }
export type QueryMap = { [K in QueryName]: MessageBase<'query', K, QueryDataMap[K]> }

export type DomainCommand = CommandMap[CommandName]
export type DomainEvent = EventMap[EventName]
export type DomainQuery = QueryMap[QueryName]

export function createCommand<Name extends CommandName>(
  name: Name,
  data: CommandDataMap[Name],
): MessageBase<'command', Name, CommandDataMap[Name]> {
  return { type: 'command', name, ...data }
}

export function createEvent<Name extends EventName>(
  name: Name,
  data: EventDataMap[Name],
): MessageBase<'event', Name, EventDataMap[Name]> {
  return { type: 'event', name, ...data }
}

export function createQuery<Name extends QueryName>(
  name: Name,
  data: QueryDataMap[Name],
): MessageBase<'query', Name, QueryDataMap[Name]> {
  return { type: 'query', name, ...data }
}
