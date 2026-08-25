import {
  ConfigurationNotFoundError,
  ConversationBusyError,
  ConversationNotFoundError,
  ElicitationNotFoundError,
  HOST_CONTROL_SUBPROTOCOL,
  HOST_CONVERSATION_SUBPROTOCOL,
  HostApplicationErrorSchema,
  HostIdSchema,
  HostOfflineError,
  HostRequestIdSchema,
  InternalServerError,
  JSON_RPC_METHOD_KINDS,
  JsonRpcReadError,
  JsonRpcTextSchema,
  PermissionNotFoundError,
  RequestTimeoutError,
  createHostRequestId,
  createLogger,
  jsonRpcRequest,
  jsonRpcResponseSchema,
  readJsonRpcIncoming,
  readJsonRpcTextFrame,
  sendJsonRpcFrame,
  type HostId,
  type HostRequestId,
  type JsonRpcDocument,
  type JsonRpcMethodDefinition,
  type JsonRpcMethodRegistry,
  type JsonRpcRegistryMethodMap,
  type JsonRpcRegistryNotificationMethod,
  type JsonRpcRegistryRequestMethod,
  type PorteErrorPayload,
} from '@porte/core'
import type { Connection, WSMessage } from 'agents'
import type { z } from 'zod'

import { hasSubprotocol } from './host-subprotocol.ts'
import { RELAY_HOST_ID_HEADER } from './relay-headers.ts'

const logger = createLogger('host-json-rpc-socket')
const REQUEST_TIMEOUT_MS = 60_000

const CLOSE_REASON = {
  control: {
    invalid: 'invalid host control connection',
    replaced: 'host control replaced',
    unexpected: 'unexpected control document',
  },
  conversation: {
    invalid: 'invalid host conversation connection',
    replaced: 'host conversation replaced',
    unexpected: 'unexpected conversation document',
  },
} as const

type PendingCall = {
  readonly finish: (document: JsonRpcDocument) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

type HostRequestContract<
  Registry extends JsonRpcMethodRegistry,
  Method extends JsonRpcRegistryRequestMethod<Registry>,
> = Registry[Method] extends {
  readonly kind: typeof JSON_RPC_METHOD_KINDS.request
  readonly params: infer Params extends z.ZodType
  readonly result: infer Result extends z.ZodType
}
  ? { readonly params: z.infer<Params>; readonly result: z.infer<Result> }
  : never

type NotificationParams<
  Registry extends JsonRpcMethodRegistry,
  Method extends JsonRpcRegistryNotificationMethod<Registry>,
> = Extract<
  JsonRpcRegistryMethodMap<Registry>[Method],
  { readonly kind: typeof JSON_RPC_METHOD_KINDS.notification }
>['params']

/** One typed handler for every inbound Host notification. */
export type HostJsonRpcNotificationHandlers<Registry extends JsonRpcMethodRegistry> = Readonly<{
  [Method in JsonRpcRegistryNotificationMethod<Registry>]: (
    params: NotificationParams<Registry, Method>,
  ) => Promise<void>
}>

/** Construction input for one Host JSON-RPC socket on a relay Agent. */
export type HostJsonRpcSocketInput<Registry extends JsonRpcMethodRegistry> = {
  /** Connection tag this socket owns. */
  readonly tag: string
  /** Which Host subprotocol this Agent accepts. */
  readonly role: 'control' | 'conversation'
  /** Method table for inbound Host frames. */
  readonly methods: Registry
  /** Open connections that carry `tag`. */
  readonly connections: () => Iterable<Connection>
  /** Exhaustive handlers for inbound Host notifications. */
  readonly notificationHandlers: HostJsonRpcNotificationHandlers<Registry>
}

/** One Host JSON-RPC socket on a relay Agent. */
export class HostJsonRpcSocket<Registry extends JsonRpcMethodRegistry> {
  private readonly pending = new Map<HostRequestId, PendingCall>()

  /**
   * Create one Host JSON-RPC socket for this Agent.
   *
   * @param input - Tag, role, method table, connections, and notification handlers.
   */
  constructor(private readonly input: HostJsonRpcSocketInput<Registry>) {}

  /**
   * True when the upgrade is a Host JSON-RPC socket for this Agent.
   *
   * @param request - The inbound upgrade request.
   * @param protocols - Subprotocols that count as Host on this Agent.
   * @returns True when the request offered one of `protocols`.
   */
  isHostUpgrade(request: Request, protocols: readonly string[]): boolean {
    return protocols.some((protocol) => hasSubprotocol(request, protocol))
  }

  /**
   * Accept one Host socket, or close it.
   * Replaces any previous Host socket on this Agent.
   *
   * @param connection - The connecting socket.
   * @param request - The upgrade that created it.
   * @param expectedHostId - When set, the header must match this Host.
   * @returns True when this socket is now the Host connection.
   */
  accept(connection: Connection, request: Request, expectedHostId?: HostId): boolean {
    const subprotocol =
      this.input.role === 'control' ? HOST_CONTROL_SUBPROTOCOL : HOST_CONVERSATION_SUBPROTOCOL
    if (!hasSubprotocol(request, subprotocol)) return false
    const hostId = HostIdSchema.safeParse(request.headers.get(RELAY_HOST_ID_HEADER))
    if (!hostId.success || (expectedHostId !== undefined && hostId.data !== expectedHostId)) {
      connection.close(1008, CLOSE_REASON[this.input.role].invalid)
      return false
    }
    for (const previous of this.input.connections()) {
      if (previous.id !== connection.id)
        previous.close(1008, CLOSE_REASON[this.input.role].replaced)
    }
    return true
  }

  /**
   * Inbound Host WebSocket: ignore browser sockets, parse text, then JSON-RPC as the client.
   *
   * @param connection - The socket that sent the frame.
   * @param frame - The inbound WebSocket payload.
   */
  async handleMessage(connection: Connection, frame: WSMessage): Promise<void> {
    if (!connection.tags.includes(this.input.tag)) return
    const parsed = readJsonRpcTextFrame(JsonRpcTextSchema.safeParse(frame))
    if (!parsed.ok) {
      logger.warn('websocket_frame_rejected', { details: parsed.close })
      connection.close(parsed.close.code, parsed.close.reason)
      return
    }
    await this.dispatchFrame(connection, parsed.frame)
  }

  // JSON-RPC as the client: response completes a wait, notification is handled.
  private async dispatchFrame(connection: Connection, frame: string): Promise<void> {
    try {
      const incoming = readJsonRpcIncoming(frame, this.input.methods, HostRequestIdSchema)
      if (incoming.kind === 'response') {
        if (this.complete(incoming.data)) return
        connection.close(1007, CLOSE_REASON[this.input.role].unexpected)
        return
      }
      if (incoming.kind === 'notification') {
        const handler = this.input.notificationHandlers[incoming.data.method]
        if (handler === undefined) {
          connection.close(1007, CLOSE_REASON[this.input.role].unexpected)
          return
        }
        await handler(incoming.data.params)
        return
      }
      connection.close(1007, CLOSE_REASON[this.input.role].unexpected)
    } catch (cause) {
      if (cause instanceof JsonRpcReadError) {
        connection.close(1007, 'invalid JSON-RPC document')
        return
      }
      throw cause
    }
  }

  /**
   * Drop pending requests when the last Host socket is gone.
   *
   * @param connection - The socket that just closed.
   */
  handleClose(connection: Connection): void {
    if (!connection.tags.includes(this.input.tag) || this.openConnection() !== undefined) return
    this.close()
  }

  /**
   * Call a Host method and wait for the correlated response.
   *
   * @param method - A request method on this socket's table.
   * @param params - The method params. Omitted when the method has none.
   * @returns The parsed Host result.
   */
  async request<Method extends JsonRpcRegistryRequestMethod<Registry>>(
    method: Method,
    ...params: [{}] extends [HostRequestContract<Registry, Method>['params']]
      ? [params?: HostRequestContract<Registry, Method>['params']]
      : [params: HostRequestContract<Registry, Method>['params']]
  ): Promise<HostRequestContract<Registry, Method>['result']> {
    const payload = params[0] ?? {}
    const result = requestResultSchema(this.input.methods[method])
    const id = createHostRequestId()
    const settled = Promise.withResolvers<HostRequestContract<Registry, Method>['result']>()
    this.pending.set(id, {
      reject: (error: Error) => {
        settled.reject(error)
      },
      finish: (document: JsonRpcDocument) => {
        const parsed = jsonRpcResponseSchema(
          result,
          HostApplicationErrorSchema,
          HostRequestIdSchema,
        ).safeParse(document)
        if (!parsed.success) {
          settled.reject(new InternalServerError())
          return
        }
        if (parsed.data.error !== undefined) {
          settled.reject(errorFromPayload(parsed.data.error.data))
          return
        }
        settled.resolve(parsed.data.result)
      },
      timer: setTimeout(() => {
        this.fail(id, new RequestTimeoutError())
      }, REQUEST_TIMEOUT_MS),
    })
    try {
      await this.send(JSON.stringify(jsonRpcRequest(id, method, payload)))
    } catch (cause) {
      this.fail(id, cause instanceof HostOfflineError ? cause : new HostOfflineError())
    }
    return settled.promise
  }

  /**
   * The open Host socket, if any.
   *
   * @returns The first open tagged connection, or undefined.
   */
  openConnection(): Connection | undefined {
    for (const connection of this.input.connections()) {
      if (connection.readyState === WebSocket.OPEN) return connection
    }
    return undefined
  }

  /** Reject every pending Host request. */
  close(): void {
    for (const id of this.pending.keys()) this.fail(id, new HostOfflineError())
  }

  private complete(document: JsonRpcDocument): boolean {
    const id = HostRequestIdSchema.safeParse('id' in document ? document.id : undefined)
    if (!id.success || 'method' in document) return false
    const pending = this.pending.get(id.data)
    if (pending === undefined) return false
    clearTimeout(pending.timer)
    this.pending.delete(id.data)
    pending.finish(document)
    return true
  }

  private fail(id: HostRequestId, error: Error): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    this.pending.delete(id)
    pending.reject(error)
  }

  private async send(frame: string): Promise<void> {
    const host = this.openConnection()
    if (host === undefined) throw new HostOfflineError()
    await sendJsonRpcFrame(() => {
      if (host.readyState !== WebSocket.OPEN) return false
      host.send(frame)
      return true
    })
  }
}

function requestResultSchema(definition: JsonRpcMethodDefinition | undefined): z.ZodType {
  if (definition === undefined || definition.kind !== JSON_RPC_METHOD_KINDS.request) {
    throw new InternalServerError()
  }
  return definition.result
}

function errorFromPayload(payload: PorteErrorPayload): Error {
  switch (payload._tag) {
    case 'ConversationNotFoundError':
      return new ConversationNotFoundError()
    case 'ConversationBusyError':
      return new ConversationBusyError()
    case 'PermissionNotFoundError':
      return new PermissionNotFoundError()
    case 'ElicitationNotFoundError':
      return new ElicitationNotFoundError()
    case 'ConfigurationNotFoundError':
      return new ConfigurationNotFoundError()
    case 'RequestTimeoutError':
      return new RequestTimeoutError()
    default:
      return new InternalServerError()
  }
}
