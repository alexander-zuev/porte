import type { IMessageBus } from '@host/application/message-bus.ts'
import type { BackgroundTasks } from '@host/application/ports/background-tasks.ts'
import type { AgentListener } from '@host/application/ports/coding-agent.ts'
import { createCommand } from '@host/domain/messages/types.ts'

/**
 * ACP → bus. What the agent pushes becomes commands; each runs as background
 * work so a failing one is logged once there and never blocks the agent.
 */
export function createAgentInbound(bus: IMessageBus, background: BackgroundTasks): AgentListener {
  return {
    onEvents: (conversationId, events) => {
      background.run(bus.handle(createCommand('ApplyAgentUpdate', { conversationId, events })))
    },
    onPermissionRequest: (conversationId, request) => {
      background.run(bus.handle(createCommand('RequestPermission', { conversationId, ...request })))
    },
    onElicitationRequest: (conversationId, request) => {
      background.run(
        bus.handle(createCommand('RequestElicitation', { conversationId, ...request })),
      )
    },
    onElicitationComplete: (conversationId, elicitationId) => {
      background.run(
        bus.handle(createCommand('CompleteElicitation', { conversationId, elicitationId })),
      )
    },
  }
}
