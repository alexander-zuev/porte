# Slice: pair and connect

Implementation specification for one vertical slice. Delete a step when it lands. Delete the
document when the last step lands.

## Goal

A Mac pairs with an account, connects to the relay with the credential pairing gave it, and the
browser sees it. Approval writes no host row today, and the relay authenticates with a development
secret that maps every account to one hardcoded host.

## Success

1. On a clean account, `porte pair` then `porte up` connects with no `PORTE_*` secret set.
2. `/dashboard` names the Mac and its platform.
3. `porte unpair` closes the running daemon's socket, not only its next connection.
4. `grep -r "DEVELOPMENT_HOST_ID\|daemonToken"` returns nothing.
5. Each step leaves typecheck, lint, and tests green on its own commit.

## Scope

**In.** The `host` table, the pairing decision, the host WebSocket route and its authenticator, the
relay's record of liveness, and the `HostView` contract both doors read.

**Out.** The `/pair` route split, the launchd agent, conversation persistence, dashboard layout.

## Target design

Identity flows one way, and nobody sends a host id:

```
credential -> userId -> host row -> hostId -> Durable Object name
```

The daemon's token proves which person owns the Mac. The row proves the Mac. Neither fact stands in
for the other.

**Role is derived, never declared.** A bearer token means daemon. A browser cookie means client.
`HostAuthenticator.authenticate` takes the `Request`, because only the request shows which
credential kind arrived.

| Layer    | Job                                                             |
| -------- | --------------------------------------------------------------- |
| Worker   | Check the credential, find the host row, name the DO, hand off  |
| Relay DO | Hold the sockets, route frames, answer online, record last seen |
| D1       | Pairing exists, name, platform, revoked, last seen              |
| The Mac  | Grok, ACP, repos, conversations                                 |

The Worker holds no state and never reads a frame. D1 never answers whether a Mac is online.

## Steps

### 2. Approval registers the Mac

`decidePairing` writes nothing today and says so in its own comment. Approval is when both facts are
in hand: who the owner is, and what the machine is called.

- On approve: `authority.approve`, read the pairing request, `Host.register` with a fresh `hostId`,
  save, forget the request. On deny: `authority.deny`, forget the request.
- `save` must overwrite `id` on conflict. It sets everything except `id` today, so re-pairing after
  unpair reuses the old relay object and its cached catalog.

**Proof.** Approving on a clean account leaves one `host` row named after the Mac.

### 3. `HostView` stops inventing availability

`getHostView` hardcodes `availability: 'offline'` while the relay holds the real answer, and falls
back to `createdAt` for a Mac it has never seen. Both claim a fact the read cannot know.

- `PairedHostSchema` loses `availability`. It carries `name`, `platform`, and a nullable
  `lastSeenAt`. Null means paired and never seen.
- The page learns online or offline from the relay socket it opens anyway.

**Proof.** A fresh pairing reads as paired and never seen.

### 4. The daemon authenticates as itself

- New `SessionHostAuthenticator`: resolve the Better Auth session from a bearer token or a cookie,
  find the host row, refuse a revoked one, return `hostId` and the derived role.
- Delete `DevelopmentHostAuthenticator` and both environment secrets.

**Proof.** `porte up` connects with the paired credential. An unknown bearer gets 401, a revoked
host 403. The browser reaches its own host through the cookie.

### 5. The relay records what it sees

The Durable Object knows both the connect and the disconnect moment, so it owns `lastSeenAt`.

- The Worker passes the resolved `hostId` on the upgrade; the DO stores it so the close handler
  still has it.
- Write `lastSeenAt` when a daemon socket is accepted and when it closes.

**Proof.** Connecting sets `lastSeenAt`. Killing the daemon updates it.

### 6. Unpair ends the live connection

Checking at connect time enforces revocation on the next connection only, so unpair looks failed.

- `HostCoordinator` gains `disconnect(hostId)`; the DO closes every socket it holds.
- `unpairHost` calls it after revoking.

**Proof.** With `porte up` running, unpairing from the browser ends the daemon's connection.

## Decisions

1. **`host.id` stays separate from `userId`.** Re-pairing gets a fresh row and a fresh relay object.
2. **Availability leaves the database contract.** The relay answers it; the query cannot.
3. **The DO writes `lastSeenAt`.** Writing from the route only would mean "last connected".
4. **Role is derived from the credential kind.** A declared role is a claim; a credential is proof.
5. **Platforms are a closed enum, declared at the schema.** `text(name, { enum })` types the column,
   so no application code parses a platform out of storage.

## Open question

**The daemon's credential expires in seven days.** `options.ts` keeps Better Auth's session default.
A reconnect inside that window extends it, so an active Mac stays paired, but a Mac that sleeps for
two weeks silently unpairs.

For this slice, make the failure legible: `porte up` reports that the pairing expired and names
`porte pair`. A longer-lived device-grant credential is its own change.
