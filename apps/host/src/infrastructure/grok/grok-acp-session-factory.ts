import { homedir } from 'node:os'

import type {
  AgentCapabilities,
  LoadSessionResponse,
  NewSessionResponse,
} from '@agentclientprotocol/sdk'
import {
  CodingAgentCapabilityError,
  CodingAgentResponseError,
} from '@host/application/errors/coding-agent-errors.ts'
import type {
  AgentSessionFactory,
  CreateAgentSession,
  CreatedAgentSession,
  OpenAgentSession,
} from '@host/application/ports/agent-session-factory.ts'
import type { AgentSession } from '@host/application/ports/agent-session.ts'
import { AcpClientRequestError } from '@host/infrastructure/acp/error.ts'
import { answerIncomingRequest } from '@host/infrastructure/acp/incoming-request.ts'
import {
  CodingAgentUnavailableError,
  ConversationIdSchema,
  ConversationNotFoundError,
  ElicitationIdSchema,
  IsoDateTimeSchema,
  WorkspaceNotAllowedError,
  makeConversation,
  type Conversation,
  type ConversationId,
  type ConversationView,
} from '@porte/core/client'

import { findGitRoot, normaliseGitRoot } from './git-root.ts'
import {
  initializeGrokAcpClient,
  startGrokAcpClient,
  type GrokAcpClient,
} from './grok-acp-client.ts'
import { GrokAcpSession } from './grok-acp-session.ts'
import {
  GrokReplayMapper,
  isGrokEventMappingError,
  type GrokEventMappingError,
} from './grok-event-mapper.ts'
import { listGrokSessions } from './grok-session-list.ts'

type SelectedSession = {
  readonly conversationId: ConversationId
  readonly response: LoadSessionResponse | NewSessionResponse
}

type StartedSession = {
  readonly session: GrokAcpSession
  readonly view: ConversationView
}

/** Creates one Grok ACP process for one conversation. */
export class GrokAcpSessionFactory implements AgentSessionFactory {
  constructor(private readonly signal: AbortSignal) {}

  async list(): Promise<Conversation[]> {
    const client = await startGrokAcpClient({
      cwd: homedir(),
      signal: this.signal,
      onUpdate: () => undefined,
      onRequest: async (_id, method) => {
        throw new AcpClientRequestError({ code: -32601, message: `method not found: ${method}` })
      },
    })

    try {
      const capabilities = await initializeGrokAcpClient(client)
      if (capabilities.sessionCapabilities?.list == null) {
        throw new CodingAgentCapabilityError({
          capability: 'session/list',
          cause: new TypeError('Grok does not advertise session/list'),
        })
      }
      return await listGrokSessions(client)
    } finally {
      await client.stop()
    }
  }

  async open(command: OpenAgentSession): Promise<AgentSession> {
    const conversations = await this.list()
    const conversation = conversations.find((item) => item.id === command.conversationId)
    if (conversation === undefined) throw new ConversationNotFoundError()

    const started = await this.startSession(
      conversation.cwd,
      command.listener,
      async (client, capabilities) => {
        if (capabilities.loadSession !== true) {
          throw new CodingAgentCapabilityError({
            capability: 'session/load',
            cause: new TypeError('Grok does not advertise session/load'),
          })
        }
        const response = await client
          .request({
            method: 'session/load',
            params: {
              sessionId: conversation.id,
              cwd: conversation.cwd,
              mcpServers: [],
            },
            timeoutMs: 30_000,
          })
          .catch((cause: unknown) => {
            throw new CodingAgentUnavailableError({ cause })
          })
        return { conversationId: conversation.id, response }
      },
    )
    return started.session
  }

  async create(command: CreateAgentSession): Promise<CreatedAgentSession> {
    const gitRoot = findGitRoot(command.cwd)
    if (gitRoot === undefined) throw new WorkspaceNotAllowedError()

    const started = await this.startSession(command.cwd, command.listener, async (client) => {
      const response = await client
        .request({
          method: 'session/new',
          params: { cwd: command.cwd, mcpServers: [] },
          timeoutMs: 30_000,
        })
        .catch((cause: unknown) => {
          throw new CodingAgentUnavailableError({ cause })
        })
      return {
        conversationId: ConversationIdSchema.parse(response.sessionId),
        response,
      }
    })

    return {
      conversation: makeConversation({
        id: started.session.conversationId,
        cwd: command.cwd,
        gitRoot: normaliseGitRoot(gitRoot),
        title: '',
        updatedAt: IsoDateTimeSchema.parse(new Date().toISOString()),
      }),
      session: started.session,
    }
  }

  private async startSession(
    cwd: string,
    listener: OpenAgentSession['listener'],
    select: (client: GrokAcpClient, capabilities: AgentCapabilities) => Promise<SelectedSession>,
  ): Promise<StartedSession> {
    let session: GrokAcpSession | undefined
    let replayError: GrokEventMappingError | undefined
    const replay = new GrokReplayMapper()
    const client = await startGrokAcpClient({
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
      const capabilities = await initializeGrokAcpClient(client)
      const selected = await select(client, capabilities)
      if (replayError !== undefined) throw new CodingAgentResponseError({ cause: replayError })

      replay.seedSession(selected.response)
      const view = replay.snapshot(selected.conversationId)
      session = new GrokAcpSession(
        selected.conversationId,
        client,
        cwd,
        listener,
        view,
        capabilities,
      )
      return { session, view }
    } catch (cause) {
      await client.stop()
      if (isGrokEventMappingError(cause)) throw new CodingAgentResponseError({ cause })
      throw cause
    }
  }
}
