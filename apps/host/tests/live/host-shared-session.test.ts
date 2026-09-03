import type { NewSessionResponse, PromptResponse } from '@agentclientprotocol/sdk'
import { createCommand, createQuery } from '@host/domain/messages/types.ts'
import {
  ConversationIdSchema,
  createAttemptId,
  turnIdFor,
  type ConversationId,
} from '@porte/core/client'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { GrokClient, type SessionUpdateJson } from './grok-client.ts'
import { cleanupGrokSessions, createGitWorkspace, describeLive } from './grok-resources.ts'
import {
  GROK_TIMEOUT_MS,
  sentEvent,
  sentEvents,
  turnFinished,
  userMessage,
  withHost,
  type HostHarness,
} from './host-harness.ts'

/**
 * The Host and a TUI stand-in on one Grok session. Whoever types, the other
 * side streams it, can stop it, and can answer its permission requests. Real
 * bus, real handlers, real Grok; only the relay socket is a recorder.
 */
const PERMISSION_PROMPT = 'Run exactly this shell command and nothing else: git stash list'
const LONG_PROMPT =
  'Write the numbers from one to two hundred as words, one per line, nothing else.'

const text = (value: string) => [{ type: 'text' as const, text: value }]
const ofKind = (updates: readonly SessionUpdateJson[], kind: string) =>
  updates.filter((update) => update.sessionUpdate === kind)
const promptOf = (client: GrokClient, sessionId: string, prompt: string) =>
  client.request<PromptResponse>(
    'session/prompt',
    { sessionId, prompt: text(prompt) },
    GROK_TIMEOUT_MS,
  )
const startTurn = (deps: HostHarness, conversationId: ConversationId, prompt: string) =>
  deps.bus.handle(
    createCommand('StartTurn', {
      conversationId,
      attemptId: createAttemptId(),
      userMessage: userMessage(prompt),
    }),
  )

describeLive('Host on a shared Grok session', () => {
  let cwd: string
  let tui: GrokClient

  beforeAll(async () => {
    cwd = await createGitWorkspace()
    tui = await GrokClient.start('tui', cwd, 'allow-once')
  }, GROK_TIMEOUT_MS)

  afterAll(async () => {
    await tui.stop()
    await cleanupGrokSessions()
  })

  it(
    'both directions: a Porte turn reaches the TUI live, a TUI turn reaches the relay live',
    async () => {
      await withHost(async (deps) => {
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        await deps.connections.connectConversation(id, cwd)
        await tui.request('session/load', { sessionId: id, cwd, mcpServers: [] })

        // Porte → TUI.
        await startTurn(deps, id, 'Reply with exactly: one')
        await tui.waitForUpdates(
          id,
          (u) => ofKind(u, 'turn_completed').length === 1,
          GROK_TIMEOUT_MS,
        )
        expect(ofKind(tui.updates(id), 'agent_message_chunk').length).toBeGreaterThan(0)
        const first = await turnFinished(deps, id)
        expect(first).toMatchObject({ turnId: turnIdFor(id, 0), outcome: { type: 'completed' } })

        // TUI → Porte: the Host never called prompt, yet it reports the whole turn.
        const prompt = promptOf(tui, id, 'Reply with exactly: two')
        const started = await sentEvent(
          deps,
          id,
          'turn.started',
          (e) => e.turnId === turnIdFor(id, 1),
        )
        expect(started.turnId).toBe(turnIdFor(id, 1))
        await sentEvent(deps, id, 'message.delta', (e) => e.turnId === turnIdFor(id, 1))
        expect((await prompt).stopReason).toBe('end_turn')
        const second = await sentEvent(
          deps,
          id,
          'turn.finished',
          (e) => e.turnId === turnIdFor(id, 1),
        )
        expect(second.outcome).toEqual({ type: 'completed', reason: 'completed' })

        const state = await deps.bus.handle(createQuery('GetConversation', { conversationId: id }))
        const messages = state.items.filter((item) => item.type === 'message')
        expect(messages).toHaveLength(4)
        expect(messages[2]).toMatchObject({
          role: 'user',
          content: [{ text: 'Reply with exactly: two' }],
        })
      })
    },
    GROK_TIMEOUT_MS * 2,
  )

  it(
    'permissions from either side: Porte answers a TUI tool, the TUI answers a Porte tool',
    async () => {
      await withHost(async (deps) => {
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        await deps.connections.connectConversation(id, cwd)
        const holding = await GrokClient.start('tui-holding', cwd, 'hold')
        try {
          await holding.request('session/load', { sessionId: id, cwd, mcpServers: [] })

          // TUI asks, holds its own copy; Porte answers.
          const fromTui = promptOf(holding, id, PERMISSION_PROMPT)
          const requested = await sentEvent(deps, id, 'permission.requested')
          const allow =
            requested.options.find((o) => o.kind === 'allow_once') ?? requested.options[0]
          if (allow === undefined) throw new TypeError('no permission option')
          await deps.bus.handle(
            createCommand('AnswerPermission', {
              conversationId: id,
              turnId: requested.turnId,
              permissionId: requested.permissionId,
              optionId: allow.optionId,
            }),
          )
          expect((await fromTui).stopReason).toBe('end_turn')
          await sentEvent(deps, id, 'turn.finished', (e) => e.turnId === requested.turnId)
        } finally {
          await holding.stop()
        }

        // Porte asks; the TUI stand-in answers first; the Host's own card resolves.
        await tui.request('session/load', { sessionId: id, cwd, mcpServers: [] })
        await startTurn(deps, id, PERMISSION_PROMPT)
        const turnId = turnIdFor(id, 1)
        await sentEvent(deps, id, 'permission.requested', (e) => e.turnId === turnId)
        await tui.waitForPermissionRequests(1, GROK_TIMEOUT_MS)
        const resolved = await sentEvent(
          deps,
          id,
          'permission.resolved',
          (e) => e.turnId === turnId,
        )
        expect(resolved.outcome).toEqual({ type: 'answered-elsewhere' })
        const finished = await sentEvent(deps, id, 'turn.finished', (e) => e.turnId === turnId)
        expect(finished.outcome).toMatchObject({ type: 'completed' })
      })
    },
    GROK_TIMEOUT_MS * 2,
  )

  it(
    'Porte stops a TUI turn, and a TUI cancel ends a Porte turn as cancelled',
    async () => {
      await withHost(async (deps) => {
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        await deps.connections.connectConversation(id, cwd)
        await tui.request('session/load', { sessionId: id, cwd, mcpServers: [] })

        const fromTui = promptOf(tui, id, LONG_PROMPT)
        await sentEvent(deps, id, 'message.delta', (e) => e.turnId === turnIdFor(id, 0))
        await deps.bus.handle(
          createCommand('CancelTurn', { conversationId: id, turnId: turnIdFor(id, 0) }),
        )
        expect((await fromTui).stopReason).toBe('cancelled')
        const stopped = await sentEvent(
          deps,
          id,
          'turn.finished',
          (e) => e.turnId === turnIdFor(id, 0),
        )
        expect(stopped.outcome).toEqual({ type: 'cancelled' })

        await startTurn(deps, id, LONG_PROMPT)
        await tui.waitForUpdates(
          id,
          (u) =>
            ofKind(u, 'agent_message_chunk').length > 0 && ofKind(u, 'turn_completed').length === 1,
          GROK_TIMEOUT_MS,
        )
        await tui.notify('session/cancel', { sessionId: id })
        const cancelled = await sentEvent(
          deps,
          id,
          'turn.finished',
          (e) => e.turnId === turnIdFor(id, 1),
        )
        expect(cancelled.outcome).toEqual({ type: 'cancelled' })
      })
    },
    GROK_TIMEOUT_MS * 2,
  )

  it(
    'opens a TUI session mid-turn as running, then follows it to the end',
    async () => {
      await withHost(async (deps) => {
        const created = await tui.request<NewSessionResponse>('session/new', {
          cwd,
          mcpServers: [],
        })
        const id = ConversationIdSchema.parse(created.sessionId)
        const prompt = promptOf(tui, id, LONG_PROMPT)
        await tui.waitForUpdates(
          id,
          (u) => ofKind(u, 'agent_message_chunk').length > 0,
          GROK_TIMEOUT_MS,
        )

        await deps.bus.handle(createCommand('OpenConversation', { conversationId: id, cwd }))
        await deps.connections.connectConversation(id, cwd)
        const opened = await deps.bus.handle(createQuery('GetConversation', { conversationId: id }))
        expect(opened.turn).toMatchObject({ state: 'running', turnId: turnIdFor(id, 0) })

        expect((await prompt).stopReason).toBe('end_turn')
        const finished = await turnFinished(deps, id)
        expect(finished.outcome).toEqual({ type: 'completed', reason: 'completed' })
        const state = await deps.bus.handle(createQuery('GetConversation', { conversationId: id }))
        expect(state.turn).toEqual({ state: 'idle' })
        expect(state.items.filter((item) => item.type === 'message')).toHaveLength(2)
      })
    },
    GROK_TIMEOUT_MS * 2,
  )

  it(
    'closing a conversation on the Host leaves the Grok session usable by the TUI',
    async () => {
      await withHost(async (deps) => {
        const { id } = await deps.bus.handle(createCommand('CreateConversation', { cwd }))
        await tui.request('session/load', { sessionId: id, cwd, mcpServers: [] })
        await deps.bus.handle(createCommand('CloseConversation', { conversationId: id }))
        expect(sentEvents(deps, id).some((e) => e.type === 'turn.started')).toBe(false)

        const result = await promptOf(tui, id, 'Reply with exactly: still here')
        expect(result.stopReason).toBe('end_turn')
      })
    },
    GROK_TIMEOUT_MS,
  )
})
