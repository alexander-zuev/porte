import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'

import * as acp from '@agentclientprotocol/sdk'
import {
  GROK_SESSION_NOTIFICATION_METHOD,
  GROK_SESSION_UPDATE_METHOD,
  type JsonValue,
} from '@host/infrastructure/acp/message.ts'
import { z } from 'zod'

/** One notification as Grok sent it, any of the three channels. */
export type GrokFrame = {
  readonly method:
    | typeof acp.methods.client.session.update
    | typeof GROK_SESSION_UPDATE_METHOD
    | typeof GROK_SESSION_NOTIFICATION_METHOD
  readonly sessionId: string
  readonly update: SessionUpdateJson
}

const sessionUpdateSchema = z
  .object({ sessionUpdate: z.string() })
  .and(z.record(z.string(), z.json()))

/** The `update` object as JSON: live tests assert on a few fields, fixtures keep it whole. */
export type SessionUpdateJson = z.infer<typeof sessionUpdateSchema>

const frameParamsSchema = z.object({ sessionId: z.string(), update: sessionUpdateSchema })

/** What a client does with `session/request_permission`: answer at once, or leave it open. */
export type PermissionPolicy = 'allow-once' | 'hold'

const START_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const POLL_MS = 100

/**
 * One raw ACP client on Grok's shared session process, standing in for a second
 * surface (the TUI beside the Host). Records every session update on both
 * channels and every permission request, so a test can assert what a peer sees.
 */
export class GrokClient {
  readonly frames: GrokFrame[] = []
  readonly permissionRequests: acp.RequestPermissionRequest[] = []
  private readonly stdio: acp.ClientConnection

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    name: string,
    policy: PermissionPolicy,
  ) {
    const app = acp
      .client({ name })
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        this.record(acp.methods.client.session.update, z.json().parse(params))
      })
      .onNotification(
        GROK_SESSION_UPDATE_METHOD,
        { parse: (raw) => z.json().parse(raw) },
        ({ params }) => {
          this.record(GROK_SESSION_UPDATE_METHOD, params)
        },
      )
      .onNotification(
        GROK_SESSION_NOTIFICATION_METHOD,
        { parse: (raw) => z.json().parse(raw) },
        ({ params }) => {
          this.record(GROK_SESSION_NOTIFICATION_METHOD, params)
        },
      )
      .onRequest(acp.methods.client.session.requestPermission, (context) => {
        this.permissionRequests.push(context.params)
        return answerPermission(policy, context.params)
      })
    child.stderr.resume()
    // SAFETY: Node exposes byte streams here because the child stdio encoding is not set.
    const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>
    // SAFETY: Node exposes byte streams here because the child stdio encoding is not set.
    const source = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
    this.stdio = app.connect(acp.ndJsonStream(output, source))
  }

  /**
   * Spawn `grok agent --leader stdio`, initialize, and sign in with the cached token.
   * The first client starts the leader; the leader exits with its last client.
   */
  static async start(name: string, cwd: string, policy: PermissionPolicy): Promise<GrokClient> {
    const child = spawn('grok', ['--no-auto-update', 'agent', '--leader', 'stdio'], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    await once(child, 'spawn', { signal: AbortSignal.timeout(START_TIMEOUT_MS) })
    const client = new GrokClient(child, name, policy)
    const initialized = await client.request<acp.InitializeResponse>('initialize', {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
      clientInfo: { name, version: '0' },
    })
    const cachedToken = initialized.authMethods?.find(
      (method) => !('type' in method) && method.id === 'cached_token',
    )
    if (cachedToken !== undefined) {
      await client.request('authenticate', { methodId: cachedToken.id, _meta: { headless: true } })
    }
    return client
  }

  /** Send one JSON-RPC request; the default deadline suits everything but a prompt. */
  request<Response>(
    method: string,
    params: JsonValue,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<Response> {
    return this.stdio.agent.request<Response, JsonValue>(method, params, {
      cancellationSignal: AbortSignal.timeout(timeoutMs),
    })
  }

  /** Send one JSON-RPC notification, such as `session/cancel`. */
  notify(method: string, params: JsonValue): Promise<void> {
    return this.stdio.agent.notify(method, params)
  }

  /** Every update seen for one session, in arrival order, both channels merged. */
  updates(sessionId: string): SessionUpdateJson[] {
    return this.frames.filter((frame) => frame.sessionId === sessionId).map((frame) => frame.update)
  }

  /** Resolve once `predicate` holds over the session's updates; reject at the deadline. */
  async waitForUpdates(
    sessionId: string,
    predicate: (updates: readonly SessionUpdateJson[]) => boolean,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate(this.updates(sessionId))) {
      if (Date.now() > deadline) {
        throw new Error(`grok client saw no matching update within ${String(timeoutMs)}ms`)
      }
      // oxlint-disable-next-line no-await-in-loop -- Polling is the point.
      await sleep(POLL_MS)
    }
  }

  /** Resolve once `count` permission requests arrived; reject at the deadline. */
  async waitForPermissionRequests(
    count: number,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (this.permissionRequests.length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `grok client saw ${String(this.permissionRequests.length)} permission requests`,
        )
      }
      // oxlint-disable-next-line no-await-in-loop -- Polling is the point.
      await sleep(POLL_MS)
    }
  }

  /** Close JSON-RPC and end the child. */
  async stop(): Promise<void> {
    this.stdio.close()
    if (this.child.exitCode !== null) return
    this.child.kill('SIGTERM')
    await once(this.child, 'exit', { signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  }

  private record(method: GrokFrame['method'], params: JsonValue): void {
    const parsed = frameParamsSchema.safeParse(params)
    if (!parsed.success) return
    this.frames.push({ method, sessionId: parsed.data.sessionId, update: parsed.data.update })
  }
}

function answerPermission(
  policy: PermissionPolicy,
  request: acp.RequestPermissionRequest,
): Promise<acp.RequestPermissionResponse> {
  if (policy === 'hold') return new Promise(() => undefined)
  const option = request.options.find((o) => o.kind === 'allow_once') ?? request.options[0]
  if (option === undefined) throw new TypeError('permission request carried no options')
  return Promise.resolve({ outcome: { outcome: 'selected', optionId: option.optionId } })
}

/**
 * Write the frames a peer saw to `$ACP_FIXTURES_DIR/<name>.json`, so unit tests
 * can replay a real TUI-started turn without Grok. A no-op unless the dir is set.
 */
export async function writeFrames(name: string, frames: readonly GrokFrame[]): Promise<void> {
  const dir = process.env.ACP_FIXTURES_DIR
  if (dir === undefined) return
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${name}.json`), JSON.stringify(frames, null, 2))
}
