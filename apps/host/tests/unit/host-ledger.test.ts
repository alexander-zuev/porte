import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileHostLedger } from '@host/adapters/node/host-ledger.ts'
import {
  HOST_OPERATION_RETENTION_MS,
  ConversationEventSchema,
  ConversationIdSchema,
  EventSequenceSchema,
  createHostCommand,
  createOperationId,
  createTurnId,
} from '@porte/core/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const folders: string[] = []
const PAIRING_SCOPE = 'https://porte.test/relay\ntoken-a'

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })))
})

describe('FileHostLedger', () => {
  it('restores one completed command response', async () => {
    const { file, ledger } = await openLedger()
    const operationId = createOperationId()
    const command = createHostCommand({ operationId, method: 'conversations.sync' })
    const response = {
      v: 2,
      type: 'command.result',
      operationId,
      result: { eventHeads: {} },
    } as const
    await ledger.startOperation(command)
    await ledger.completeOperation(response)

    const restored = new FileHostLedger(file)
    await restored.open(PAIRING_SCOPE)
    expect(restored.terminalResponse(command)).toEqual(response)
  })

  it('keeps an event until its acknowledgment', async () => {
    const { ledger } = await openLedger()
    const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
    const event = ConversationEventSchema.parse({
      type: 'turn.started',
      turnId: createTurnId(),
    })
    const message = await ledger.recordEvent({ conversationId, event })
    expect(ledger.pendingEvents()).toHaveLength(1)

    await ledger.acknowledgeEvents(conversationId, message.eventSequence)
    expect(ledger.pendingEvents()).toEqual([])
  })

  it('keeps all unacknowledged stream records', async () => {
    const { ledger } = await openLedger()
    const conversationId = ConversationIdSchema.parse('conversation-1')
    const event = ConversationEventSchema.parse({ type: 'turn.started', turnId: createTurnId() })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1)

    try {
      const first = await ledger.recordEvent({ conversationId, event })
      clock.mockReturnValue(HOST_OPERATION_RETENTION_MS + 2)
      await ledger.recordSnapshot(conversationId, idleState)

      expect(ledger.pendingEvents()).toContainEqual(first)
    } finally {
      clock.mockRestore()
    }
  })

  it('orders events and snapshots within each conversation', async () => {
    const { ledger } = await openLedger()
    const first = ConversationIdSchema.parse('conversation-1')
    const second = ConversationIdSchema.parse('conversation-2')
    const event = ConversationEventSchema.parse({ type: 'turn.started', turnId: createTurnId() })
    const firstEvent = await ledger.recordEvent({ conversationId: first, event })
    const snapshot = await ledger.recordSnapshot(first, idleState)
    const secondEvent = await ledger.recordEvent({ conversationId: second, event })

    expect([firstEvent.eventSequence, snapshot.throughEventSequence]).toEqual([1, 2])
    expect(secondEvent.eventSequence).toBe(1)
  })

  it('continues after the relay restores a missing ledger position', async () => {
    const { ledger } = await openLedger()
    const conversationId = ConversationIdSchema.parse('conversation-1')
    const event = ConversationEventSchema.parse({ type: 'turn.started', turnId: createTurnId() })

    await ledger.acknowledgeEvents(conversationId, EventSequenceSchema.parse(12))
    const recorded = await ledger.recordEvent({ conversationId, event })

    expect(recorded.eventSequence).toBe(13)
  })

  it('starts fresh on a ledger this build cannot read', async () => {
    const { file } = await ledgerPath()
    await writeFile(file, '{"operations":"invalid"}', 'utf8')

    const ledger = new FileHostLedger(file)
    await expect(ledger.open(PAIRING_SCOPE)).resolves.toBeUndefined()
    expect(ledger.pendingEvents()).toEqual([])
  })

  it('keeps an expired command as a terminal response', async () => {
    const { file } = await ledgerPath()
    const operationId = createOperationId()
    const command = createHostCommand({ operationId, method: 'conversations.sync' })
    const createdAt = Date.now()
    await writeFile(
      file,
      JSON.stringify({
        scopeId: pairingScopeId(PAIRING_SCOPE),
        operations: { [operationId]: { status: 'pending', command, createdAt } },
        nextEventSequence: {},
        events: [],
      }),
    )

    const ledger = new FileHostLedger(file)
    await ledger.open(PAIRING_SCOPE)
    expect(ledger.terminalResponse(command)).toMatchObject({
      error: { _tag: 'OperationExpiredError' },
    })
  })

  it('does not replay records from another pairing', async () => {
    const { file, ledger } = await openLedger()
    const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')
    const event = ConversationEventSchema.parse({
      type: 'turn.started',
      turnId: createTurnId(),
    })
    await ledger.recordEvent({ conversationId, event })

    const repaired = new FileHostLedger(file)
    await repaired.open('https://porte.test/relay\ntoken-b')
    expect(repaired.pendingEvents()).toEqual([])
  })
})

async function openLedger() {
  const target = await ledgerPath()
  const ledger = new FileHostLedger(target.file)
  await ledger.open(PAIRING_SCOPE)
  return { ...target, ledger }
}

function pairingScopeId(scope: string): string {
  return createHash('sha256').update(scope).digest('hex')
}

async function ledgerPath() {
  const folder = await mkdtemp(join(tmpdir(), 'porte-ledger-'))
  folders.push(folder)
  return { folder, file: join(folder, 'relay-ledger.json') }
}

const idleState = {
  turn: { state: 'idle' as const },
  plans: [],
  usage: null,
  configuration: null,
  commands: null,
  modeId: null,
  pending: { permissions: [], elicitations: [] },
}
