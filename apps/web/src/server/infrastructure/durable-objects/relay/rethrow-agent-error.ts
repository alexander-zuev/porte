import type { Logger } from '@porte/core'
import type { Connection } from 'agents'

type AgentErrorArgs = [connection: Connection, error: unknown] | [error: unknown]

/** Fields attached to the connection-scoped SDK error log. */
export type AgentErrorDetails = {
  readonly [key: string]: string
}

/** Input for {@link rethrowAgentError}. */
export type RethrowAgentErrorInput = {
  /** Log event when the SDK reports an Agent-level error. */
  readonly agentEvent: string
  /** Connection tag that marks the Mac Host socket. */
  readonly hostTag: string
  /** Stable ids for this Agent. `connectionId` is added from the socket. */
  readonly details: AgentErrorDetails
}

/**
 * Log one Agents SDK error, then rethrow. The SDK requires the throw.
 *
 * @param logger - The Agent's logger.
 * @param args - The SDK `onError` arguments.
 * @param input - Event names and identity fields.
 */
export function rethrowAgentError(
  logger: Logger,
  args: AgentErrorArgs,
  input: RethrowAgentErrorInput,
): never {
  if (args.length === 1) {
    logger.error(input.agentEvent, { error: args[0] })
    throw args[0]
  }
  const [connection, error] = args
  logger.error(
    connection.tags.includes(input.hostTag) ? 'host_websocket_error' : 'relay_websocket_error',
    {
      error,
      details: { ...input.details, connectionId: connection.id },
    },
  )
  throw error
}
