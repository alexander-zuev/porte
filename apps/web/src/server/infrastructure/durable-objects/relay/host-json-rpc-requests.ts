import {
  createHostRequestId,
  HostApplicationErrorSchema,
  HostRequestIdSchema,
  jsonRpcRequest,
  jsonRpcResponseSchema,
  type JsonRpcDocument,
  type JsonRpcParams,
  type PorteErrorPayload,
} from '@porte/core'
import { TaggedError } from 'better-result'
import type { z } from 'zod'

const REQUEST_TIMEOUT_MS = 30_000

/** One expected application error returned by the Host. */
export class HostApplicationResponseError extends TaggedError('HostApplicationResponseError')<{
  payload: PorteErrorPayload
  message: string
}> {
  constructor(payload: PorteErrorPayload) {
    super({ payload, message: payload.message })
  }
}

/** One pending request lost its Host connection. */
export class HostConnectionUnavailableError extends TaggedError('HostConnectionUnavailableError')<{
  cause: unknown
  message: string
}> {
  constructor(cause?: unknown) {
    super({ cause, message: 'Host connection is not available.' })
  }
}

/** The Host returned a response outside the selected method contract. */
export class HostResponseInvalidError extends TaggedError('HostResponseInvalidError')<{
  message: string
}> {
  constructor() {
    super({ message: 'Host response is not valid.' })
  }
}

/** One Host request did not receive a response before its deadline. */
export class HostRequestTimeoutError extends TaggedError('HostRequestTimeoutError')<{
  message: string
}> {
  constructor() {
    super({ message: 'Host request timed out.' })
  }
}

type PendingRequest = {
  readonly accept: (document: JsonRpcDocument) => void
  readonly reject: (error: HostRequestError) => void
  readonly timeout: ReturnType<typeof setTimeout>
}

export type HostRequestError =
  | HostApplicationResponseError
  | HostConnectionUnavailableError
  | HostRequestTimeoutError
  | HostResponseInvalidError

/** Keep request correlation in memory for one Host WebSocket. */
export class HostJsonRpcRequests {
  private readonly pending = new Map<string, PendingRequest>()

  constructor(private readonly send: (frame: string) => void | Promise<void>) {}

  request<Result>(
    method: string,
    params: JsonRpcParams,
    resultSchema: z.ZodType<Result>,
  ): Promise<Result> {
    const id = createHostRequestId()
    const responseSchema = jsonRpcResponseSchema(
      resultSchema,
      HostApplicationErrorSchema,
      HostRequestIdSchema,
    )
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new HostRequestTimeoutError())
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, {
        timeout,
        reject,
        accept: (document) => {
          const parsed = responseSchema.safeParse(document)
          if (!parsed.success) {
            reject(new HostResponseInvalidError())
            return
          }
          if (parsed.data.error !== undefined) {
            reject(new HostApplicationResponseError(parsed.data.error.data))
            return
          }
          resolve(parsed.data.result)
        },
      })
      void Promise.resolve(this.send(JSON.stringify(jsonRpcRequest(id, method, params)))).catch(
        (cause: unknown) => {
          clearTimeout(timeout)
          this.pending.delete(id)
          reject(new HostConnectionUnavailableError(cause))
        },
      )
    })
  }

  /** Resolve one pending request when this document is its response. */
  accept(document: JsonRpcDocument): boolean {
    const id = HostRequestIdSchema.safeParse('id' in document ? document.id : undefined)
    if (!id.success || 'method' in document) return false
    const pending = this.pending.get(id.data)
    if (pending === undefined) return false
    clearTimeout(pending.timeout)
    this.pending.delete(id.data)
    pending.accept(document)
    return true
  }

  /** Reject all pending requests after the socket closes. */
  close(cause?: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new HostConnectionUnavailableError(cause))
    }
    this.pending.clear()
  }
}
