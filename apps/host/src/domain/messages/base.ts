/**
 * Base shapes for in-process messages. Pure data with no id or timestamp: the host
 * never queues or redelivers a message, so there is nothing to claim or order by.
 */
export type MessageKind = 'command' | 'event' | 'query'

export type MessageBase<Kind extends MessageKind, Name extends string, Data extends object> = {
  readonly type: Kind
  readonly name: Name
} & Readonly<Data>

/** What the bus routes on. The registry decides whether a handler exists for the name. */
export type AnyMessage = MessageBase<MessageKind, string, object>
export type AnyEvent = MessageBase<'event', string, object>

export const isCommand = <M extends AnyMessage>(
  message: M,
): message is Extract<M, { type: 'command' }> => message.type === 'command'
export const isEvent = <M extends AnyMessage>(
  message: M,
): message is Extract<M, { type: 'event' }> => message.type === 'event'
export const isQuery = <M extends AnyMessage>(
  message: M,
): message is Extract<M, { type: 'query' }> => message.type === 'query'
