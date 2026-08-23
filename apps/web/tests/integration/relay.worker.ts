/**
 * The relay, without the app around it.
 *
 * `src/server.ts` is the real entry, but it pulls in the TanStack Start server
 * handler, which needs that plugin loaded to resolve. The Durable Object is the
 * production class either way, and its bindings come from `wrangler.jsonc`.
 */
export { ConversationAgent } from '@server/infrastructure/durable-objects/conversation-agent.ts'
export { HostRelayAgent } from '@server/infrastructure/durable-objects/host-relay-agent.ts'

export default { fetch: () => new Response('the relay is reached by binding, not by fetch') }
