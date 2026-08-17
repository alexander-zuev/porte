import { Result, type Result as ResultType } from 'better-result'

import type {
  AcpRpcError,
  DuplicateSessionError,
  GrokExitedError,
  GrokNotFoundError,
  SessionNotFoundError,
} from '../errors.ts'
import { AcpClient } from '../grok/acp-client.ts'
import type { SessionUpdate } from '../grok/acp-message.ts'
import { SessionStore } from './session-store.ts'

/** Failures from `lras resume`. */
export type ResumeFailure =
  | SessionNotFoundError
  | DuplicateSessionError
  | GrokNotFoundError
  | AcpRpcError
  | GrokExitedError

/**
 * Load a disk session and send one prompt.
 *
 * @param store - Disk session store.
 * @param sessionId - Session to load.
 * @param prompt - User text.
 * @param onUpdate - Parsed ACP updates for stdout.
 */
export async function resumeSession(
  store: SessionStore,
  sessionId: string,
  prompt: string,
  onUpdate: (update: SessionUpdate) => void,
): Promise<ResultType<void, ResumeFailure>> {
  const found = await store.find(sessionId)
  if (found.isErr()) {
    return Result.err(found.error)
  }

  const started = await AcpClient.start(found.value.summary.cwd, onUpdate)
  if (started.isErr()) {
    return Result.err(started.error)
  }

  const client = started.value
  try {
    const handshake = await handshakeAndLoad(
      client,
      found.value.summary.id,
      found.value.summary.cwd,
    )
    if (handshake.isErr()) {
      return Result.err(handshake.error)
    }
    const prompted = await client.request({
      method: 'session/prompt',
      params: {
        sessionId: found.value.summary.id,
        prompt: [{ type: 'text', text: prompt }],
      },
    })
    if (prompted.isErr()) {
      return Result.err(prompted.error)
    }
    return Result.ok()
  } finally {
    await client.stop()
  }
}

async function handshakeAndLoad(
  client: AcpClient,
  sessionId: string,
  cwd: string,
): Promise<ResultType<void, AcpRpcError | GrokExitedError>> {
  const initialized = await client.request({
    method: 'initialize',
    params: {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
    },
  })
  if (initialized.isErr()) {
    return Result.err(initialized.error)
  }

  const authenticated = await client.request({
    method: 'authenticate',
    params: {
      methodId: 'cached_token',
      _meta: { headless: true },
    },
  })
  if (authenticated.isErr()) {
    return Result.err(authenticated.error)
  }

  const loaded = await client.request({
    method: 'session/load',
    params: {
      sessionId,
      cwd,
      mcpServers: [],
    },
  })
  if (loaded.isErr()) {
    return Result.err(loaded.error)
  }
  return Result.ok()
}
