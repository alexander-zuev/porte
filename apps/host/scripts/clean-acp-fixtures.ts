/* oxlint-disable no-console -- fixture script, output is the point. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ListSessionsResponse, LoadSessionResponse } from '@agentclientprotocol/sdk'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import { z } from 'zod'

/**
 * Turn one raw capture (see `capture-acp-fixtures.ts`) into the checked-in
 * `tests/fixtures/acp/porte-*.json`. Keeps real structure, shrinks bulk: a few
 * whole turns, the turn with a repeated `promptIndex`, one `plan`, and the last
 * commands update with three commands. Text longer than TEXT_LIMIT is cut.
 *
 *   pnpm --filter @porte/host exec tsx scripts/clean-acp-fixtures.ts <captureDir> <sessionId>
 */
const [captureDir, sessionId] = process.argv.slice(2)
if (captureDir === undefined || sessionId === undefined) {
  throw new TypeError('usage: clean-acp-fixtures.ts <captureDir> <sessionId>')
}
const OUT = join(import.meta.dirname, '../tests/fixtures/acp')
const TEXT_LIMIT = 200
const WHOLE_TURNS = 3
const COMMANDS_KEPT = 3
const TOOL_CALLS_PER_TURN = 6

const raw: AcpSessionNotification[] = JSON.parse(
  await readFile(join(captureDir, `load-${sessionId}.json`), 'utf8'),
)
const response: LoadSessionResponse = JSON.parse(
  await readFile(join(captureDir, `load-${sessionId}.response.json`), 'utf8'),
)
const listed: ListSessionsResponse = JSON.parse(
  await readFile(join(captureDir, 'list.json'), 'utf8'),
)

const promptIndexOf = (notification: AcpSessionNotification): number | undefined => {
  const update = notification.update
  if (update.sessionUpdate !== 'user_message_chunk') return undefined
  const index = z.number().safeParse(update._meta?.promptIndex)
  return index.success ? index.data : undefined
}

// Group into turns by user chunk; a repeated promptIndex stays in its turn.
const turns: AcpSessionNotification[][] = []
let current: AcpSessionNotification[] = []
let currentIndex: number | undefined
for (const notification of raw) {
  const index = promptIndexOf(notification)
  if (index !== undefined && index !== currentIndex) {
    if (current.length > 0) turns.push(current)
    current = []
    currentIndex = index
  }
  current.push(notification)
}
if (current.length > 0) turns.push(current)

const repeated = turns.find((turn) => turn.filter((n) => promptIndexOf(n) !== undefined).length > 1)
const withPlan = turns.find((turn) => turn.some((n) => n.update.sessionUpdate === 'plan'))
const kept = [...turns.slice(0, WHOLE_TURNS), withPlan, repeated].filter(
  (turn, index, all): turn is AcpSessionNotification[] =>
    turn !== undefined && all.indexOf(turn) === index,
)
const commands = raw.findLast((n) => n.update.sessionUpdate === 'available_commands_update')

const selected = [...kept.flatMap(capToolCalls), ...(commands === undefined ? [] : [commands])].map(
  shrink,
)
console.log(
  `turns kept=${String(kept.length)} updates=${String(selected.length)} (repeated=${String(repeated !== undefined)} plan=${String(withPlan !== undefined)})`,
)

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'porte-session-load.json'), JSON.stringify(selected, null, 2))
await writeFile(join(OUT, 'porte-session-load-response.json'), JSON.stringify(response, null, 2))
await writeFile(join(OUT, 'porte-session-list.json'), JSON.stringify(listed, null, 2))

/** Real turns run dozens of tool calls; the first few show the shape. */
function capToolCalls(turn: AcpSessionNotification[]): AcpSessionNotification[] {
  let seen = 0
  return turn.filter((notification) => {
    if (notification.update.sessionUpdate !== 'tool_call') return true
    seen += 1
    return seen <= TOOL_CALLS_PER_TURN
  })
}

function shrink(notification: AcpSessionNotification): AcpSessionNotification {
  const update = notification.update
  if (update.sessionUpdate === 'available_commands_update') {
    return {
      ...notification,
      update: { ...update, availableCommands: update.availableCommands.slice(0, COMMANDS_KEPT) },
    }
  }
  if (
    update.sessionUpdate === 'user_message_chunk' ||
    update.sessionUpdate === 'agent_message_chunk' ||
    update.sessionUpdate === 'agent_thought_chunk'
  ) {
    const content = update.content
    if (content.type === 'text' && content.text.length > TEXT_LIMIT) {
      return {
        ...notification,
        update: { ...update, content: { ...content, text: cut(content.text) } },
      }
    }
    return notification
  }
  if (update.sessionUpdate === 'tool_call') {
    const copy = structuredClone(update)
    for (const item of copy.content ?? []) {
      if (item.type === 'content' && item.content.type === 'text') {
        item.content.text = cut(item.content.text)
      }
    }
    // Outputs are file bodies and command logs; the view keeps them but a fixture need not.
    delete copy.rawOutput
    return { ...notification, update: copy }
  }
  return notification
}

function cut(text: string): string {
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text
}
