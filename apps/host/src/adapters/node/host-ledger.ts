import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { HostLedgerError } from '@host/application/host-error.ts'
import {
  createLogger,
  HOST_OPERATION_DELIVERY_DEADLINE_MS,
  HOST_OPERATION_RETENTION_MS,
  EventSequenceSchema,
  HostLedgerSchema,
  createEmptyHostLedger,
  type ConversationEmission,
  type ConversationId,
  type ConversationStateSnapshot,
  type EventSequence,
  type HostCommand,
  type HostCommandResponse,
  type HostConversationEvent,
  type HostConversationSnapshot,
  type HostConversationStreamMessage,
  type HostLedger,
} from '@porte/core/client'

const logger = createLogger('host-ledger')

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

/** Stores the small host delivery ledger in one atomic JSON file. */
export class FileHostLedger {
  private state: HostLedger = createEmptyHostLedger('0'.repeat(64))
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  /**
   * Loads records only for this pairing and closes indeterminate commands.
   *
   * A file this build cannot read is replaced rather than refused. It holds
   * delivery records and replay positions, both of which the relay rebuilds,
   * so keeping it would stop the Mac from starting to protect a cache.
   */
  async open(pairingScope: string): Promise<void> {
    const scopeId = createHash('sha256').update(pairingScope).digest('hex')
    let contents
    try {
      contents = await readFile(this.filePath, 'utf8')
    } catch (cause) {
      if (!isMissing(cause)) throw new HostLedgerError({ cause })
      this.state = createEmptyHostLedger(scopeId)
      await this.update(() => undefined)
      return
    }

    // A ledger this build cannot read, or one written for another pairing,
    // holds nothing this run may use.
    const parsed = readHostLedger(contents)
    if (parsed === undefined || parsed.scopeId !== scopeId) {
      logger.warn('host_ledger_reset', { details: { path: this.filePath } })
      this.state = createEmptyHostLedger(scopeId)
      await this.update(() => undefined)
      return
    }

    this.state = parsed
    expirePendingAfterRestart(this.state, Date.now())
    await this.update(() => undefined)
  }

  /** Returns the completed or expired response for the same command. */
  terminalResponse(command: HostCommand): HostCommandResponse | undefined {
    const record = this.state.operations[command.operationId]
    if (
      record === undefined ||
      record.status === 'pending' ||
      !sameCommand(record.command, command)
    ) {
      return undefined
    }
    return record.response
  }

  /** Returns whether one operation identifier belongs to different command data. */
  conflicts(command: HostCommand): boolean {
    const record = this.state.operations[command.operationId]
    return record !== undefined && !sameCommand(record.command, command)
  }

  /** Records command acceptance before the coding agent receives it. */
  startOperation(command: HostCommand): Promise<void> {
    return this.update((ledger) => {
      ledger.operations[command.operationId] ??= {
        status: 'pending',
        command,
        createdAt: Date.now(),
      }
    })
  }

  /** Stores one command response before it is sent to the relay. */
  completeOperation(response: HostCommandResponse): Promise<void> {
    return this.update((ledger) => {
      const current = ledger.operations[response.operationId]
      if (current?.status !== 'pending') return
      ledger.operations[response.operationId] = {
        status: 'completed',
        command: current.command,
        response,
        createdAt: current.createdAt,
        completedAt: Date.now(),
      }
    })
  }

  /** Stores one event and assigns its conversation stream position. */
  recordEvent(emission: ConversationEmission): Promise<HostConversationEvent> {
    return this.recordStreamMessage(emission.conversationId, (eventSequence) => ({
      v: 2,
      type: 'conversation.event',
      conversationId: emission.conversationId,
      eventSequence,
      event: emission.event,
    }))
  }

  /** Stores one state checkpoint and assigns its conversation stream position. */
  recordSnapshot(
    conversationId: ConversationId,
    snapshot: ConversationStateSnapshot,
  ): Promise<HostConversationSnapshot> {
    return this.recordStreamMessage(conversationId, (throughEventSequence) => ({
      v: 2,
      type: 'conversation.snapshot',
      conversationId,
      throughEventSequence,
      snapshot,
    }))
  }

  /** Deletes records through the relay's durable conversation position. */
  acknowledgeEvents(
    conversationId: ConversationId,
    throughEventSequence: EventSequence,
  ): Promise<void> {
    return this.update((ledger) => {
      ledger.nextEventSequence[conversationId] = EventSequenceSchema.parse(
        Math.max(ledger.nextEventSequence[conversationId] ?? 0, throughEventSequence),
      )
      ledger.events = ledger.events.filter(
        ({ message }) =>
          message.conversationId !== conversationId ||
          streamSequence(message) > throughEventSequence,
      )
    })
  }

  /** Returns the last sequence numbered for each conversation this ledger knows. */
  eventHeads() {
    return { ...this.state.nextEventSequence }
  }

  /** Returns unacknowledged events in creation order. */
  pendingEvents(): HostConversationStreamMessage[] {
    return this.state.events
      .toSorted((left, right) => left.createdAt - right.createdAt)
      .map((record) => record.message)
  }

  private recordStreamMessage<Message extends HostConversationStreamMessage>(
    conversationId: ConversationId,
    makeMessage: (sequence: EventSequence) => Message,
  ): Promise<Message> {
    return this.update((ledger) => {
      const sequence = EventSequenceSchema.parse(
        (ledger.nextEventSequence[conversationId] ?? 0) + 1,
      )
      ledger.nextEventSequence[conversationId] = sequence
      const message = makeMessage(sequence)
      ledger.events.push({ message, createdAt: Date.now() })
      return message
    })
  }

  private update<Result>(change: (ledger: HostLedger) => Result): Promise<Result> {
    const next = structuredClone(this.state)
    const result = change(next)
    prune(next, Date.now())
    this.state = next
    const write = this.writes.then(() => persist(this.filePath, next))
    const classified = write.catch((cause) => {
      if (cause instanceof HostLedgerError) throw cause
      throw new HostLedgerError({ cause })
    })
    this.writes = classified.catch(() => undefined)
    return classified.then(() => result)
  }
}

async function persist(filePath: string, ledger: HostLedger): Promise<void> {
  const temporaryPath = `${filePath}.tmp`
  await mkdir(dirname(filePath), { recursive: true, mode: DIRECTORY_MODE })
  await writeFile(temporaryPath, JSON.stringify(ledger), { encoding: 'utf8', mode: FILE_MODE })
  await rename(temporaryPath, filePath)
}

function prune(ledger: HostLedger, now: number): void {
  for (const record of Object.values(ledger.operations)) {
    if (record.status === 'pending') {
      if (now - record.createdAt <= HOST_OPERATION_DELIVERY_DEADLINE_MS) continue
      ledger.operations[record.command.operationId] = {
        status: 'expired',
        command: record.command,
        response: operationExpired(record.command.operationId),
        createdAt: record.createdAt,
        expiredAt: now,
      }
      continue
    }
    const terminalAt = record.status === 'completed' ? record.completedAt : record.expiredAt
    if (now - terminalAt > HOST_OPERATION_RETENTION_MS) {
      delete ledger.operations[record.command.operationId]
    }
  }
}

function streamSequence(message: HostConversationStreamMessage): EventSequence {
  return message.type === 'conversation.event'
    ? message.eventSequence
    : message.throughEventSequence
}

function expirePendingAfterRestart(ledger: HostLedger, now: number): void {
  for (const record of Object.values(ledger.operations)) {
    if (record.status !== 'pending') continue
    ledger.operations[record.command.operationId] = {
      status: 'expired',
      command: record.command,
      response: operationExpired(record.command.operationId),
      createdAt: record.createdAt,
      expiredAt: now,
    }
  }
}

function operationExpired(operationId: HostCommand['operationId']): HostCommandResponse {
  return {
    v: 2,
    type: 'command.error',
    operationId,
    error: { _tag: 'OperationExpiredError', message: 'Operation expired before delivery' },
  }
}

function sameCommand(left: HostCommand, right: HostCommand): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Parses one stored ledger, or nothing when this build cannot read it. */
function readHostLedger(contents: string): HostLedger | undefined {
  try {
    const parsed = HostLedgerSchema.safeParse(JSON.parse(contents))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}
