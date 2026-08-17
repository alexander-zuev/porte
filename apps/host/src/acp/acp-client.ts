import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

import { Result, type Result as ResultType } from 'better-result'

import { AcpExitedError, AcpRpcError, AcpStartError, AcpTransportError } from './acp-errors.ts'
import {
  parseAcpLine,
  type AcpRequest,
  type AcpSessionUpdate,
  type JsonRpcError,
  type JsonValue,
} from './acp-message.ts'

type Pending = {
  readonly resolve: (
    result: ResultType<JsonValue | undefined, AcpRpcError | AcpExitedError | AcpTransportError>,
  ) => void
}

/** Handles one request sent by an ACP agent. */
export type AcpRequestHandler = (
  method: string,
  params: JsonValue | undefined,
) => Promise<ResultType<JsonValue, JsonRpcError>>

/** Input required to start one ACP client. */
export type StartAcpClient = {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly onUpdate: (update: AcpSessionUpdate) => void
  readonly onRequest: AcpRequestHandler
}

/** Starts ACP agent processes and connects their standard streams. */
export class AcpClientFactory {
  /** Start one ACP agent process. */
  start(input: StartAcpClient): Promise<ResultType<AcpClient, AcpStartError>> {
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
        resolve(Result.ok(new AcpClient(child, input.onUpdate, input.onRequest)))
      })
    })
  }
}

/** One active ACP connection over a child process. */
export class AcpClient {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private closed = false
  private readonly onSignal: () => void

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onUpdate: (update: AcpSessionUpdate) => void,
    private readonly onRequest: AcpRequestHandler,
  ) {
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      this.handleLine(line)
    })
    child.stderr.resume()
    child.on('exit', (code) => {
      this.failAll(new AcpExitedError({ code }))
    })
    child.on('error', (cause) => {
      this.failAll(new AcpTransportError({ cause }))
    })
    child.stdin.on('error', (cause) => {
      this.failAll(new AcpTransportError({ cause }))
    })
    this.onSignal = () => {
      void this.stop()
    }
    process.once('SIGINT', this.onSignal)
    process.once('SIGTERM', this.onSignal)
  }

  /** Send one ACP request and wait for its response. */
  request(
    request: AcpRequest,
  ): Promise<ResultType<JsonValue | undefined, AcpRpcError | AcpExitedError | AcpTransportError>> {
    const id = this.nextId
    this.nextId += 1
    const stdin = this.child.stdin
    if (
      this.closed ||
      this.child.exitCode !== null ||
      this.child.signalCode !== null ||
      stdin.writableEnded
    ) {
      return Promise.resolve(Result.err(new AcpExitedError({ code: this.child.exitCode })))
    }

    return new Promise((resolve) => {
      this.pending.set(id, { resolve })
      const body = `${JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: request.method,
        params: request.params,
      })}\n`
      stdin.write(body, (cause) => {
        if (cause === null || cause === undefined) return
        const pending = this.pending.get(id)
        if (pending === undefined) return
        this.pending.delete(id)
        pending.resolve(Result.err(new AcpTransportError({ cause })))
      })
    })
  }

  /** Stop the child process and remove its signal handlers. */
  async stop(): Promise<void> {
    process.removeListener('SIGINT', this.onSignal)
    process.removeListener('SIGTERM', this.onSignal)
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return
    }
    this.child.kill('SIGTERM')
    const exited = await waitForExit(this.child, 2_000)
    if (!exited) {
      this.child.kill('SIGKILL')
      await waitForExit(this.child, 2_000)
    }
  }

  private handleLine(line: string): void {
    const parsed = parseAcpLine(line)
    if (parsed === undefined) {
      return
    }
    if (parsed.kind === 'update') {
      this.onUpdate(parsed.update)
      return
    }
    if (parsed.kind === 'incoming') {
      void this.replyToIncoming(parsed.id, parsed.method, parsed.params)
      return
    }
    const pending = this.pending.get(parsed.id)
    if (pending === undefined) {
      return
    }
    this.pending.delete(parsed.id)
    if (parsed.error !== undefined) {
      pending.resolve(Result.err(new AcpRpcError({ rpc: parsed.error })))
      return
    }
    pending.resolve(Result.ok(parsed.result))
  }

  private async replyToIncoming(
    id: number,
    method: string,
    params: JsonValue | undefined,
  ): Promise<void> {
    const stdin = this.child.stdin
    if (
      this.closed ||
      this.child.exitCode !== null ||
      this.child.signalCode !== null ||
      stdin.writableEnded
    ) {
      return
    }
    const answered = await this.onRequest(method, params)
    const body = answered.isOk()
      ? { jsonrpc: '2.0', id, result: answered.value }
      : { jsonrpc: '2.0', id, error: answered.error }
    stdin.write(`${JSON.stringify(body)}\n`, () => undefined)
  }

  private failAll(error: AcpExitedError | AcpTransportError): void {
    for (const pending of this.pending.values()) {
      pending.resolve(Result.err(error))
    }
    this.pending.clear()
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) {
        return
      }
      settled = true
      child.removeListener('exit', onExit)
      clearTimeout(timer)
      // oxlint-disable-next-line promise/no-multiple-resolved -- The settled guard permits one resolve.
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
