# Slice: pair and connect

Implementation specification for one vertical slice. Delete a step when it lands. Delete the
document when the last step lands.

## Goal

A Mac pairs with an account, connects to the relay with the credential pairing gave it, and the
browser sees it. Approval writes no host row today, and the relay authenticates with a development
secret that maps every account to one hardcoded host.

## Success

1. On a clean account, `porte pair` then `porte up` connects with no `PORTE_*` secret set.
2. `/conversations` names the Mac and its platform, and `/dashboard` no longer exists.
3. `porte unpair` closes the running daemon's socket, not only its next connection.
4. `grep -r "DEVELOPMENT_HOST_ID\|daemonToken"` returns nothing.
5. Each step leaves typecheck, lint, and tests green on its own commit.

## Scope

**In.** The `host` table, the pairing decision, the host WebSocket route and its authenticator, the
relay's record of liveness, the `HostView` contract both doors read, and what the route is called.

**Out.** The `/pair` route split, the launchd agent, conversation persistence, page layout.

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

Steps 1 to 3 have landed and are deleted. What remains:

### 4. `/conversations` replaces the dashboard

The route lists conversations, so it is named for them. `/dashboard` stops existing rather than
redirecting: one name, or the old one lives on in links and history.

**A route for a durable fact, an early return for a live one.** A URL should name a place a person
can act. At `/pair` they read an account and approve. A `/connect` route would hold nothing to do,
because the action is in a terminal; it would watch a socket and bounce them back, and invert itself
the moment the daemon arrived. So pairing redirects and connection does not.

- `beforeLoad` redirects to `/pair` when the account is unpaired or revoked, so one route never
  describes two things.
- `/pair` splits in two. It becomes the command and the way in; `/pair/code` takes the code. Today
  `/pair` renders the field alone and the command lives on the dashboard, so redirecting to it
  would land a new account on a field asking for something nothing told them how to get.
- One authed layout, centred and width-capped, for every authed route. The two-pane shell and its
  mobile pane switch go.
- Surfaces are `/conversations`, `/c/$conversationId`, and `/account`. The detail route keeps its
  short path: it is what a person sends someone, and renaming it buys nothing here.

`HostView` loses `availability` in the same step, because a query cannot answer it. It carries
`name`, `platform`, and a nullable `lastSeenAt`, where null means paired and never seen.

The route holds no state. It reads one union and returns one component:

```
connecting | offline | stale | empty | ready | failed
```

`connecting` exists so a healthy daemon never flashes "run porte up" while its socket opens.
`stale` is offline with a catalog the relay still holds: shown read-only, because discarding a list
we already have makes the page poorer than the data behind it. `offline` is offline with nothing
ever synced.

**Two fetches, not three.** The loader reads paired from D1, server-rendered. One `host.snapshot`
over the socket answers connected and which conversations together, then `host.status` and
`conversations.changed` push every later change. Conversations never enter the query cache: they
arrive by push, and a second copy is a second thing that can disagree.

**Proof.** No `/dashboard` outside git history. A paired Mac with no daemon shows "run porte up"
without a flash. Starting the daemon moves the page to a list with no reload.

### 5. The daemon authenticates as itself

- New `SessionHostAuthenticator`: resolve the Better Auth session from a bearer token or a cookie,
  find the host row, refuse a revoked one, return `hostId` and the derived role.
- Delete `DevelopmentHostAuthenticator` and both environment secrets.

**Proof.** `porte up` connects with the paired credential. An unknown bearer gets 401, a revoked
host 403. The browser reaches its own host through the cookie.

### 6. The relay records what it sees

The Durable Object knows both the connect and the disconnect moment, so it owns `lastSeenAt`.

- The Worker passes the resolved `hostId` on the upgrade; the DO stores it so the close handler
  still has it.
- Write `lastSeenAt` when a daemon socket is accepted and when it closes.

**Proof.** Connecting sets `lastSeenAt`. Killing the daemon updates it.

### 7. Unpair ends the live connection

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
6. **A durable fact gets a route, a live fact gets an early return.** Pairing redirects because it
   is server-known and stable while the page is open. Connection never does: it is only knowable
   once a socket exists, and it flips while a person is looking at it.

## Open question

**The daemon's credential expires in seven days.** `options.ts` keeps Better Auth's session default.
A reconnect inside that window extends it, so an active Mac stays paired, but a Mac that sleeps for
two weeks silently unpairs.

For this slice, make the failure legible: `porte up` reports that the pairing expired and names
`porte pair`. A longer-lived device-grant credential is its own change.
