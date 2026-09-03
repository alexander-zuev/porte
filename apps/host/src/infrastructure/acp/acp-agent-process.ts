import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { addAbortListener, once } from 'node:events'
import { Readable, Writable } from 'node:stream'

import * as acp from '@agentclientprotocol/sdk'
import { z } from 'zod'

import {
  AcpClientRequestError,
  AcpExitedError,
  AcpRpcError,
  AcpStartError,
  AcpTimeoutError,
  AcpProcessError,
} from './error.ts'
import {
  GROK_NOTIFICATION_METHODS,
  type AcpSessionNotification,
  type GrokNotificationMethod,
  type JsonValue,
} from './message.ts'

type AcpRequestFailure = AcpRpcError | AcpExitedError | AcpTimeoutError | AcpProcessError
type AcpOutgoingParams = acp.AgentRequestParamsByMethod[acp.AgentRequestMethod] | JsonValue

/** Deadline for one ACP JSON-RPC request unless the caller passes `timeoutMs`. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/**
 * Handles one inbound ACP request from the agent (permission, fs, terminal, elicitation).
 */
export type AcpRequestHandler = (
  id: acp.JsonRpcId,
  method: acp.ClientRequestMethod,
  params: JsonValue,
) => Promise<JsonValue>

/** How to spawn one ACP agent subprocess. */
export type StartAcpAgentProcess = {
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
  /** Grok's `_x.ai` session channels, raw; the adapter keeps what it understands. */
  readonly onGrokNotification?: (method: GrokNotificationMethod, params: JsonValue) => void
}

/**
 * One ACP agent process and the JSON-RPC connection to it over stdio.
 *
 * Owns spawn, typed requests with deadlines, inbound ACP client methods, and stop.
 * Does not know which agent binary it runs, or Porte conversations.
 */
export class AcpAgentProcess {
  private readonly stdio: acp.ClientConnection
  private stopped = false
  private abortListener: Disposable | undefined

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    input: StartAcpAgentProcess,
  ) {
    const app = acp
      .client({ name: 'porte' })
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        input.onUpdate(params)
      })
      .onNotification(acp.methods.client.elicitation.complete, ({ params }) => {
        input.onElicitationComplete?.(params)
      })
    for (const method of GROK_NOTIFICATION_METHODS) {
      app.onNotification(method, { parse: (raw) => z.json().parse(raw) }, ({ params }) => {
        input.onGrokNotification?.(method, params)
      })
    }

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
  static async start(input: StartAcpAgentProcess): Promise<AcpAgentProcess> {
    if (input.signal.aborted) throw new AcpStartError({ cause: input.signal.reason })

    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    try {
      // `once` rejects on `error` before `spawn` and on host abort.
      await once(child, 'spawn', { signal: input.signal })
    } catch (cause) {
      child.kill('SIGTERM')
      throw new AcpStartError({ cause })
    }
    return new AcpAgentProcess(child, input)
  }

  /**
   * Send one typed ACP request and wait for its response.
   *
   * @param request - ACP method and params. Pass `timeoutMs` to replace the 30s default.
   */
  request<Method extends acp.AgentRequestMethod>(request: {
    readonly method: Method
    readonly params: acp.AgentRequestParamsByMethod[Method]
    readonly timeoutMs?: number
  }): Promise<acp.AgentRequestResponsesByMethod[Method]>
  /**
   * Send one extension ACP request and wait for its response.
   *
   * @param request - Method name and JSON params. Pass `timeoutMs` to replace the 30s default.
   */
  request<Response>(request: {
    readonly method: string
    readonly params: JsonValue
    readonly timeoutMs?: number
  }): Promise<Response>
  async request<Response>(request: {
    readonly method: string
    readonly params: AcpOutgoingParams
    readonly timeoutMs?: number
  }): Promise<Response> {
    this.throwIfStopped()

    const timeoutMs = request.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    // ACP cancellation is cooperative: the peer still answers, so the deadline is enforced here.
    const deadline = new AbortController()
    const timer = setTimeout(() => {
      deadline.abort(new AcpTimeoutError({ timeoutMs }))
    }, timeoutMs)
    const response = this.stdio.agent
      .request<Response, AcpOutgoingParams>(request.method, request.params, {
        cancellationSignal: deadline.signal,
      })
      .catch((cause: unknown) => {
        throw this.mapRequestError(cause)
      })
    const expired = once(deadline.signal, 'abort').then(() => {
      throw deadline.signal.reason
    })

    try {
      return await Promise.race([response, expired])
    } finally {
      clearTimeout(timer)
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
      throw new AcpProcessError({ cause })
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
    if (await exited(this.child, 2_000)) return
    this.child.kill('SIGKILL')
    await exited(this.child, 2_000)
  }

  /** True once the child is gone, by our stop or its own exit; every request then fails. */
  get exited(): boolean {
    return this.stopped || this.child.exitCode !== null || this.child.signalCode !== null
  }

  private throwIfStopped(): void {
    if (this.exited) throw new AcpExitedError({ code: this.child.exitCode })
  }

  private mapRequestError(cause: unknown): AcpRequestFailure {
    if (cause instanceof acp.RequestError) {
      return new AcpRpcError({ rpc: cause.toErrorResponse() })
    }
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return new AcpExitedError({ code: this.child.exitCode })
    }
    return new AcpProcessError({ cause })
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

/** True when the child has exited within `timeoutMs`. */
function exited(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return once(child, 'exit', { signal: AbortSignal.timeout(timeoutMs) }).then(
    () => true,
    () => false,
  )
}
