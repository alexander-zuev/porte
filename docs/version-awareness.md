# Version awareness

## Summary

Every surface learns when a machine runs an old Porte CLI, from one fact. The web
gains a Notifications route behind the burger menu with an unread dot; Grok gains
an update line in the statusline and in `rc` output; the release becomes one
command that keeps the CLI version, the plugin version, and every pin identical.

## Context / Current State

- The plugin runs `npx -y @porte/cli@<pin>`; the pin lives in plugin content. Nothing
  tells a user the pin moved: an old host silently lacks new methods (a model switch
  answers a toast) and advertises fewer options.
- `plugins/grok/plugin.json` is at 0.1.0 while the CLI is 0.2.4 — Grok's plugin panel
  (`u update`) has nothing to offer because the plugin version never moves.
- The relay knows nothing about host versions. `UpgradeRequiredError` today is only
  the HTTP 426 websocket-upgrade gate.
- Roadmap §7 plans Web Push notifications with subscriptions in D1; the Notifications
  route built here is the in-app surface those land on later.

## Goals

1. One release command updates every version fact; none can drift.
2. A stale machine is visible on the web: menu dot → Notifications route → one entry.
3. Grok shows the update without being asked: statusline on startup, one line on `rc`.

## Non-Goals

- Backwards compatibility for old hosts beyond the nudge. An old host keeps failing
  new operations with the existing toast; nothing is gated or hidden.
- Web Push delivery (roadmap §7). This route is its future landing surface only.
- Auto-updating the plugin or CLI. The nudge names the command; the person runs it.

## Invariants

1. One fact: `LATEST_CLI_VERSION` in `packages/core`. The host's own version is
   embedded at build time. Every comparison is `host.cliVersion < LATEST_CLI_VERSION`.
2. The release script is the only writer of versions and pins. Hand-edited versions
   are a review smell.
3. A host that sends no version is outdated by definition (every 0.2.4+ host sends it).

## Types, Interfaces, and APIs

### Core

```ts
// packages/core/src/version.ts — written by the release script, never by hand.
export const LATEST_CLI_VERSION = '0.2.4'

// SemVer-ish compare over dotted numerics; no library, the format is ours.
export function isCliOutdated(cliVersion: string | undefined): boolean
```

### Handshake (host → relay)

```ts
// relay-headers.ts
export const RELAY_CLI_VERSION_HEADER = 'x-porte-cli-version'
```

- Host: `PartySocketTransport` control connect sends the header; the version comes
  from the CLI build (`declare const __CLI_VERSION__` injected by tsdown, falling
  back to package.json in dev).
- Relay: `HostRelayAgent.onConnect` (control socket) parses it and stores it on the
  host row.

### Host row

```ts
// host.schema.ts — one nullable column; null = pre-0.2.4 host = outdated.
cliVersion: text('cli_version')
```

`PairedHost` gains `readonly cliVersion?: string`. The repository writes it beside
`lastSeenAt` on connect.

### Relay → CLI

The control connect's 101 response carries `x-porte-latest-cli: <LATEST_CLI_VERSION>`.
The CLI compares against its own version once per `up`/`rc`:

- `rc <verb>`: append one line when behind —
  `Porte ${latest} is available → run: grok plugin update porte`.
- `up`: same line at startup.
- Statusline: the CLI writes `~/.porte/update-available` (the latest version string)
  when behind and deletes it when current; `statusline.sh` appends
  `· update ${version}` when the file exists. No network in the statusline script.

### Web notifications

```ts
// One derived notification kind today; Push lands here later (roadmap §7).
export type PorteNotification = {
  readonly id: string // stable: `cli-update:${hostId}:${latest}`
  readonly kind: 'cli-update'
  readonly title: string // "Update Porte on Alexander's MacBook Pro"
  readonly body: string // "This machine runs 0.2.3; 0.2.4 is out. In Grok: grok plugin update porte"
  readonly at: IsoDateTime // host.lastSeenAt
}

// features/notifications/models/notifications.ts — pure derivation.
export function deriveNotifications(host: AccountHost): PorteNotification[]

// features/notifications/hooks/use-notifications.ts
// unread = derived ids minus dismissed ids (localStorage per notification id —
// a convenience, not truth; clearing storage resurfaces still-true notifications).
export function useNotifications(): {
  readonly notifications: readonly PorteNotification[]
  readonly unread: number
  readonly dismiss: (id: string) => void
}
```

- Route `/_auth/notifications`: list page; each entry is a card with title, body,
  time, dismiss. Empty state: "Nothing needs you."
- Burger menu (`app-menu.tsx`): "Notifications" item above Account; a small red dot
  on the trigger and on the item while `unread > 0`.

## Release automation

`scripts/release-cli.ts` (run as `pnpm release:cli [patch|minor|major]`):

1. Bump `apps/host/package.json` version.
2. Write `LATEST_CLI_VERSION` in `packages/core/src/version.ts`.
3. Set `plugins/grok/plugin.json` `version` to the same value.
4. Rewrite every `@porte/cli@x.y.z` pin (README, plugin skills) to the new version.
5. Print the release commit command; committing and pushing stays a human act.

README's release section points at the script. CI check (`publish-cli.yaml` step):
fail the publish when core's `LATEST_CLI_VERSION`, plugin.json, or any pin disagrees
with the package version — drift cannot ship.

## Call Stacks

### Update surfaces on the web

```txt
host connects → control upgrade carries x-porte-cli-version
  → HostRelayAgent.onConnect → hosts.save({ cliVersion, lastSeenAt })
  → AccountHost (existing host query) now carries cliVersion
  → useNotifications: isCliOutdated(host.cliVersion) → [cli-update notification]
  → burger dot; /notifications lists it; dismiss hides until the id changes
```

### Update surfaces in Grok

```txt
porte up (or rc <verb>) → control connect response x-porte-latest-cli
  → compare with __CLI_VERSION__
  → behind: print one line + write ~/.porte/update-available
  → statusline.sh appends "· update 0.2.4"
  → current: delete the file
```

## Files to Add / Change

| File                                                                 | Work                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/core/src/version.ts`                                       | `LATEST_CLI_VERSION`, `isCliOutdated`                                 |
| `packages/core/src/.../relay-headers` (core or web)                  | version + latest headers                                              |
| `apps/host` transport/connect                                        | send version header; read latest from response                        |
| `apps/host` rc/up entrypoints                                        | one-line nudge; update-available file                                 |
| `apps/host` statusline template                                      | append update suffix when the file exists                             |
| `apps/web` `host.schema.ts` + migration                              | `cli_version` column                                                  |
| `apps/web` `HostRelayAgent.onConnect` + host repository              | store version                                                         |
| `apps/web` `features/notifications/*` + `/_auth/notifications` route | model, hook, page                                                     |
| `apps/web` `app-menu.tsx`                                            | item + red dot                                                        |
| `scripts/release-cli.ts` + package script + README                   | release automation                                                    |
| `publish-cli.yaml`                                                   | drift check before publish                                            |
| Stories + tests                                                      | menu dot, notifications page, `isCliOutdated`, release-script dry run |

## Test Plan (RGR)

1. `isCliOutdated`: undefined → true; equal → false; lower/higher per segment.
2. Relay integration: control connect with the header persists `cliVersion` (extend
   the existing relay harness).
3. Host unit: connect response with a newer latest → the nudge line and the file;
   with an equal latest → no line, file removed.
4. Web: `deriveNotifications` on stale/current/unknown hosts; dismiss removes the dot
   and survives reload; page story with one notification and with none.
5. Release script dry run in a temp copy: all five write points agree afterwards.
6. Workflow drift check: mismatched plugin.json fails before `npm publish`.

## Open Questions

1. Plugin update cadence: does Grok check marketplace repos for new plugin versions
   on its own, or only on `u update`? Determines whether the plugin bump alone ever
   reaches users unprompted. Observed answer shapes the nudge copy only.
