import { homedir } from 'node:os'

import type {
  ListSessionsResponse,
  LoadSessionResponse,
  NewSessionResponse,
  SessionInfo,
} from '@agentclientprotocol/sdk'
import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import type { AgentSession } from '@host/application/ports/agent-session.ts'
import type { CodingAgent, CreatedAgentConversation } from '@host/application/ports/coding-agent.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import { answerIncomingRequest } from '@host/infrastructure/acp/incoming-request.ts'
import {
  ConversationIdSchema,
  ConversationCursorSchema,
  ConversationNotFoundError,
  ElicitationIdSchema,
  IsoDateTimeSchema,
  WorkspaceNotAllowedError,
  makeConversationSummary,
  type ConversationId,
  type ConversationCursor,
  type ConversationSummary,
  type ListConversationsResult,
} from '@porte/core/client'
import { z } from 'zod'

import { findGitRoot, normaliseGitRoot } from './git-root.ts'
import { GrokAcpClient } from './grok-acp-client.ts'
import { GrokAcpSession } from './grok-acp-session.ts'
import {
  GrokReplayMapper,
  isGrokEventMappingError,
  type GrokEventMappingError,
} from './grok-event-mapper.ts'

const MAX_LIST_PAGES = 40

const grokSessionSchema = z.object({
  sessionId: ConversationIdSchema,
  cwd: z.string().min(1),
  title: z.string().optional(),
  updatedAt: IsoDateTimeSchema,
  _meta: z
    .object({
      'x.ai/session': z
        .object({ facets: z.object({ gitRoot: z.string().min(1).optional() }) })
        .optional(),
    })
    .optional(),
})

type SelectedSession = {
  readonly conversationId: ConversationId
  readonly response: LoadSessionResponse | NewSessionResponse
}

/** Provides Porte conversation operations through Grok ACP. */
export class GrokCodingAgent implements CodingAgent {
  constructor(private readonly signal: AbortSignal) {}

  async listConversations(cursor?: ConversationCursor): Promise<ListConversationsResult> {
    const client = await this.startListClient()

    try {
      const listed = await client.listSessions(cursor === undefined ? {} : { cursor })
      return toListResult(listed)
    } finally {
      await client.close()
    }
  }

  async openConversation(conversationId: ConversationId): Promise<AgentSession> {
    const conversation = await this.findConversation(conversationId)
    return this.startSession(conversation.cwd, async (client) => {
      const response = await client.loadSession({
        sessionId: conversation.id,
        cwd: conversation.cwd,
        mcpServers: [],
      })
      return { conversationId: conversation.id, response }
    })
  }

  private async findConversation(conversationId: ConversationId): Promise<ConversationSummary> {
    const client = await this.startListClient()
    let cursor: string | undefined
    try {
      for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
        // oxlint-disable-next-line no-await-in-loop -- ACP gives each cursor in the prior page.
        const listed = await client.listSessions(cursor === undefined ? {} : { cursor })
        for (const session of listed.sessions) {
          const summary = toSummary(session)
          if (summary?.id === conversationId) return summary
        }
        if (listed.nextCursor === undefined || listed.nextCursor === null) break
        cursor = listed.nextCursor
      }
    } finally {
      await client.close()
    }
    throw new ConversationNotFoundError()
  }

  private startListClient(): Promise<GrokAcpClient> {
    return GrokAcpClient.start({
      cwd: homedir(),
      signal: this.signal,
      onUpdate: () => undefined,
      onRequest: async (_id, method) => {
        throw new AcpClientRequestError({ code: -32601, message: `method not found: ${method}` })
      },
    })
  }

  async createConversation(cwd: string): Promise<CreatedAgentConversation> {
    const gitRoot = findGitRoot(cwd)
    if (gitRoot === undefined) throw new WorkspaceNotAllowedError()

    const session = await this.startSession(cwd, async (client) => {
      const response = await client.newSession({ cwd, mcpServers: [] })
      return {
        conversationId: ConversationIdSchema.parse(response.sessionId),
        response,
      }
    })

    return {
      conversation: makeConversationSummary({
        id: session.conversationId,
        cwd,
        gitRoot: normaliseGitRoot(gitRoot),
        title: '',
        updatedAt: IsoDateTimeSchema.parse(new Date().toISOString()),
      }),
      session,
    }
  }

  private async startSession(
    cwd: string,
    select: (client: GrokAcpClient) => Promise<SelectedSession>,
  ): Promise<GrokAcpSession> {
    let session: GrokAcpSession | undefined
    let replayError: GrokEventMappingError | undefined
    const replay = new GrokReplayMapper()
    const client = await GrokAcpClient.start({
      cwd,
      signal: this.signal,
      onUpdate: (notification) => {
        if (session !== undefined) {
          session.receiveUpdate(notification)
          return
        }
        if (replayError !== undefined) return
        try {
          replay.map(notification)
        } catch (cause) {
          if (isGrokEventMappingError(cause)) replayError = cause
          else throw cause
        }
      },
      onRequest: (id, method, params) =>
        session === undefined
          ? answerIncomingRequest(cwd, method, params)
          : session.answerIncoming(id, method, params),
      onElicitationComplete: ({ elicitationId }) => {
        session?.completeElicitation(ElicitationIdSchema.parse(elicitationId))
      },
    })

    try {
      const selected = await select(client)
      if (replayError !== undefined) throw new CodingAgentResponseError({ cause: replayError })
      replay.seedSession(selected.response)
      session = new GrokAcpSession(
        selected.conversationId,
        client,
        cwd,
        replay.snapshot(selected.conversationId),
        client.capabilities,
      )
      return session
    } catch (cause) {
      await client.close()
      if (isGrokEventMappingError(cause)) throw new CodingAgentResponseError({ cause })
      throw cause
    }
  }
}

function toListResult(listed: ListSessionsResponse): ListConversationsResult {
  const conversations = listed.sessions.flatMap((session) => {
    const summary = toSummary(session)
    return summary === undefined ? [] : [summary]
  })
  const cursor = listed.nextCursor
  return cursor === undefined || cursor === null
    ? { conversations }
    : { conversations, next: ConversationCursorSchema.parse(cursor) }
}

function toSummary(session: SessionInfo): ConversationSummary | undefined {
  const parsed = grokSessionSchema.safeParse(session)
  if (!parsed.success) throw new CodingAgentResponseError({ cause: parsed.error })
  // oxlint-disable-next-line no-underscore-dangle -- ACP reserves `_meta` for provider data.
  const gitRoot = parsed.data._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined
  return makeConversationSummary({
    id: parsed.data.sessionId,
    cwd: parsed.data.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: parsed.data.title ?? '',
    updatedAt: parsed.data.updatedAt,
  })
}
