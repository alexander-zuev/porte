import { addAbortListener } from 'node:events'

import type { HostConfig } from '@host/entrypoints/cli/host-config.ts'
import { CONTROL_METHOD_HANDLERS } from '@host/entrypoints/websocket/control-method-handlers.ts'
import { CONVERSATION_METHOD_HANDLERS } from '@host/entrypoints/websocket/conversation-method-handlers.ts'
import { HostConnectionManager } from '@host/entrypoints/websocket/host-connection-manager'
import { createHostResources } from '@host/infrastructure/bootstrap/host-resources.ts'
import { createPartySocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'

/** Input for one complete Host lifespan. */
export type HostLifespanInput = {
  readonly config: HostConfig
  readonly signal: AbortSignal
}

/** Open Host resources, process messages, and close all resources. */
export async function runHostLifespan(input: HostLifespanInput): Promise<void> {
  if (input.signal.aborted) return

  const resources = await createHostResources(input.config)
  const connectionManager = new HostConnectionManager(
    {
      baseUrl: resources.credential.baseUrl,
      controlHandlers: CONTROL_METHOD_HANDLERS,
      conversationHandlers: CONVERSATION_METHOD_HANDLERS,
      resources,
      token: resources.credential.token,
    },
    createPartySocketClient,
  )
  const control = connectionManager.openControlConnection()

  try {
    await waitForHostStop(input.signal, control.closed)
  } finally {
    connectionManager.closeControlConnection()
  }
}

async function waitForHostStop(signal: AbortSignal, controlClosed: Promise<void>): Promise<void> {
  if (signal.aborted) return

  const shutdown = Promise.withResolvers<void>()
  const listener = addAbortListener(signal, () => {
    shutdown.resolve()
  })

  try {
    await Promise.race([shutdown.promise, controlClosed])
  } finally {
    listener[Symbol.dispose]()
  }
}
