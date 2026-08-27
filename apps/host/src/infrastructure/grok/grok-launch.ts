/* oxlint-disable no-underscore-dangle -- ACP reserves `_meta` for provider data. */
import { homedir } from 'node:os'

import {
  PROTOCOL_VERSION,
  type AgentCapabilities,
  type AuthMethod,
  type LoadSessionResponse,
  type PromptResponse,
  type SessionInfo,
} from '@agentclientprotocol/sdk'
import {
  CodingAgentCapabilityError,
  CodingAgentResponseError,
} from '@host/application/errors/coding-agent-errors.ts'
import type { SessionFacts } from '@host/application/ports/coding-agent.ts'
import {
  AcpAgentProcess,
  type StartAcpAgentProcess,
} from '@host/infrastructure/acp/acp-agent-process.ts'
import type { AcpSessionModels } from '@host/infrastructure/acp/acp-content.ts'
import { AcpProtocolVersionMismatchError } from '@host/infrastructure/acp/error.ts'
import { normaliseGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  CodingAgentUnavailableError,
  ConversationIdSchema,
  IsoDateTimeSchema,
  type ConversationUsage,
} from '@porte/core/client'
import { z } from 'zod'

/** Grok lists sessions with the repository under `_meta['x.ai/session'].facets.gitRoot`. */
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

/** Parse one Grok `session/list` row into session facts; rows with no git root are skipped. */
export function toSessionFacts(session: SessionInfo): SessionFacts | undefined {
  const parsed = grokSessionSchema.safeParse(session)
  if (!parsed.success) throw new CodingAgentResponseError({ cause: parsed.error })
  const gitRoot = parsed.data._meta?.['x.ai/session']?.facets.gitRoot
  if (gitRoot === undefined) return undefined
  return {
    id: parsed.data.sessionId,
    cwd: parsed.data.cwd,
    gitRoot: normaliseGitRoot(gitRoot),
    title: parsed.data.title ?? '',
    updatedAt: parsed.data.updatedAt,
  }
}

const GROK_CACHED_TOKEN_AUTH_METHOD_ID = 'cached_token'

/** Grok reports the context size on each model's `_meta` (spike: `totalContextTokens`). */
const modelMetaSchema = z.object({ totalContextTokens: z.number().int().positive() })

/** Grok reports the tokens the last call used on the prompt response `_meta` (spike). */
const promptMetaSchema = z.object({ totalTokens: z.number().int().nonnegative() })

/** Callbacks the ACP process needs before it can start; the adapter supplies them. */
export type AcpCallbacks = Pick<
  StartAcpAgentProcess,
  'onUpdate' | 'onRequest' | 'onElicitationComplete'
>

/**
 * One started ACP agent plus the agent-specific facts the adapter cannot know:
 * how to read list rows, context sizes, and prompt usage out of `_meta`.
 */
export type ReadyAgent = {
  readonly process: AcpAgentProcess
  readonly capabilities: AgentCapabilities
  /** `session/list` row → facts, or undefined when the row is not a git conversation. */
  readonly sessionFacts: (row: SessionInfo) => SessionFacts | undefined
  /** Title of a loaded session, or empty when the agent reports none. */
  readonly sessionTitle: (response: LoadSessionResponse) => string
  /** Context window of the current model, when the agent reports one. */
  readonly contextTokens: (models: AcpSessionModels | null | undefined) => number | undefined
  /** Usage for one finished prompt, when the agent reports it and the context size is known. */
  readonly promptUsage: (
    meta: PromptResponse['_meta'],
    sizeTokens: number | undefined,
  ) => ConversationUsage | undefined
}

/**
 * Start Grok as one ACP process: spawn, `initialize`, `cached_token` auth, capability
 * check. Runs once at `porte up`; the adapter owns the returned process from then on.
 *
 * @throws CodingAgentUnavailableError when the process cannot start or the signal is aborted.
 * @throws CodingAgentCapabilityError when Grok lacks `session/list` or `session/load`.
 */
export async function startGrok(signal: AbortSignal, callbacks: AcpCallbacks): Promise<ReadyAgent> {
  const process = await AcpAgentProcess.start({
    command: 'grok',
    args: ['--no-auto-update', 'agent', 'stdio'],
    cwd: homedir(),
    signal,
    ...callbacks,
  }).catch((cause: unknown) => {
    throw new CodingAgentUnavailableError({ cause })
  })

  try {
    const initialized = await process.request({
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          elicitation: { form: {}, url: {} },
          plan: {},
        },
        clientInfo: { name: 'porte', title: 'Porte', version: '0.1.0' },
      },
    })
    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new AcpProtocolVersionMismatchError({
        expected: PROTOCOL_VERSION,
        received: initialized.protocolVersion,
      })
    }
    await authenticate(process, initialized.authMethods)
    const capabilities = initialized.agentCapabilities ?? {}
    requireCapabilities(capabilities)
    return {
      process,
      capabilities,
      sessionFacts: toSessionFacts,
      sessionTitle,
      contextTokens,
      promptUsage,
    }
  } catch (cause) {
    await process.stop()
    throw cause
  }
}

async function authenticate(
  process: AcpAgentProcess,
  methods: readonly AuthMethod[] | null | undefined,
): Promise<void> {
  const cachedToken = methods?.find(
    (method) => !('type' in method) && method.id === GROK_CACHED_TOKEN_AUTH_METHOD_ID,
  )
  if (cachedToken === undefined) return
  await process.request({
    method: 'authenticate',
    params: { methodId: cachedToken.id, _meta: { headless: true } },
  })
}

function requireCapabilities(capabilities: AgentCapabilities): void {
  if (capabilities.sessionCapabilities?.list == null) {
    throw new CodingAgentCapabilityError({
      capability: 'conversation.list',
      cause: new TypeError('Grok does not advertise ACP sessionCapabilities.list'),
    })
  }
  if (capabilities.loadSession !== true) {
    throw new CodingAgentCapabilityError({
      capability: 'conversation.open',
      cause: new TypeError('Grok does not advertise ACP loadSession'),
    })
  }
}

/** Grok puts the list title on the load response under `_meta['x.ai/sessionDetail']` (capture). */
const sessionDetailSchema = z.object({
  'x.ai/sessionDetail': z.object({ title: z.string().optional() }).optional(),
})

function sessionTitle(response: LoadSessionResponse): string {
  const parsed = sessionDetailSchema.safeParse(response._meta)
  return parsed.success ? (parsed.data['x.ai/sessionDetail']?.title ?? '') : ''
}

function contextTokens(models: AcpSessionModels | null | undefined): number | undefined {
  const current = models?.availableModels.find((model) => model.modelId === models.currentModelId)
  const meta = modelMetaSchema.safeParse(current?._meta)
  return meta.success ? meta.data.totalContextTokens : undefined
}

function promptUsage(
  meta: PromptResponse['_meta'],
  sizeTokens: number | undefined,
): ConversationUsage | undefined {
  const parsed = promptMetaSchema.safeParse(meta)
  if (!parsed.success || sizeTokens === undefined) return undefined
  return { usedTokens: Math.min(parsed.data.totalTokens, sizeTokens), sizeTokens }
}
