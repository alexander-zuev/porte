import type { StoredCredential } from '@host/application/ports/credential-store.ts'
import type { MachineLock } from '@host/application/ports/machine-lock.ts'
import type { RelayStatus } from '@host/application/ports/relay-status.ts'
import type { RcStateSnapshot } from '@host/application/ports/remote-control-store.ts'
import { runMcpDaemon, type McpDaemonDeps } from '@host/entrypoints/mcp/run-mcp-command.ts'
import {
  WebSocketHandlerError,
  WebSocketHandshakeRefused,
  WebSocketProtocolClose,
} from '@host/infrastructure/websocket/websocket-errors.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'

const PAIRED: StoredCredential = { baseUrl: 'https://useporte.dev', token: 'session-token' }

function daemonTest(overrides?: {
  enabled?: boolean
  credential?: StoredCredential | null
  /** What each Host run does; the default connects and waits for the abort. */
  run?: (signal: AbortSignal, onStatus?: (status: RelayStatus) => void) => Promise<void>
}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const events: string[] = []
  let state: RcStateSnapshot = { status: 'off' }
  let holding = false
  let generation = 0
  let clock = 0

  const lock: MachineLock = {
    acquire: () => {
      holding = true
      events.push('acquired')
      return Promise.resolve({ type: 'held' })
    },
    release: () => {
      if (holding) events.push('released')
      holding = false
      return Promise.resolve()
    },
  }

  const deps: McpDaemonDeps = {
    transport: serverTransport,
    lock,
    settings: {
      read: () => Promise.resolve({ enabled: overrides?.enabled ?? true, hook: false, generation }),
    },
    state: {
      read: () => Promise.resolve(state),
      write: (value) => {
        state = value
        return Promise.resolve()
      },
    },
    credentials: {
      read: () =>
        Promise.resolve(overrides?.credential === undefined ? PAIRED : overrides.credential),
    },
    installHook: () => Promise.resolve(),
    createRuntime: (signal: AbortSignal) => {
      events.push('runtime created')
      const run =
        overrides?.run ??
        ((abort: AbortSignal, onStatus?: (status: RelayStatus) => void) => {
          onStatus?.({ type: 'connected', attempt: 1 })
          return new Promise<void>((resolve) => {
            abort.addEventListener('abort', () => {
              events.push('runtime stopped')
              resolve()
            })
          })
        })
      return Promise.resolve({
        relayUrl: 'https://useporte.dev',
        runtime: { run: (onStatus?: (status: RelayStatus) => void) => run(signal, onStatus) },
      })
    },
    pollMs: 5,
    protocolRestartMs: 100,
    now: () => clock,
    sleep: (ms) => {
      clock += ms
      return new Promise((resolve) => setTimeout(resolve, ms))
    },
  }

  return {
    clientTransport,
    deps,
    events,
    state: () => state,
    /** What `/remote-control` does: a settings write the daemon can see. */
    bumpSettings: () => {
      generation += 1
    },
  }
}

describe('runMcpDaemon', () => {
  it('handshakes as an MCP server with zero tools', async () => {
    const test = daemonTest({ enabled: false })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })

    await client.connect(test.clientTransport)

    expect(client.getServerVersion()?.name).toBe('porte')
    await client.close()
    await daemon
  })

  it('connects while enabled and paired, then stops cleanly when the session ends', async () => {
    const test = daemonTest()
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await vi.waitFor(() => {
      expect(test.state()).toEqual({ status: 'on', url: 'https://useporte.dev', pid: process.pid })
    })

    await client.close()
    await daemon

    expect(test.events).toEqual(['acquired', 'runtime created', 'runtime stopped', 'released'])
    expect(test.state()).toEqual({ status: 'off' })
  })

  it('stays idle while disabled', async () => {
    const test = daemonTest({ enabled: false })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(test.events).toEqual([])
    await client.close()
    await daemon
  })

  it('a refused pairing writes the failure and waits for the person', async () => {
    const test = daemonTest({
      run: () => Promise.reject(new WebSocketHandshakeRefused({ status: 403 })),
    })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await vi.waitFor(() => {
      expect(test.state()).toEqual({
        status: 'error',
        pid: process.pid,
        failure: { type: 'unauthorized', http: 403 },
      })
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(test.events.filter((event) => event === 'runtime created')).toHaveLength(1)

    // `/remote-control` writes the settings; that is the change the daemon waits for.
    test.bumpSettings()
    await vi.waitFor(() => {
      expect(test.events.filter((event) => event === 'runtime created')).toHaveLength(2)
    })
    await client.close()
    await daemon
  })

  it('a Host bug restarts on the next poll and reads as connecting meanwhile', async () => {
    const test = daemonTest({
      run: () => Promise.reject(new WebSocketHandlerError({ cause: new Error('boom') })),
    })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await vi.waitFor(() => {
      expect(test.events.filter((event) => event === 'runtime created').length).toBeGreaterThan(1)
    })
    expect(test.state()).toEqual({ status: 'connecting', pid: process.pid })
    await client.close()
    await daemon
    expect(test.state()).toEqual({ status: 'off' })
  })

  it('a socket drop reads as connecting until the relay accepts the Host again', async () => {
    let report: ((status: RelayStatus) => void) | undefined
    const test = daemonTest({
      run: (signal, onStatus) => {
        report = onStatus
        onStatus?.({ type: 'connecting' })
        return new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            resolve()
          })
        })
      },
    })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await vi.waitFor(() => {
      expect(test.state()).toEqual({ status: 'connecting', pid: process.pid })
    })
    report?.({ type: 'connected', attempt: 0 })
    await vi.waitFor(() => {
      expect(test.state().status).toBe('on')
    })
    report?.({ type: 'reconnecting', attempt: 1, cause: 'connection-lost' })
    await vi.waitFor(() => {
      expect(test.state()).toEqual({ status: 'connecting', pid: process.pid })
    })
    report?.({ type: 'connected', attempt: 1 })
    await vi.waitFor(() => {
      expect(test.state().status).toBe('on')
    })
    await client.close()
    await daemon
  })

  it('a protocol close restarts after the delay; three in a row turn into an error', async () => {
    const test = daemonTest({
      run: () => Promise.reject(new WebSocketProtocolClose({ message: 'closed: bad frame' })),
    })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await vi.waitFor(() => {
      expect(test.events.filter((event) => event === 'runtime created')).toHaveLength(1)
    })
    // The clock advances 5 per poll; the restart delay is 100, so 10 polls pass first.
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(test.events.filter((event) => event === 'runtime created')).toHaveLength(1)

    await vi.waitFor(() => {
      expect(test.state()).toEqual({
        status: 'error',
        pid: process.pid,
        failure: { type: 'protocol' },
      })
    })
    expect(test.events.filter((event) => event === 'runtime created')).toHaveLength(3)
    await client.close()
    await daemon
  })

  it('stays idle while unpaired even when enabled', async () => {
    const test = daemonTest({ credential: null })
    const daemon = runMcpDaemon(test.deps)
    const client = new Client({ name: 'grok', version: '1.0.0' })
    await client.connect(test.clientTransport)

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(test.events).toEqual([])
    await client.close()
    await daemon
  })
})
