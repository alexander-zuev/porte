# Improve the host relay Durable Object

## Goal

Make `HostRelayDO` safe across hibernation, repeated reads, socket failures, and alarm delivery.

Success requires real Workerd tests for each changed behavior. The relay architecture does not change.

## Audit result

The main design is correct. One Durable Object owns one host, which gives the correct coordination boundary.

The relay already uses the recommended Cloudflare patterns:

- SQLite storage starts inside `blockConcurrencyWhile()`.
- RPC methods serve reads and pairing cleanup.
- `acceptWebSocket()` enables WebSocket hibernation.
- Socket tags and attachments restore connection state.
- The alarm is repeat-safe and owns list expiry.
- Sentry wraps the exported Durable Object class.

Four changes are required:

1. `readConversations()` can send duplicate sync requests before the first sync finishes. Each request can start another Mac file scan.
2. `ctx.waitUntil()` has no effect in a Durable Object. A rejected `recordHostSeen()` promise has no owned error path.
3. A delayed host-seen upsert can restore a revoked host or replace a new pairing with the old pairing.
4. Existing tests cover only the SQLite repository. They do not cover the relay, sockets, hibernation, or alarms.

## Proposed design

### Sync state

Replace `lastSyncedAt` with this state:

```ts
type ConversationSyncState =
  | { readonly status: 'idle' }
  | { readonly status: 'requested'; readonly at: number }
  | { readonly status: 'synced'; readonly at: number }
```

The first stale read sends one sync request and records `requested`. More reads do not send another request until that sync finishes.

Any received sync chunk records `requested`. The final chunk records `synced`.

An alarm cleanup records `idle`. Hibernation also returns to `idle`, so the first read after wake requests fresh data.

### Host seen update

Replace both `ctx.waitUntil()` calls with one private background method. The method handles rejection and logs it once.

Replace the host read and upsert with one conditional update by host ID. The update changes only `lastSeenAt` and only moves time forward.

The host update remains outside the WebSocket handshake. A D1 failure must not disconnect a healthy relay.

### Close handling

Stop calling `socket.close()` from `webSocketClose()`. The configured compatibility date enables Cloudflare's automatic close reply.

Keep `webSocketError()` as the error log point. Do not duplicate close cleanup unless a test proves that Cloudflare omits the close event.

## Test design

Use `@cloudflare/vitest-plugin` 1.0.0. Cloudflare replaced the old package without changing its configuration API.

Load the real D1 migrations in integration setup. This lets daemon connections execute `recordHostSeen()` against the production schema.

Add focused tests through the real Durable Object binding:

1. A client receives offline, then online and offline host events.
2. A client request reaches the daemon, and its response returns to that client.
3. An open conversation receives its events and closes after its last watcher leaves.
4. A replacement daemon closes the old daemon without an offline state change.
5. Invalid binary, JSON, client, and daemon frames produce the correct response or close code.
6. Repeated reads send one sync request until the final sync chunk arrives.
7. A sync persists rows, sends invalidation, and arms the expiry alarm.
8. Forced eviction preserves sockets, tags, attachments, routing, and stored rows.
9. The alarm keeps rows while a daemon is connected and deletes rows after disconnect.
10. `disconnectAll()` closes all sockets and deletes all relay storage.

Tests use `evictDurableObject()`, `runDurableObjectAlarm()`, and `runInDurableObject()`. These APIs exercise the Workerd lifecycle directly.

## Scope

In scope:

- `host-relay-do.ts`
- Host-seen command and repository
- Relay test helpers when a public behavior needs them
- Workers integration setup
- Relay integration tests
- Workers Vitest plugin migration

Out of scope:

- The AI protocol or browser transport design
- The `Agent` base class decision
- A new WebSocket frame limit without production frame data
- Changes to Durable Object class migrations

## Verification

Run these project scripts:

1. `pnpm test:integration`
2. `pnpm test:unit`
3. `pnpm typecheck`
4. `pnpm lint`

Then run an independent adversarial review. Fix each valid finding and run the checks again.

Completed verification:

- 24 integration tests pass.
- 23 unit tests pass.
- TypeScript passes.
- Lint passes with existing warnings.
- Independent reviews confirm the runtime, tests, and plugin migration.

## Sources

- [Cloudflare WebSocket hibernation example](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
- [Cloudflare WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare Durable Object rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Cloudflare Durable Object state API](https://developers.cloudflare.com/durable-objects/api/state/)
- [Cloudflare Durable Object tests](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/)
- [Cloudflare Workers test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
- [Cloudflare Vitest plugin migration](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/)
