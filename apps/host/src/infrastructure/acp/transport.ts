import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { addAbortListener } from 'node:events'
import { Readable, Writable } from 'node:stream'

import * as acp from '@agentclientprotocol/sdk'
import { z } from 'zod'

import {
  AcpClientRequestError,
  AcpExitedError,
  AcpRpcError,
  AcpStartError,
  AcpTimeoutError,
  AcpTransportError,
} from './error.ts'
import type { AcpSessionNotification, JsonValue } from './message.ts'

type AcpRequestFailure = AcpRpcError | AcpExitedError | AcpTimeoutError | AcpTransportError
type AcpOutgoingParams = acp.AgentRequestParamsByMethod[acp.AgentRequestMethod] | JsonValue

/**
 * Handles one inbound ACP request from the agent (permission, fs, terminal, elicitation).
 */
export type AcpRequestHandler = (
  id: acp.JsonRpcId,
  method: acp.ClientRequestMethod,
  params: JsonValue,
) => Promise<JsonValue>

/** How to spawn one ACP agent subprocess. */
export type StartAcpTransport = {
  /** Agent binary. */
  readonly command: string
  /** Agent argv after the binary. */
  readonly args: readonly string[]
  /** Working directory for the child. */
  readonly cwd: string
  /** Stops this child when the Host lifespan ends. The CLI owns process signals. */
  readonly signal: AbortSignal
  /** ACP `session/update` from the agent. */
  readonly onUpdate: (notification: AcpSessionNotification) => void
  /** ACP client request from the agent. */
  readonly onRequest: AcpRequestHandler
  /** ACP `elicitation/complete` from the agent. */
  readonly onElicitationComplete?: (notification: acp.CompleteElicitationNotification) => void
}

/**
 * One ACP agent subprocess over stdio.
 *
 * Owns spawn, JSON-RPC, inbound ACP client methods, timeouts, and process stop.
 * Does not know which agent binary it runs, or Porte conversations.
 */
export class AcpTransport {
  private readonly stdio: acp.ClientConnection
  private stopped = false
  private abortListener: Disposable | undefined

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    input: StartAcpTransport,
  ) {
    const app = acp
      .client({ name: 'porte' })
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        input.onUpdate(params)
      })
      .onNotification(acp.methods.client.elicitation.complete, ({ params }) => {
        input.onElicitationComplete?.(params)
      })

    registerClientRequests(app, input.onRequest)
    child.stderr.resume()

    // SAFETY: Node exposes byte streams here because the child stdio encoding is not set.
    const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>
    // SAFETY: Node exposes byte streams here because the child stdio encoding is not set.
    const source = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
    this.stdio = app.connect(acp.ndJsonStream(output, source))

    this.abortListener = addAbortListener(input.signal, () => {
      void this.stop()
    })
  }

  /**
   * Spawn one ACP process and wait until the OS has started it.
   *
   * @param input - Binary, argv, working directory, host signal, and ACP callbacks.
   * @returns A live transport, or `AcpStartError` when spawn fails or the host signal is already aborted.
   */
  static start(input: StartAcpTransport): Promise<AcpTransport> {
    if (input.signal.aborted) {
      return Promise.reject(new AcpStartError({ cause: input.signal.reason }))
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const child = spawn(input.command, [...input.args], {
        cwd: input.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const abortListener = addAbortListener(input.signal, () => {
        child.kill('SIGTERM')
        fail(new AcpStartError({ cause: input.signal.reason }))
      })
      const fail = (cause: AcpStartError): void => {
        if (settled) return
        settled = true
        abortListener[Symbol.dispose]()
        reject(cause)
      }
      child.once('error', (cause: unknown) => {
        fail(new AcpStartError({ cause }))
      })
      child.once('spawn', () => {
        child.removeAllListeners('error')
        const transport = new AcpTransport(child, input)
        abortListener[Symbol.dispose]()
        if (settled) {
          void transport.stop()
          return
        }
        settled = true
        resolve(transport)
      })
    })
  }

  /**
   * Send one typed ACP request and wait for its response.
   *
   * @param request - ACP method, params, and deadline.
   */
  request<Method extends acp.AgentRequestMethod>(request: {
    readonly method: Method
    readonly params: acp.AgentRequestParamsByMethod[Method]
    readonly timeoutMs: number
  }): Promise<acp.AgentRequestResponsesByMethod[Method]>
  /**
   * Send one extension ACP request and wait for its response.
   *
   * @param request - Method name, JSON params, and deadline.
   */
  request<Response>(request: {
    readonly method: string
    readonly params: JsonValue
    readonly timeoutMs: number
  }): Promise<Response>
  async request<Response>(request: {
    readonly method: string
    readonly params: AcpOutgoingParams
    readonly timeoutMs: number
  }): Promise<Response> {
    this.throwIfStopped()

    const cancellation = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        cancellation.abort()
        reject(new AcpTimeoutError({ timeoutMs: request.timeoutMs }))
      }, request.timeoutMs)
    })
    const response = this.stdio.agent
      .request<Response, AcpOutgoingParams>(request.method, request.params, {
        cancellationSignal: cancellation.signal,
      })
      .catch((cause: unknown) => {
        throw this.mapRequestError(cause)
      })

    try {
      return await Promise.race([response, timeout])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * Send one typed ACP notification without waiting for a response.
   *
   * @param notification - ACP notification method and params.
   */
  async notify<Method extends acp.AgentNotificationMethod>(notification: {
    readonly method: Method
    readonly params: acp.AgentNotificationParamsByMethod[Method]
  }): Promise<void> {
    this.throwIfStopped()
    try {
      await this.stdio.agent.notify(notification.method, notification.params)
    } catch (cause) {
      throw new AcpTransportError({ cause })
    }
  }

  /**
   * Close JSON-RPC and stop the child (SIGTERM, then SIGKILL).
   */
  async stop(): Promise<void> {
    this.abortListener?.[Symbol.dispose]()
    this.abortListener = undefined
    if (this.stopped) return
    this.stopped = true
    this.stdio.close()
    if (this.child.exitCode !== null || this.child.signalCode !== null) return

    this.child.kill('SIGTERM')
    const exited = await waitForExit(this.child, 2_000)
    if (exited) return
    this.child.kill('SIGKILL')
    await waitForExit(this.child, 2_000)
  }

  private throwIfStopped(): void {
    if (this.stopped || this.child.exitCode !== null || this.child.signalCode !== null) {
      throw new AcpExitedError({ code: this.child.exitCode })
    }
  }

  private mapRequestError(cause: unknown): AcpRequestFailure {
    if (cause instanceof acp.RequestError) {
      return new AcpRpcError({ rpc: cause.toErrorResponse() })
    }
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return new AcpExitedError({ code: this.child.exitCode })
    }
    return new AcpTransportError({ cause })
  }
}

function registerClientRequests(app: acp.ClientApp, handler: AcpRequestHandler): void {
  app
    .onRequest(acp.methods.client.session.requestPermission, (context) =>
      handleClientRequest(handler, context, acp.methods.client.session.requestPermission),
    )
    .onRequest(acp.methods.client.fs.readTextFile, (context) =>
      handleClientRequest(handler, context, acp.methods.client.fs.readTextFile),
    )
    .onRequest(acp.methods.client.fs.writeTextFile, (context) =>
      handleClientRequest(handler, context, acp.methods.client.fs.writeTextFile),
    )
    .onRequest(acp.methods.client.terminal.create, (context) =>
      handleClientRequest(handler, context, acp.methods.client.terminal.create),
    )
    .onRequest(acp.methods.client.terminal.output, (context) =>
      handleClientRequest(handler, context, acp.methods.client.terminal.output),
    )
    .onRequest(acp.methods.client.terminal.release, (context) =>
      handleClientRequest(handler, context, acp.methods.client.terminal.release),
    )
    .onRequest(acp.methods.client.terminal.waitForExit, (context) =>
      handleClientRequest(handler, context, acp.methods.client.terminal.waitForExit),
    )
    .onRequest(acp.methods.client.terminal.kill, (context) =>
      handleClientRequest(handler, context, acp.methods.client.terminal.kill),
    )
    .onRequest(acp.methods.client.elicitation.create, (context) =>
      handleClientRequest(handler, context, acp.methods.client.elicitation.create),
    )
}

async function handleClientRequest<Method extends acp.ClientRequestMethod>(
  handler: AcpRequestHandler,
  context: acp.ClientRequestContext<acp.ClientRequestParamsByMethod[Method]>,
  method: Method,
): Promise<acp.ClientRequestResponsesByMethod[Method]> {
  const params = z.json().safeParse(context.params)
  if (!params.success) throw acp.RequestError.invalidParams(params.error, 'Invalid JSON params')
  try {
    const answered = await handler(context.requestId, method, params.data)
    // SAFETY: The SDK parsed the request by method. The handler returns that method's response.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The SDK parsed params by this method.
    return answered as acp.ClientRequestResponsesByMethod[Method]
  } catch (cause) {
    if (cause instanceof AcpClientRequestError) {
      throw new acp.RequestError(cause.code, cause.message, cause.data)
    }
    throw cause
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      child.removeListener('exit', onExit)
      clearTimeout(timer)
      // oxlint-disable-next-line promise/no-multiple-resolved -- `settled` guards this resolver.
      resolve(value)
    }
    const timer = setTimeout(() => {
      finish(false)
    }, timeoutMs)
    const onExit = (): void => {
      finish(true)
    }
    child.once('exit', onExit)
  })
}
