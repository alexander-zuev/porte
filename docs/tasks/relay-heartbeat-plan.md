# Add relay heartbeat recovery

## Goal

Detect a dead relay path within 40 seconds. Close that socket and start the existing reconnect policy.

The connection is dead when traffic cannot pass although the local WebSocket still reports `OPEN`.

## Contract

Both clients send a probe every 30 seconds. They require a response within 10 seconds.

The Mac uses protocol Ping and Pong frames through `ws`. Cloudflare answers protocol Ping frames without waking a hibernating Durable Object.

The browser sends the text frame `ping`. `HostRelayDO` configures `setWebSocketAutoResponse()` to return the text frame `pong`.

One shared module owns the timer values and timer state. Each adapter owns its platform frame format.

## Recovery

The Mac calls `terminate()` after a missed response. Its existing close path starts the bounded reconnect policy.

The browser drops the old socket, fails pending requests, and starts its existing reconnect policy. Events from that old socket cannot affect its replacement.

All timers stop when the socket closes, the user stops the client, or the connection changes.

## Rollout

The Mac change needs no rollout order because protocol Ping support already exists.

Deploy the Durable Object support before the browser starts sending `ping`. An old Durable Object treats that text as an invalid message.

## Verification

1. Workerd returns `pong` before and after Durable Object eviction.
2. The shared timer expires once and stops all timers.
3. The Mac terminates and reconnects after a missed response.
4. The browser fails pending requests and reconnects after a missed response.
5. Unit tests, integration tests, typecheck, and lint pass in all changed packages.

## Sources

- [Cloudflare WebSocket hibernation example](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
- [Cloudflare WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare Durable Object state API](https://developers.cloudflare.com/durable-objects/api/state/)
- [`ws` broken connection example](https://github.com/websockets/ws/blob/master/README.md#how-to-detect-and-close-broken-connections)
- [WHATWG WebSocket protocol Ping and Pong](https://websockets.spec.whatwg.org/#ping-and-pong-frames)
