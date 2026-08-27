import {
  isCommand,
  isEvent,
  isQuery,
  type AnyEvent,
  type AnyMessage,
} from '@host/domain/messages/base.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'
import { createLogger } from '@porte/core/client'

import { NoHandlerError } from './errors/message-bus-errors.ts'
import { DEFAULT_REGISTRY } from './handlers/registry.ts'
import type { CommandRegistry, MessageRegistry, QueryRegistry } from './handlers/types.ts'
import type { MessageResult } from './message-result.ts'

const logger = createLogger('message-bus')

type CommandResults = Awaited<ReturnType<CommandRegistry[keyof CommandRegistry]>>
type QueryResults = Awaited<ReturnType<QueryRegistry[keyof QueryRegistry]>>

// A registry slot is typed for its specific message. The bus reads slots through these
// method-typed supertypes: method parameters are bivariant, so a narrower slot fits.
type AnyCommandHandler = {
  handle(command: AnyMessage, deps: AppDeps): Promise<CommandResults>
}['handle']
type AnyQueryHandler = {
  handle(query: AnyMessage, deps: AppDeps): Promise<QueryResults>
}['handle']
type AnyEventHandler = {
  handle(event: AnyEvent, deps: AppDeps): Promise<void>
}['handle']

export interface IMessageBus {
  handle<TMessage extends AnyMessage>(message: TMessage): Promise<MessageResult<TMessage>>
}

/**
 * MessageBus - Central message processing system
 * - Commands: one handler; returns its result after the outbox drains.
 * - Events: raised by aggregates, pushed to the outbox by repositories, drained here after
 *   every handler and fanned out to every subscriber in parallel. A failed subscriber is
 *   logged once and never fails the command.
 * - Queries: one handler, read-only.
 */
export class MessageBus implements IMessageBus {
  private readonly commands: Readonly<Record<string, AnyCommandHandler>>
  private readonly events: Readonly<Record<string, readonly AnyEventHandler[]>>
  private readonly queries: Readonly<Record<string, AnyQueryHandler>>

  constructor(
    private readonly deps: AppDeps,
    registry: MessageRegistry = DEFAULT_REGISTRY,
  ) {
    this.commands = registry.commands
    this.events = registry.events
    this.queries = registry.queries
  }

  async handle<TMessage extends AnyMessage>(message: TMessage): Promise<MessageResult<TMessage>> {
    try {
      const result = await this.dispatch(message)
      // SAFETY: `MessageResult` names the registered slot's result; the tables hold their union.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above.
      return result as MessageResult<TMessage>
    } finally {
      // In-memory writes are already applied, so events raised before a throw still publish.
      await this.drainOutbox()
    }
  }

  private async dispatch(message: AnyMessage) {
    if (isCommand(message)) return this.handleCommand(message)
    if (isQuery(message)) return this.handleQuery(message)
    if (isEvent(message)) {
      await this.handleEvent(message)
    }
    return undefined
  }

  private async handleCommand(command: AnyMessage): Promise<CommandResults> {
    const handler = this.commands[command.name]
    if (handler === undefined) throw new NoHandlerError({ kind: 'command', name: command.name })
    return handler(command, this.deps)
  }

  private async handleQuery(query: AnyMessage): Promise<QueryResults> {
    const handler = this.queries[query.name]
    if (handler === undefined) throw new NoHandlerError({ kind: 'query', name: query.name })
    return handler(query, this.deps)
  }

  private async handleEvent(event: AnyEvent): Promise<void> {
    const handlers = this.events[event.name] ?? []
    const outcomes = await Promise.allSettled(handlers.map((handler) => handler(event, this.deps)))
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === 'fulfilled') continue
      logger.error('event_handler_failed', {
        error: outcome.reason,
        details: { eventName: event.name, handlerIndex: index },
      })
    }
  }

  private async drainOutbox(): Promise<void> {
    for (
      let events = this.deps.outbox.drain();
      events.length > 0;
      events = this.deps.outbox.drain()
    ) {
      for (const event of events) {
        // oxlint-disable-next-line no-await-in-loop -- events run in the order aggregates raised them.
        await this.handleEvent(event)
      }
    }
  }
}
