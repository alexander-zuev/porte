/* oxlint-disable no-console -- capture script, output is the point. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Conversation } from '@host/domain/conversation/conversation.ts'
import { AcpUpdateMapper } from '@host/infrastructure/acp/acp-update-mapper.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import { startGrok } from '@host/infrastructure/grok/grok-launch.ts'
import { ConversationIdSchema, IsoDateTimeSchema } from '@porte/core/client'

/**
 * Inspect real ACP traffic for the `/porte` conversations: list rows, each load
 * replay (stats + mapper/aggregate check), written raw to OUT for review.
 *
 *   pnpm --filter @porte/host exec tsx scripts/capture-acp-fixtures.ts <outDir> [repo]
 */
const OUT = process.argv[2] ?? '/tmp/acp-capture'
const PROJECT_CWD = process.argv[3] ?? '/Users/az/projects/porte'

await mkdir(OUT, { recursive: true })
const updates: AcpSessionNotification[] = []
const shutdown = new AbortController()
const agent = await startGrok(shutdown.signal, {
  onUpdate: (notification) => {
    updates.push(notification)
  },
  onRequest: async (_id, method) => {
    throw new AcpClientRequestError({ code: -32601, message: `unexpected ${method}` })
  },
})

try {
  const listed = await agent.process.request({ method: 'session/list', params: {} })
  const rows = listed.sessions.filter((row) => row.cwd.startsWith(PROJECT_CWD))
  console.log(
    `${String(listed.sessions.length)} sessions, ${String(rows.length)} under ${PROJECT_CWD}`,
  )
  await writeFile(join(OUT, 'list.json'), JSON.stringify({ ...listed, sessions: rows }, null, 2))

  for (const row of rows) {
    updates.length = 0
    const response = await agent.process.request({
      method: 'session/load',
      params: { sessionId: row.sessionId, cwd: row.cwd, mcpServers: [] },
      timeoutMs: 120_000,
    })
    // A trailing `available_commands_update` of the previous load can land here; keep this session only.
    const own = updates.filter((notification) => notification.sessionId === row.sessionId)
    updates.length = 0
    updates.push(...own)
    await writeFile(join(OUT, `load-${row.sessionId}.json`), JSON.stringify(updates, null, 2))
    await writeFile(
      join(OUT, `load-${row.sessionId}.response.json`),
      JSON.stringify(response, null, 2),
    )

    const kinds = new Map<string, number>()
    let turns = 0
    for (const { update } of updates) {
      kinds.set(update.sessionUpdate, (kinds.get(update.sessionUpdate) ?? 0) + 1)
      if (update.sessionUpdate === 'user_message_chunk') turns += 1
    }
    console.log(`\n${row.sessionId}  ${row.title ?? '(no title)'}`)
    console.log(`  updates=${String(updates.length)} turns=${String(turns)}`)
    console.log(`  ${[...kinds].map(([k, n]) => `${k}=${String(n)}`).join(' ')}`)

    const mapper = new AcpUpdateMapper(ConversationIdSchema.parse(row.sessionId))
    const conversation = Conversation.restore({
      id: ConversationIdSchema.parse(row.sessionId),
      cwd: row.cwd,
      gitRoot: row.cwd,
      title: row.title ?? '',
      updatedAt: IsoDateTimeSchema.parse(row.updatedAt ?? new Date().toISOString()),
    })
    try {
      let mapped = 0
      for (const notification of updates) {
        const events = mapper.map(notification)
        mapped += events.length
        conversation.replay(events)
      }
      const state = conversation.snapshot()
      console.log(
        `  mapped=${String(mapped)} items=${String(state.items.length)} tools=${String(state.tools.length)} commands=${String(state.commands?.length ?? 0)}`,
      )
    } catch (cause) {
      console.log(`  MAPPER FAILED: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
} finally {
  await agent.process.stop()
  shutdown.abort()
}
