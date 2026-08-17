import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { hostWebSocket } from './server/entrypoints/host-websocket'
import { createAppDeps } from './server/infrastructure/app-deps'

export { HostCoordinatorDO } from './server/infrastructure/durable-objects/host-coordinator-do'

const serverEntry = createServerEntry(handler)

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname === '/api/host/ws') {
      return hostWebSocket(request, createAppDeps(env, ctx))
    }
    return serverEntry.fetch(request)
  },
} satisfies ExportedHandler<Env>
