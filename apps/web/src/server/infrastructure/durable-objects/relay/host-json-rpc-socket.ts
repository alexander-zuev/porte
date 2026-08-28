import {
  HostApplicationErrorSchema,
  HostOfflineError,
  HostRequestIdSchema,
  InternalServerError,
  JSON_RPC_METHOD_KINDS,
  JsonRpcReadError,
  JsonRpcTextSchema,
  RequestTimeoutError,
  createHostRequestId,
  createLogger,
  errorFromHostPayload,
  jsonRpcRequest,
  jsonRpcResponseSchema,
  readJsonRpcIncoming,
  readJsonRpcTextFrame,
  sendJsonRpcFrame,
  type HostRequestId,
  type JsonRpcDocument,
  type JsonRpcMethodDefinition,
  type JsonRpcMethodRegistry,
  type JsonRpcRegistryMethodMap,
  type JsonRpcRegistryNotificationMethod,
  type JsonRpcRegistryRequestMethod,
  type JsonRpcTextFrameClose,
} from '@porte/core'
import type { Connection, WSMessage } from 'agents'
import type { z } from 'zod'

import { isOpenConnection } from './host-subprotocol.ts'

const logger = createLogger('host-json-rpc-socket')
const REQUEST_TIMEOUT_MS = 60_000

/** Close the Agent should send after one inbound Host frame. */
export type HostJsonRpcClose =
  | JsonRpcTextFrameClose
  | { readonly code: 1007; readonly reason: string }

const UNEXPECTED_DOCUMENT: HostJsonRpcClose = {
  code: 1007,
  reason: 'unexpected JSON-RPC document',
}

type PendingCall = {
  readonly finish: (document: JsonRpcDocument) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

type RequestContract<
  Registry extends JsonRpcMethodRegistry,
  Method extends JsonRpcRegistryRequestMethod<Registry>,
> = Extract<
  JsonRpcRegistryMethodMap<Registry>[Method],
  { readonly kind: typeof JSON_RPC_METHOD_KINDS.request }
>

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

/** Construction input for one Host JSON-RPC client. */
export type HostJsonRpcSocketInput<Registry extends JsonRpcMethodRegistry> = {
  /** Method table for inbound Host frames. */
  readonly methods: Registry
  /** Exhaustive handlers for inbound Host notifications. */
  readonly notificationHandlers: HostJsonRpcNotificationHandlers<Registry>
}

/** JSON-RPC client for one Mac Host WebSocket the Agent already admitted. */
export class HostJsonRpcSocket<Registry extends JsonRpcMethodRegistry> {
  private readonly pending = new Map<HostRequestId, PendingCall>()
  private peer: Connection | undefined

  /**
   * Create one Host JSON-RPC client.
   *
   * @param input - Method table and notification handlers.
   */
  constructor(private readonly input: HostJsonRpcSocketInput<Registry>) {}

  /**
   * Bind the admitted Host socket.
   * Fail waiters from a previous peer, if any.
   *
   * @param connection - The Host connection this client may send on.
   */
  attach(connection: Connection): void {
    if (this.peer !== undefined && this.peer.id !== connection.id) this.clearWaiters()
    this.peer = connection
  }

  /** Drop the peer and reject every pending Host request. */
  clear(): void {
    this.peer = undefined
    this.clearWaiters()
  }

  /**
   * Inbound Host WebSocket: parse text, then JSON-RPC as the client.
   * The Agent closes when this returns a close.
   *
   * @param connection - The socket that sent the frame.
   * @param frame - The inbound WebSocket payload.
   * @returns A close for the Agent to send, or nothing.
   */
  async handleMessage(
    connection: Connection,
    frame: WSMessage,
  ): Promise<HostJsonRpcClose | undefined> {
    if (this.peer === undefined || connection.id !== this.peer.id) return undefined
    const parsed = readJsonRpcTextFrame(JsonRpcTextSchema.safeParse(frame))
    if (!parsed.ok) {
      logger.warn('websocket_frame_rejected', { details: parsed.close })
      return parsed.close
    }
    return await this.dispatchFrame(parsed.frame)
  }

  /**
   * Call a Host method and wait for the correlated response.
   *
   * @param method - A request method on this client's table.
   * @param params - The method params.
   * @returns The parsed Host result.
   */
  async request<Method extends JsonRpcRegistryRequestMethod<Registry>>(
    method: Method,
    params: RequestContract<Registry, Method>['params'],
  ): Promise<RequestContract<Registry, Method>['result']> {
    const id = createHostRequestId()
    const settled = Promise.withResolvers<RequestContract<Registry, Method>['result']>()
    this.pending.set(id, {
      finish: finishHostResponse(
        requestResultSchema(this.input.methods[method]),
        settled.resolve,
        settled.reject,
      ),
      reject: settled.reject,
      timer: setTimeout(() => {
        this.fail(id, new RequestTimeoutError())
      }, REQUEST_TIMEOUT_MS),
    })
    try {
      await this.send(JSON.stringify(jsonRpcRequest(id, method, params)))
    } catch {
      this.fail(id, new HostOfflineError())
    }
    return settled.promise
  }

  // JSON-RPC as the client: response completes a wait, notification is handled.
  private async dispatchFrame(frame: string): Promise<HostJsonRpcClose | undefined> {
    try {
      const incoming = readJsonRpcIncoming(frame, this.input.methods, HostRequestIdSchema)
      if (incoming.kind === 'response') {
        // Waiters live in memory: a response can outlive its request across a
        // timeout or an Agent restart. Late is not malformed, so the socket stays.
        if (!this.complete(incoming.data)) logger.warn('host_response_unmatched')
        return undefined
      }
      if (incoming.kind === 'notification') {
        const handler = this.input.notificationHandlers[incoming.data.method]
        if (handler === undefined) return UNEXPECTED_DOCUMENT
        await handler(incoming.data.params)
        return undefined
      }
      return UNEXPECTED_DOCUMENT
    } catch (cause) {
      if (cause instanceof JsonRpcReadError) {
        return { code: 1007, reason: 'invalid JSON-RPC document' }
      }
      throw cause
    }
  }

  private complete(document: JsonRpcDocument): boolean {
    const id = HostRequestIdSchema.safeParse('id' in document ? document.id : undefined)
    if (!id.success || 'method' in document) return false
    const pending = this.take(id.data)
    if (pending === undefined) return false
    pending.finish(document)
    return true
  }

  private fail(id: HostRequestId, error: Error): void {
    this.take(id)?.reject(error)
  }

  private take(id: HostRequestId): PendingCall | undefined {
    const pending = this.pending.get(id)
    if (pending === undefined) return undefined
    clearTimeout(pending.timer)
    this.pending.delete(id)
    return pending
  }

  private clearWaiters(): void {
    for (const id of this.pending.keys()) this.fail(id, new HostOfflineError())
  }

  private async send(frame: string): Promise<void> {
    const host = this.peer
    if (host === undefined || !isOpenConnection(host)) throw new HostOfflineError()
    await sendJsonRpcFrame(() => {
      if (!isOpenConnection(host)) return false
      host.send(frame)
      return true
    })
  }
}

function finishHostResponse<Result>(
  result: z.ZodType<Result>,
  resolve: (value: Result) => void,
  reject: (error: Error) => void,
): (document: JsonRpcDocument) => void {
  return (document) => {
    const parsed = jsonRpcResponseSchema(
      result,
      HostApplicationErrorSchema,
      HostRequestIdSchema,
    ).safeParse(document)
    if (!parsed.success) {
      reject(new InternalServerError())
      return
    }
    if (parsed.data.error !== undefined) {
      reject(errorFromHostPayload(parsed.data.error.data))
      return
    }
    resolve(parsed.data.result)
  }
}

function requestResultSchema(definition: JsonRpcMethodDefinition | undefined): z.ZodType {
  if (definition === undefined || definition.kind !== JSON_RPC_METHOD_KINDS.request) {
    throw new InternalServerError()
  }
  return definition.result
}
