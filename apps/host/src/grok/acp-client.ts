import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

import { Result, type Result as ResultType } from 'better-result'

import { AcpRpcError, GrokExitedError, GrokNotFoundError } from '../errors.ts'
import { answerIncomingRequest } from './acp-incoming.ts'
import { parseAcpLine, type AcpRequest, type JsonValue, type SessionUpdate } from './acp-message.ts'

type Pending = {
  readonly resolve: (
    result: ResultType<JsonValue | undefined, AcpRpcError | GrokExitedError>,
  ) => void
}

/**
 * One `grok agent stdio` child. This class is not a process.
 * It starts the Grok binary and speaks JSON-RPC on pipes.
 */
export class AcpClient {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private closed = false
  private readonly onSignal: () => void

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onUpdate: (update: SessionUpdate) => void,
  ) {
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      this.handleLine(line)
    })
    child.stderr.resume()
    child.on('exit', (code) => {
      this.failAll(new GrokExitedError({ code }))
    })
    this.onSignal = () => {
      void this.stop()
    }
    process.once('SIGINT', this.onSignal)
    process.once('SIGTERM', this.onSignal)
  }

  /**
   * Spawn `grok --no-auto-update agent stdio` in `cwd`.
   *
   * @param cwd - Session working directory.
   * @param onUpdate - Each parsed `session/update` payload.
   */
  static start(
    cwd: string,
    onUpdate: (update: SessionUpdate) => void,
  ): Promise<ResultType<AcpClient, GrokNotFoundError>> {
    return new Promise((resolve) => {
      const child = spawn('grok', ['--no-auto-update', 'agent', 'stdio'], {
        cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const onError = (): void => {
        resolve(Result.err(new GrokNotFoundError()))
      }
      child.once('error', onError)
      child.once('spawn', () => {
        child.removeListener('error', onError)
        resolve(Result.ok(new AcpClient(child, onUpdate)))
      })
    })
  }

  /**
   * Send one typed ACP request and wait for its result.
   *
   * @param request - Method plus params.
   */
  request(
    request: AcpRequest,
  ): Promise<ResultType<JsonValue | undefined, AcpRpcError | GrokExitedError>> {
    const id = this.nextId
    this.nextId += 1
    const stdin = this.child.stdin
    if (this.closed || stdin.writableEnded) {
      return Promise.resolve(Result.err(new GrokExitedError({ code: this.child.exitCode })))
    }

    return new Promise((resolve) => {
      this.pending.set(id, { resolve })
      stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method: request.method, params: request.params })}\n`,
      )
    })
  }

  /** SIGTERM the child, then SIGKILL if it stays. */
  async stop(): Promise<void> {
    process.removeListener('SIGINT', this.onSignal)
    process.removeListener('SIGTERM', this.onSignal)
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.child.exitCode !== null) {
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
    if (this.closed || stdin.writableEnded) {
      return
    }
    const answered = await answerIncomingRequest(method, params)
    const body = answered.isOk()
      ? { jsonrpc: '2.0', id, result: answered.value }
      : { jsonrpc: '2.0', id, error: answered.error }
    stdin.write(`${JSON.stringify(body)}\n`)
  }

  private failAll(error: GrokExitedError): void {
    for (const pending of this.pending.values()) {
      pending.resolve(Result.err(error))
    }
    this.pending.clear()
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) {
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
