/* oxlint-disable no-underscore-dangle -- ACP reserves `_meta` for provider data. */
import { randomUUID } from 'node:crypto'

import type {
  ListSessionsResponse,
  LoadSessionResponse,
  NewSessionResponse,
  PromptResponse,
} from '@agentclientprotocol/sdk'
import { parseSessionModels } from '@host/infrastructure/acp/acp-content.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { z } from 'zod'

import { GrokClient, writeFrames, type SessionUpdateJson } from './grok-client.ts'
import { cleanupGrokSessions, createGitWorkspace, describeLive } from './grok-resources.ts'

/**
 * The Grok facts Porte builds on, checked against real Grok with raw ACP
 * clients and no Porte code. `A` and `B` stand for the TUI and the Host; extra
 * clients join where the fact is about joining. If Grok changes how clients
 * share a session, this file fails before anything in the Host does.
 *
 * One session runs through the file in order; each test adds turns to it.
 * Every test must finish inside TEST_TIMEOUT_MS, so prompts are one word long.
 */
const TEST_TIMEOUT_MS = 60_000
const WAIT_MS = 45_000

// Grok asks before every shell command in its default permission mode.
const PERMISSION_PROMPT = 'Run exactly this shell command and nothing else: git stash list'
// Streams for a few seconds: long enough to interrupt or join, short enough to let finish.
const STREAMING_PROMPT = 'Write the numbers from one to forty as words, one per line, nothing else.'

const text = (value: string) => [{ type: 'text' as const, text: value }]
const ofKind = (updates: readonly SessionUpdateJson[], kind: string) =>
  updates.filter((update) => update.sessionUpdate === kind)
const hiddenChunkSchema = z.object({ _meta: z.object({ hideFromScrollback: z.literal(true) }) })
/** What a person typed. Grok also inserts hidden user chunks (after a cancel) that take a prompt slot. */
const typedChunks = (updates: readonly SessionUpdateJson[]) =>
  ofKind(updates, 'user_message_chunk').filter((u) => !hiddenChunkSchema.safeParse(u).success)
const completions = (updates: readonly SessionUpdateJson[]) => ofKind(updates, 'turn_completed')
const promptIndexSchema = z.object({ _meta: z.object({ promptIndex: z.number() }) })
const promptIndexOf = (update: SessionUpdateJson | undefined): number | undefined => {
  const parsed = promptIndexSchema.safeParse(update)
  return parsed.success ? parsed.data._meta.promptIndex : undefined
}
const promptOf = (client: GrokClient, sessionId: string, prompt: string) =>
  client.request<PromptResponse>('session/prompt', { sessionId, prompt: text(prompt) }, WAIT_MS)
/** Resolve once the session has more `turn_completed` frames than `before`. */
const nextCompletion = (client: GrokClient, sessionId: string, before: number) =>
  client.waitForUpdates(sessionId, (u) => completions(u).length > before, WAIT_MS)
/** Resolve once the answer started streaming past `before` chunks. */
const streamingStarted = (client: GrokClient, sessionId: string, before: number) =>
  client.waitForUpdates(sessionId, (u) => ofKind(u, 'agent_message_chunk').length > before, WAIT_MS)

describeLive('Grok shared session', () => {
  let cwd: string
  let a: GrokClient
  let b: GrokClient
  let sessionId: string

  beforeAll(async () => {
    cwd = await createGitWorkspace()
    a = await GrokClient.start('A', cwd, 'hold')
    b = await GrokClient.start('B', cwd, 'allow-once')
  }, TEST_TIMEOUT_MS)

  afterAll(async () => {
    await a.stop()
    await b.stop()
    await cleanupGrokSessions()
  })

  it(
    'lists a new session to the other client, which loads it with models and commands',
    async () => {
      const created = await a.request<NewSessionResponse>('session/new', { cwd, mcpServers: [] })
      sessionId = created.sessionId
      const loaded = await b.request<LoadSessionResponse>('session/load', {
        sessionId,
        cwd,
        mcpServers: [],
      })
      expect(parseSessionModels(loaded)?.currentModelId).toBeTruthy()
      expect(loaded._meta).toHaveProperty('x.ai/sessionConfig')
      await b.waitForUpdates(sessionId, (u) => ofKind(u, 'available_commands_update').length > 0)

      const listed = await b.request<ListSessionsResponse>('session/list', {})
      expect(listed.sessions.find((s) => s.sessionId === sessionId)).toMatchObject({ cwd })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'rejects a load of a session that does not exist',
    async () => {
      await expect(
        b.request('session/load', { sessionId: randomUUID(), cwd, mcpServers: [] }),
      ).rejects.toThrow()
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'streams the first client turn to the second client live, and ends it with usage on both channels',
    async () => {
      const prompt = promptOf(a, sessionId, 'Reply with exactly: one')
      // The echo reaches B while A's prompt is still open: fan-out, not replay.
      await b.waitForUpdates(sessionId, (u) => typedChunks(u).length === 1, WAIT_MS)
      const result = await prompt
      expect(result.stopReason).toBe('end_turn')
      expect(result._meta).toMatchObject({ totalTokens: expect.any(Number) })
      await nextCompletion(b, sessionId, 0)

      const seen = b.updates(sessionId)
      expect(promptIndexOf(typedChunks(seen)[0])).toBe(0)
      expect(ofKind(seen, 'agent_message_chunk').length).toBeGreaterThan(0)
      expect(completions(seen)[0]).toMatchObject({
        stop_reason: 'end_turn',
        usage: { totalTokens: expect.any(Number) },
      })
      await writeFrames('grok-tui-turn', b.frames)

      // The git root facet exists once a turn ran; Grok spells it with a trailing separator.
      const listed = await b.request<ListSessionsResponse>('session/list', {})
      const row = listed.sessions.find((s) => s.sessionId === sessionId)
      const facets = z
        .object({ 'x.ai/session': z.object({ facets: z.object({ gitRoot: z.string() }) }) })
        .parse(row?._meta)
      expect(normaliseGitRoot(facets['x.ai/session'].facets.gitRoot)).toBe(cwd)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'lets the second client continue the session, and the first client sees the echo',
    async () => {
      const before = completions(a.updates(sessionId)).length
      const result = await promptOf(b, sessionId, 'Reply with exactly: two')
      expect(result.stopReason).toBe('end_turn')
      await nextCompletion(a, sessionId, before)

      const echo = typedChunks(a.updates(sessionId)).at(-1)
      expect(promptIndexOf(echo)).toBe(1)
      expect(echo).toMatchObject({ content: { text: 'Reply with exactly: two' } })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'runs prompts from both clients one at a time, in order',
    async () => {
      const before = completions(a.updates(sessionId)).length
      const [three, four] = await Promise.all([
        promptOf(a, sessionId, 'Reply with exactly: three'),
        promptOf(b, sessionId, 'Reply with exactly: four'),
      ])
      expect(three.stopReason).toBe('end_turn')
      expect(four.stopReason).toBe('end_turn')
      await a.waitForUpdates(sessionId, (u) => completions(u).length === before + 2, WAIT_MS)

      const boundaries = a
        .updates(sessionId)
        .filter(
          (u) => u.sessionUpdate === 'user_message_chunk' || u.sessionUpdate === 'turn_completed',
        )
        .map((u) => u.sessionUpdate)
      expect(boundaries.slice(-4)).toEqual([
        'user_message_chunk',
        'turn_completed',
        'user_message_chunk',
        'turn_completed',
      ])
      expect(typedChunks(a.updates(sessionId)).map(promptIndexOf)).toEqual([0, 1, 2, 3])
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'fans out tool calls and permission requests, and runs the tool on the other client answer',
    async () => {
      const prompt = promptOf(a, sessionId, PERMISSION_PROMPT)
      await a.waitForPermissionRequests(1, WAIT_MS)
      await b.waitForPermissionRequests(1, WAIT_MS)
      expect(b.permissionRequests[0]?.toolCall.toolCallId).toBe(
        a.permissionRequests[0]?.toolCall.toolCallId,
      )
      // A holds its copy forever; B's answer is enough for Grok.
      expect((await prompt).stopReason).toBe('end_turn')

      for (const client of [a, b]) {
        const updates = client.updates(sessionId)
        expect(ofKind(updates, 'tool_call').length).toBeGreaterThan(0)
        expect(ofKind(updates, 'tool_call_update').some((u) => u.status === 'completed')).toBe(true)
      }
      // Nothing else asks A: the answered request is settled, not re-asked.
      expect(a.permissionRequests).toHaveLength(1)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'applies set_model from one client to the session every client loads',
    async () => {
      const loaded = await a.request<LoadSessionResponse>('session/load', {
        sessionId,
        cwd,
        mcpServers: [],
      })
      const models = parseSessionModels(loaded)
      if (models === undefined) throw new TypeError('load carried no models')
      const other = models.availableModels.find((m) => m.modelId !== models.currentModelId)
      if (other === undefined) throw new TypeError('only one model available')

      await a.request('session/set_model', { sessionId, modelId: other.modelId })
      const joiner = await GrokClient.start('joiner', cwd, 'allow-once')
      try {
        const seen = await joiner.request<LoadSessionResponse>('session/load', {
          sessionId,
          cwd,
          mcpServers: [],
        })
        expect(parseSessionModels(seen)?.currentModelId).toBe(other.modelId)
      } finally {
        await joiner.stop()
        await a.request('session/set_model', { sessionId, modelId: models.currentModelId })
      }
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'cancels a running turn from the client that did not start it',
    async () => {
      const before = completions(a.updates(sessionId)).length
      const chunks = ofKind(b.updates(sessionId), 'agent_message_chunk').length
      const prompt = promptOf(a, sessionId, STREAMING_PROMPT)
      await streamingStarted(b, sessionId, chunks)
      await b.notify('session/cancel', { sessionId })
      expect((await prompt).stopReason).toBe('cancelled')
      await nextCompletion(a, sessionId, before)
      expect(completions(a.updates(sessionId)).at(-1)).toMatchObject({ stop_reason: 'cancelled' })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'loads a session mid-turn as the partial turn, then follows it live to the end',
    async () => {
      const chunks = ofKind(b.updates(sessionId), 'agent_message_chunk').length
      const prompt = promptOf(a, sessionId, STREAMING_PROMPT)
      await streamingStarted(b, sessionId, chunks)
      const joiner = await GrokClient.start('joiner', cwd, 'allow-once')
      try {
        await joiner.request('session/load', { sessionId, cwd, mcpServers: [] })
        const replayed = joiner.updates(sessionId)
        // Every typed turn but the running one has ended.
        expect(typedChunks(replayed)).toHaveLength(completions(replayed).length + 1)

        const before = completions(replayed).length
        expect((await prompt).stopReason).toBe('end_turn')
        await nextCompletion(joiner, sessionId, before)
      } finally {
        await joiner.stop()
      }
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'keeps a turn running after the client that started it disconnects',
    async () => {
      const before = completions(b.updates(sessionId)).length
      const chunks = ofKind(b.updates(sessionId), 'agent_message_chunk').length
      const leaver = await GrokClient.start('leaver', cwd, 'allow-once')
      await leaver.request('session/load', { sessionId, cwd, mcpServers: [] })
      void promptOf(leaver, sessionId, STREAMING_PROMPT).catch(() => undefined)
      await streamingStarted(b, sessionId, chunks)
      await leaver.stop()

      await nextCompletion(b, sessionId, before)
      expect(completions(b.updates(sessionId)).at(-1)).toMatchObject({ stop_reason: 'end_turn' })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'replays the whole finished session to a new client, turn by turn',
    async () => {
      const joiner = await GrokClient.start('joiner', cwd, 'allow-once')
      try {
        await joiner.request('session/load', { sessionId, cwd, mcpServers: [] })
        const replayed = joiner.updates(sessionId)
        const indexes = typedChunks(replayed).map(promptIndexOf)
        expect(indexes).toEqual(typedChunks(b.updates(sessionId)).map(promptIndexOf))
        expect(indexes).toEqual([...indexes].sort((x, y) => (x ?? 0) - (y ?? 0)))
        expect(new Set(indexes).size).toBe(indexes.length)
        expect(completions(replayed)).toHaveLength(typedChunks(replayed).length)
        await writeFrames('grok-session-load', joiner.frames)
      } finally {
        await joiner.stop()
      }
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'ends the session for every client when one client closes it',
    async () => {
      await a.request('session/close', { sessionId })
      await expect(promptOf(b, sessionId, 'Reply with exactly: five')).rejects.toThrow()
    },
    TEST_TIMEOUT_MS,
  )
})
