import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Readable, Writable } from 'node:stream'

import * as acp from '@agentclientprotocol/sdk'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import {
  AcpExitedError,
  AcpRpcError,
  AcpStartError,
  AcpTimeoutError,
  AcpTransportError,
} from './error.ts'
import type { AcpSessionNotification, JsonRpcError, JsonValue } from './message.ts'

type AcpRequestFailure = AcpRpcError | AcpExitedError | AcpTimeoutError | AcpTransportError
type AcpOutgoingParams = acp.AgentRequestParamsByMethod[acp.AgentRequestMethod] | JsonValue

/** Handles one request sent by an ACP agent. */
export type AcpRequestHandler = (
  id: acp.JsonRpcId,
  method: acp.ClientRequestMethod,
  params: JsonValue,
) => Promise<ResultType<JsonValue, JsonRpcError>>

/** Input required to start one ACP client. */
export type StartAcpClient = {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly onUpdate: (notification: AcpSessionNotification) => void
  readonly onRequest: AcpRequestHandler
  readonly onElicitationComplete?: (notification: acp.CompleteElicitationNotification) => void
}

/** Start one ACP process through the official typed SDK. */
export function startAcpClient(
  input: StartAcpClient,
): Promise<ResultType<AcpClient, AcpStartError>> {
  return new Promise((resolve) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const onError = (cause: unknown): void => {
      resolve(Result.err(new AcpStartError({ cause })))
    }
    child.once('error', onError)
    child.once('spawn', () => {
      child.removeListener('error', onError)
      resolve(Result.ok(new AcpClient(child, input)))
    })
  })
}

/** One active typed ACP connection over a child process. */
export class AcpClient {
  private readonly connection: acp.ClientConnection
  private closed = false
  private readonly onSignal: () => void

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    input: StartAcpClient,
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
    this.connection = app.connect(acp.ndJsonStream(output, source))

    this.onSignal = () => {
      void this.stop()
    }
    process.once('SIGINT', this.onSignal)
    process.once('SIGTERM', this.onSignal)
  }

  /** Send one typed ACP request and wait for its response. */
  request<Method extends acp.AgentRequestMethod>(request: {
    readonly method: Method
    readonly params: acp.AgentRequestParamsByMethod[Method]
    readonly timeoutMs: number
  }): Promise<ResultType<acp.AgentRequestResponsesByMethod[Method], AcpRequestFailure>>
  /** Send one extension ACP request and wait for its response. */
  request<Response>(request: {
    readonly method: string
    readonly params: JsonValue
    readonly timeoutMs: number
  }): Promise<ResultType<Response, AcpRequestFailure>>
  async request<Response>(request: {
    readonly method: string
    readonly params: AcpOutgoingParams
    readonly timeoutMs: number
  }): Promise<ResultType<Response, AcpRequestFailure>> {
    if (this.closed || this.child.exitCode !== null || this.child.signalCode !== null) {
      return Result.err(new AcpExitedError({ code: this.child.exitCode }))
    }

    const cancellation = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<ResultType<never, AcpTimeoutError>>((resolve) => {
      timer = setTimeout(() => {
        cancellation.abort()
        resolve(Result.err(new AcpTimeoutError({ timeoutMs: request.timeoutMs })))
      }, request.timeoutMs)
    })
    const response = this.connection.agent
      .request<Response, AcpOutgoingParams>(request.method, request.params, {
        cancellationSignal: cancellation.signal,
      })
      .then(
        (value) => Result.ok(value),
        (cause: unknown) => Result.err(this.mapRequestError(cause)),
      )

    try {
      return await Promise.race([response, timeout])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /** Send one typed ACP notification without waiting for a response. */
  async notify<Method extends acp.AgentNotificationMethod>(notification: {
    readonly method: Method
    readonly params: acp.AgentNotificationParamsByMethod[Method]
  }): Promise<ResultType<void, AcpExitedError | AcpTransportError>> {
    if (this.closed || this.child.exitCode !== null || this.child.signalCode !== null) {
      return Result.err(new AcpExitedError({ code: this.child.exitCode }))
    }
    try {
      await this.connection.agent.notify(notification.method, notification.params)
      return Result.ok()
    } catch (cause) {
      return Result.err(new AcpTransportError({ cause }))
    }
  }

  /** Stop the ACP connection and its child process. */
  async stop(): Promise<void> {
    process.removeListener('SIGINT', this.onSignal)
    process.removeListener('SIGTERM', this.onSignal)
    if (this.closed) return
    this.closed = true
    this.connection.close()
    if (this.child.exitCode !== null || this.child.signalCode !== null) return

    this.child.kill('SIGTERM')
    const exited = await waitForExit(this.child, 2_000)
    if (exited) return
    this.child.kill('SIGKILL')
    await waitForExit(this.child, 2_000)
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
  const answered = await handler(context.requestId, method, params.data)
  if (answered.isErr()) {
    throw new acp.RequestError(answered.error.code, answered.error.message, answered.error.data)
  }
  // SAFETY: The SDK parsed the request by method. The handler returns that method's response.
  return answered.value as acp.ClientRequestResponsesByMethod[Method]
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
