import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  pageOfTurns,
  readGrokTranscript,
  type StoredTranscript,
  type StoredTurn,
} from '@host/adapters/grok/grok-transcript.ts'
import {
  ConversationIdSchema,
  createTurnId,
  EventIdSchema,
  type ConversationEvent,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const conversationId = ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd')

async function write(...records: unknown[]): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'porte-transcript-'))
  const lines = records.map((record) => JSON.stringify(record)).join('\n')
  await writeFile(join(folder, 'chat_history.jsonl'), lines, 'utf8')

  return folder
}

async function read(...records: unknown[]): Promise<StoredTranscript> {
  const result = await readGrokTranscript(await write(...records), conversationId)
  if (result.isErr()) throw result.error

  return result.value
}

async function transcript(...records: unknown[]): Promise<ConversationEvent[]> {
  const stored = await read(...records)
  return stored.turns.flatMap((one) => one.events.map((event) => event))
}

const userRecord = (text: string) => ({ type: 'user', content: [{ type: 'text', text }] })

describe('readGrokTranscript', () => {
  it('reads one exchange as a turn', async () => {
    const events = await transcript(
      { type: 'system', content: 'You are Grok.' },
      userRecord('Compare the two.'),
      { type: 'assistant', content: 'Typist wraps writes in a unit of work.' },
    )

    expect(events.map((event) => event.type)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
      'message.started',
      'message.delta',
      'message.completed',
      'turn.finished',
    ])
  })

  it('starts a new turn at each user message', async () => {
    const events = await transcript(userRecord('First'), userRecord('Second'))
    const turns = new Set(
      events.filter((event) => event.type === 'turn.started').map((event) => event.turnId),
    )

    expect(turns.size).toBe(2)
  })

  it('opens a turn for an agent that answered before any prompt', async () => {
    const events = await transcript({ type: 'assistant', content: 'Resumed.' })

    expect(events.at(0)?.type).toBe('turn.started')
    expect(events.at(-1)?.type).toBe('turn.finished')
  })

  it('answers with the same identifiers every read', async () => {
    const folder = await write(userRecord('Same'), { type: 'assistant', content: 'Answer' })
    const first = await readGrokTranscript(folder, conversationId)
    const second = await readGrokTranscript(folder, conversationId)

    expect(first.isOk() && second.isOk() && first.value.turns).toEqual(
      second.isOk() ? second.value.turns : null,
    )
  })

  it('keeps the prompt but not the rules file stapled to it', async () => {
    const events = await transcript(
      userRecord(
        '<user_info>macos</user_info>\n<rules>Every rule ever written.</rules>\n<git_status>clean</git_status>\nWhat changed?',
      ),
    )
    const delta = events.find((event) => event.type === 'message.delta')

    expect(delta?.type === 'message.delta' && delta.content).toEqual({
      type: 'text',
      text: 'What changed?',
    })
  })

  it('reads the prompt out of the wrapper Grok puts it in', async () => {
    const events = await transcript(
      userRecord(
        'The user interrupted the previous turn: <user_query>Sell padel data.</user_query> Finish any pending work.',
      ),
    )
    const delta = events.find((event) => event.type === 'message.delta')

    expect(delta?.type === 'message.delta' && delta.content).toEqual({
      type: 'text',
      text: 'Sell padel data.',
    })
  })

  it('shows no message for a record that is only scaffolding', async () => {
    const events = await transcript(userRecord('<user_info>macos</user_info>'), {
      type: 'assistant',
      content: 'Ready.',
    })

    expect(events.filter((event) => event.type === 'message.started')).toHaveLength(1)
  })

  it('pairs a tool result with the call that named it', async () => {
    const events = await transcript(
      userRecord('Read it.'),
      {
        type: 'assistant',
        tool_calls: [{ id: 'call-1', name: 'read_file', arguments: '{}' }],
      },
      { type: 'tool_result', tool_call_id: 'call-1', content: 'file contents' },
    )

    const tools = events.filter((event) => event.type === 'tool.updated')
    expect(tools).toHaveLength(2)
    expect(tools[0]?.type === 'tool.updated' && tools[0].tool.status).toBe('in_progress')
    expect(tools[1]?.type === 'tool.updated' && tools[1].tool.status).toBe('completed')
  })

  it('keeps a late result under the turn that made the call', async () => {
    const events = await transcript(
      userRecord('Read it.'),
      { type: 'assistant', tool_calls: [{ id: 'call-1', name: 'read_file' }] },
      userRecord('Never mind.'),
      { type: 'tool_result', tool_call_id: 'call-1', content: 'arrived late' },
    )

    const tools = events.filter((event) => event.type === 'tool.updated')
    expect(tools[0]?.type === 'tool.updated' && tools[0].turnId).toBe(
      tools[1]?.type === 'tool.updated' ? tools[1].turnId : null,
    )
  })

  it('drops a result whose call was never announced', async () => {
    const events = await transcript(userRecord('Hi'), {
      type: 'tool_result',
      tool_call_id: 'never-seen',
      content: 'orphan',
    })

    expect(events.filter((event) => event.type === 'tool.updated')).toEqual([])
  })

  it('reads reasoning summaries', async () => {
    const events = await transcript(userRecord('Why?'), {
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: 'Because of the constraint.' }],
    })

    expect(events.map((event) => event.type)).toContain('reasoning.delta')
  })

  it('skips a malformed line rather than losing the history around it', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'porte-transcript-'))
    await writeFile(
      join(folder, 'chat_history.jsonl'),
      `${JSON.stringify(userRecord('Kept'))}\nnot json\n${JSON.stringify({ type: 'assistant', content: 'Also kept' })}`,
      'utf8',
    )

    const result = await readGrokTranscript(folder, conversationId)
    if (result.isErr()) throw result.error

    const events = result.value.turns.flatMap((one) => [...one.events])
    expect(events.filter((event) => event.type === 'message.delta')).toHaveLength(2)
    expect(result.value.skippedLines).toBe(1)
  })

  it('answers with an error rather than throwing when the file is not there', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'porte-transcript-'))
    const result = await readGrokTranscript(folder, conversationId)

    expect(result.isErr() && result.error._tag).toBe('GrokConversationFilesError')
  })
})

/** Paging cares only about how many events a turn carries, never what they say. */
function turn(index: number, size: number): StoredTurn {
  const turnId = createTurnId()
  const events = Array.from({ length: size }, (_unused, at): ConversationEvent => ({
    eventId: EventIdSchema.parse(`${String(index)}:${String(at)}`),
    conversationId,
    type: 'turn.started',
    turnId,
  }))

  return { turnId, events }
}

describe('pageOfTurns', () => {
  it('returns the newest turns and points at the ones before them', () => {
    const page = pageOfTurns([turn(0, 10), turn(1, 10), turn(2, 10)], null, 20)

    expect(page.isOk() && page.value.next).toBe('1')
    expect(page.isOk() && page.value.events).toHaveLength(20)
  })

  it('stops when the oldest turn has been delivered', () => {
    const page = pageOfTurns([turn(0, 10), turn(1, 10)], '1', 50)

    expect(page.isOk() && page.value.next).toBe(null)
  })

  it('sends a turn larger than the limit whole rather than cut', () => {
    const page = pageOfTurns([turn(0, 5), turn(1, 400)], null, 10)

    expect(page.isOk() && page.value.events).toHaveLength(400)
  })

  it('keeps its answer when the file grew between two pages', () => {
    const before = [turn(0, 10), turn(1, 10)]
    const first = pageOfTurns(before, null, 10)
    const grown = [...before, turn(2, 10)]
    const second = pageOfTurns(grown, first.isOk() ? first.value.next : null, 10)

    expect(second.isOk() && second.value.events).toEqual(before[0]?.events)
  })

  it('refuses a cursor it cannot use', () => {
    const page = pageOfTurns([turn(0, 1)], 'abc', 10)

    expect(page.isErr() && page.error._tag).toBe('GrokTranscriptCursorError')
  })
})
