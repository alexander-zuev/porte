import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AcpRpcError } from '@host/infrastructure/acp/error.ts'
import { GrokCodingAgent } from '@host/infrastructure/grok/grok-coding-agent.ts'
import {
  CodingAgentUnavailableError,
  ConversationBusyError,
  ConversationIdSchema,
  ConversationNotFoundError,
  ElicitationIdSchema,
  ElicitationNotFoundError,
  MessageIdSchema,
  PermissionIdSchema,
  PermissionNotFoundError,
  WorkspaceNotAllowedError,
  createTurnId,
  type ConversationEvent,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'

import { createGitWorkspace, grokOnPath, withGrokCodingAgent } from './grok-resources.ts'

const GROK_TIMEOUT_MS = 180_000
const MISSING = ConversationIdSchema.parse('missing-conversation')

function userTurn(text: string) {
  return {
    turnId: createTurnId(),
    userMessage: {
      id: MessageIdSchema.parse('user-1'),
      content: [{ type: 'text' as const, text }],
    },
  }
}

async function waitForTurn(events: ConversationEvent[]) {
  await vi.waitFor(
    () => {
      expect(events.some((event) => event.type === 'turn.finished')).toBe(true)
    },
    { timeout: 60_000 },
  )
}

describe.skipIf(!grokOnPath())('GrokCodingAgent', () => {
  describe('listConversations', () => {
    it(
      'returns a conversation this process created',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          const listed = await agent.listConversations()
          expect(listed.conversations.some((row) => row.id === created.id)).toBe(true)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it('fails when the host signal is already aborted', async () => {
      const shutdown = new AbortController()
      shutdown.abort()
      await expect(new GrokCodingAgent(shutdown.signal).listConversations()).rejects.toBeInstanceOf(
        CodingAgentUnavailableError,
      )
    })
  })

  describe('createConversation', () => {
    it(
      'returns an idle snapshot',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          expect(agent.snapshot(created.id).turn).toEqual({ state: 'idle' })
        })
      },
      GROK_TIMEOUT_MS,
    )

    it('rejects a directory that is not a git workspace', async () => {
      await withGrokCodingAgent(async (agent) => {
        const cwd = await mkdtemp(join(tmpdir(), 'porte-nogit-'))
        await expect(agent.createConversation(cwd)).rejects.toBeInstanceOf(WorkspaceNotAllowedError)
      })
    })
  })

  describe('openConversation', () => {
    it(
      'loads a conversation after close',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await agent.closeConversation(created.id)
          await agent.openConversation(created.id)
          expect(agent.snapshot(created.id).turn).toEqual({ state: 'idle' })
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects an unknown conversation',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          await expect(agent.openConversation(MISSING)).rejects.toBeInstanceOf(
            ConversationNotFoundError,
          )
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('snapshot', () => {
    it(
      'returns idle state for a new conversation',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          expect(agent.snapshot(created.id).items).toEqual([])
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects a conversation that is not open',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          expect(() => agent.snapshot(MISSING)).toThrow(ConversationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('onEvent', () => {
    it(
      'emits turn.started then turn.finished',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          const events: ConversationEvent[] = []
          agent.onEvent(created.id, (event) => events.push(event))
          await agent.startTurn(created.id, userTurn('Reply with exactly: ping'))
          await waitForTurn(events)
          expect(events.some((event) => event.type === 'turn.started')).toBe(true)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects a conversation that is not open',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          expect(() => {
            agent.onEvent(MISSING, () => undefined)
          }).toThrow(ConversationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('startTurn', () => {
    it(
      'completes a short prompt',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          const events: ConversationEvent[] = []
          agent.onEvent(created.id, (event) => events.push(event))
          await agent.startTurn(created.id, userTurn('Reply with exactly: ping'))
          await waitForTurn(events)
          expect(events.some((event) => event.type === 'message.delta')).toBe(true)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects a second turn on the same conversation',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await agent.startTurn(created.id, userTurn('Write a long essay about git.'))
          await expect(agent.startTurn(created.id, userTurn('ping'))).rejects.toBeInstanceOf(
            ConversationBusyError,
          )
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('cancelTurn', () => {
    it(
      'cancels an in-flight turn',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          const events: ConversationEvent[] = []
          agent.onEvent(created.id, (event) => events.push(event))
          const command = userTurn('Write a long essay about git rebase.')
          await agent.startTurn(created.id, command)
          await agent.cancelTurn(created.id, command.turnId)
          await waitForTurn(events)
          expect(events.find((event) => event.type === 'turn.finished')).toMatchObject({
            outcome: { type: 'cancelled' },
          })
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects cancel when no turn is running',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await expect(agent.cancelTurn(created.id, createTurnId())).rejects.toBeInstanceOf(
            ConversationNotFoundError,
          )
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('setConfiguration', () => {
    it(
      'rejects an unknown option on an open conversation',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await expect(
            agent.setConfiguration(created.id, {
              optionId: 'not-an-option',
              value: { type: 'boolean', value: true },
            }),
          ).rejects.toBeInstanceOf(AcpRpcError)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects a conversation that is not open',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          await expect(
            agent.setConfiguration(MISSING, {
              optionId: 'x',
              value: { type: 'boolean', value: true },
            }),
          ).rejects.toBeInstanceOf(ConversationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('answerPermission', () => {
    it(
      'rejects when no permission is pending',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await expect(
            agent.answerPermission(created.id, {
              turnId: createTurnId(),
              permissionId: PermissionIdSchema.parse('missing-permission'),
              optionId: 'allow',
            }),
          ).rejects.toBeInstanceOf(PermissionNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects a conversation that is not open',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          await expect(
            agent.answerPermission(MISSING, {
              turnId: createTurnId(),
              permissionId: PermissionIdSchema.parse('missing-permission'),
              optionId: 'allow',
            }),
          ).rejects.toBeInstanceOf(ConversationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('answerElicitation', () => {
    it(
      'rejects when no elicitation is pending',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await expect(
            agent.answerElicitation(created.id, {
              turnId: createTurnId(),
              elicitationId: ElicitationIdSchema.parse('missing-elicitation'),
              answer: { type: 'cancel' },
            }),
          ).rejects.toBeInstanceOf(ElicitationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'rejects a conversation that is not open',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          await expect(
            agent.answerElicitation(MISSING, {
              turnId: createTurnId(),
              elicitationId: ElicitationIdSchema.parse('missing-elicitation'),
              answer: { type: 'cancel' },
            }),
          ).rejects.toBeInstanceOf(ConversationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('closeConversation', () => {
    it(
      'drops the live conversation so snapshot fails',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await agent.closeConversation(created.id)
          expect(() => agent.snapshot(created.id)).toThrow(ConversationNotFoundError)
        })
      },
      GROK_TIMEOUT_MS,
    )

    it(
      'is a no-op for an unknown conversation',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          await expect(agent.closeConversation(MISSING)).resolves.toBeUndefined()
        })
      },
      GROK_TIMEOUT_MS,
    )
  })

  describe('closeAll', () => {
    it(
      'stops every open conversation and can start again',
      async () => {
        await withGrokCodingAgent(async (agent) => {
          const created = await agent.createConversation(await createGitWorkspace())
          await agent.closeAll()
          expect(() => agent.snapshot(created.id)).toThrow(ConversationNotFoundError)
          const listed = await agent.listConversations()
          expect(listed.conversations.some((row) => row.id === created.id)).toBe(true)
        })
      },
      GROK_TIMEOUT_MS,
    )
  })
})
