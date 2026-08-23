import {
  RelayHeartbeat,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
} from '@porte/core/client'
import type { useAgent } from 'agents/react'
import { useEffect } from 'react'

type AgentSocket = Pick<
  ReturnType<typeof useAgent>,
  'OPEN' | 'readyState' | 'send' | 'reconnect' | 'addEventListener' | 'removeEventListener'
>

/** Detects an open browser socket that no longer carries traffic. */
export function useAgentHeartbeat(agent: AgentSocket): void {
  useEffect(() => {
    const heartbeat = new RelayHeartbeat(
      () => {
        agent.send(RELAY_HEARTBEAT_REQUEST)
      },
      () => {
        agent.reconnect(1011, 'relay heartbeat expired')
      },
    )
    const onOpen = (): void => {
      heartbeat.start()
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.data === RELAY_HEARTBEAT_RESPONSE) heartbeat.acknowledge()
    }
    const onClose = (): void => {
      heartbeat.stop()
    }

    agent.addEventListener('open', onOpen)
    agent.addEventListener('message', onMessage)
    agent.addEventListener('close', onClose)
    if (agent.readyState === agent.OPEN) heartbeat.start()

    return () => {
      heartbeat.stop()
      agent.removeEventListener('open', onOpen)
      agent.removeEventListener('message', onMessage)
      agent.removeEventListener('close', onClose)
    }
  }, [agent])
}
