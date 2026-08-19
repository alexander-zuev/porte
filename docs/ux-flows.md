# Porte UX Flows and Surface Standards

## Status

This document defines the intended first-release experience. It is the source of truth for flow
design, responsive behavior, Storybook states, CLI output, and acceptance criteria.

Implementation details can change. The experience contract should change only through an explicit
product decision.

## Product Model

Porte is a secure remote control for coding-agent sessions that continue to run on a local machine.

The primary journey crosses two devices:

1. The user starts pairing from the Porte CLI on the desktop.
2. The CLI displays a QR code and short-code fallback.
3. The user scans the QR code with a phone.
4. The user authenticates on the phone.
5. The phone confirms the desktop host.
6. The user browses, opens, creates, and controls local sessions from the phone.

The desktop owns local execution. The phone owns remote control. Porte coordinates trust and
delivery without becoming the execution owner.

The first release supports one paired host for each account. One account controls one Mac. Every
surface that names the host names that single Mac, never a list.

### Account states

Porte has no onboarding wizard, no tour, and no checklist. An account is in exactly one of three
states, and every surface resolves to the same next action.

| State    | Meaning                                      | Next action                        |
| -------- | -------------------------------------------- | ---------------------------------- |
| Unpaired | The account controls no Mac                  | Run `npx porte pair` on the Mac    |
| Pairing  | An attempt is open and awaiting confirmation | Confirm the phrase on both devices |
| Paired   | The account controls one Mac                 | Open or start a session            |

A fourth condition, failed, is a recoverable variant of pairing. It always returns the user to the
unpaired next action.

The whole product funnel is one line: install the CLI, sign in on the phone, confirm the phrase.
Nothing else is taught before first use. Capability is discovered inside the session surfaces, not
in an introduction.

## Experience Contract

### Premium surfaces

The following surfaces must feel deliberate, complete, and trustworthy:

- Desktop CLI onboarding, pairing, connection, and recovery.
- Mobile authentication and pairing handoff.
- Mobile session home and repository selection.
- Mobile conversation and turn control.
- Mobile permission and elicitation decisions.
- Mobile offline, reconnecting, and failure recovery.

### Supported surface

The desktop web interface must remain fully functional and accessible. It can use a straightforward
master-detail layout rather than receiving the same level of viewport-specific polish as mobile.

### Product experience principles

1. **Trust before novelty.** Show what machine, repository, session, and operation the user controls.
2. **State before action.** The user should understand connection and execution state before acting.
3. **No ambiguous delivery.** Distinguish queued, sent, running, completed, cancelled, and failed.
4. **Recovery is a primary flow.** Remote connectivity failures are expected product states.
5. **One action, one result.** Retry and reconnect must not duplicate prompts or sessions.
6. **Safe interruption.** Stop, deny, and cancel must remain understandable and reachable.
7. **Meaning is never color-only.** Labels, icons, placement, and state text carry the message.
8. **Responsive means adapted.** Mobile is not a scaled-down desktop composition.

## Universal UI Standards

### Ensure

- Give every screen one clear primary purpose.
- Keep the current host, repository, and session identifiable wherever they affect an action.
- Show visible progress for operations that do not complete immediately.
- Use stable action labels while an operation is pending.
- Explain why an action is unavailable when the reason is not obvious.
- Preserve user input across recoverable navigation and connection failures.
- Use semantic HTML, keyboard focus, accessible names, and sufficient contrast.
- Keep loading, empty, offline, error, and success states inside the same stable layout.
- Confirm destructive or trust-changing actions at the point of action.
- Use semantic design tokens and installed UI primitives.
- Use inline status for persistent conditions and toasts only for transient confirmation.
- Make every retry idempotent and communicate whether the original operation completed.

### Avoid

- Color as the only indicator of status.
- Toasts as the only record of an error, permission, or delivery result.
- Disabled controls with no visible explanation.
- Replacing stable button labels with loading text that changes width.
- Optimistically claiming that remote work started before the host acknowledges it.
- Hiding connection status inside a settings or overflow menu.
- Generic errors when Porte knows whether the host, relay, agent, or request failed.
- Requiring the user to reconstruct context after authentication or reconnecting.
- Hover-only information or interactions.
- Unnecessary dialogs for routine navigation and reversible actions.
- Local styling that bypasses component variants or semantic tokens.
- Skeletons that do not preserve the final layout.

## Mobile Standards

The mobile PWA is the primary control surface. It must be usable one-handed while the desktop is
physically out of reach.

### Ensure

- Use one primary pane at a time: session list, session detail, or focused decision.
- Provide an explicit back path from every session to the session home.
- Keep primary touch targets at least 44 by 44 CSS pixels.
- Place frequent and time-sensitive actions within comfortable thumb reach.
- Keep Stop available while a turn is running.
- Keep permission actions visible without requiring transcript scrolling.
- Respect safe-area insets around fixed headers, bottom controls, and the software keyboard.
- Use dynamic viewport units so browser chrome and the keyboard do not hide controls.
- Let long repository paths, session titles, tool output, and code wrap or scroll intentionally.
- Keep the composer stable while transcript content streams.
- Restore the latest confirmed session snapshot before applying live events.
- Show explicit sent, running, permission, reconnecting, cancelled, and failed states.
- Preserve an unsent draft through temporary disconnection.
- Test reflow at 320 CSS pixels and text resizing at 200 percent.
- Treat 360-390 CSS pixels as the primary comfortable design range.
- Use touch-safe alternatives for every hover interaction.

### Avoid

- Shrinking a desktop sidebar into a narrow mobile sidebar.
- Two-pane layouts on phone-sized viewports.
- Tiny icon-only actions without accessible names or touch area.
- Horizontal action rows that can overflow or compress permission labels.
- Fixed heights that conflict with browser chrome or the software keyboard.
- Headers that consume a large portion of the usable viewport.
- Placing Approve beside a destructive or navigational action without separation.
- Gestures as the only way to navigate, stop, approve, or deny.
- Auto-focusing inputs when it would open the keyboard before the user needs it.
- Clearing transcript position or draft content during reconnect.
- Treating offline mode as a generic full-screen error.

## Desktop CLI Standards

The CLI is a premium Porte surface. Premium means immediate comprehension, reliable behavior, and
careful typography in a terminal—not decoration at the expense of scanning or automation.

### Ensure

- Establish a recognizable Porte hierarchy: wordmark, task, instruction, status, and next step.
- Use concise language and progressive disclosure.
- Use semantic terminal colors consistently for information, success, warning, and failure.
- Combine color with symbols and text.
- Respect `NO_COLOR`, non-interactive output, redirected streams, and terminals without Unicode.
- Provide readable output at 80 columns and a composed layout at wider terminal widths.
- Keep machine-readable output available for automation.
- Print stable exit codes and actionable recovery instructions.
- Stop spinners and animations immediately when state changes or output is not interactive.
- Display the pairing URL and short code in copyable plain text.
- Give the QR code a standards-compliant quiet zone and high contrast.
- Encode only the minimum-lived pairing claim in the QR destination.
- Show expiry and regenerate without requiring the daemon to be reinstalled.
- Confirm the host name and paired account after completion.
- Keep daemon credentials out of stdout, logs, URLs, screenshots, and shell history.
- Make start, status, stop, restart, and logs discoverable from root help.
- Distinguish the one host daemon from the coding-agent processes it manages.
- Report daemon state, relay state, uptime, remote sessions, active turns, and agent process count.
- Prevent duplicate host daemons from starting for the same local identity.
- Keep lifecycle commands idempotent: starting an active host and stopping an inactive host are safe.
- Explain whether stopping will cancel active work before it changes process state.
- Preserve local session files when the host stops or is unpaired.
- Offer structured `--json` status for scripts and a composed summary for people.

### Avoid

- Modifying the QR matrix to draw a logo, wordmark, or decorative shape.
- Relying on terminal color for meaning.
- Large ASCII art that pushes the actual instruction below the fold.
- Animated output in CI, redirected output, or unsupported terminals.
- Printing a long secret for the user to copy manually.
- Infinite waiting with no timeout, expiry, or recovery instruction.
- Technical transport language such as Durable Object, WebSocket, or daemon token in normal UX.
- Reporting “connected” before the server confirms the authenticated host.
- Erasing useful error output while redrawing an interactive terminal region.
- Requiring PID discovery or operating-system process commands for normal management.
- Conflating sessions stored on disk with active agent processes.
- Killing active turns without an explicit warning and deliberate force option.
- Making `stop`, `restart`, or `status` depend on cloud availability.
- Using a stale PID file as the only proof that the daemon is alive.

### Pairing composition

The pairing QR code can be surrounded by Porte branding, spacing, and status content. The QR matrix
itself remains conventional and scannable.

The terminal composition should contain:

1. Porte identity.
2. “Pair this Mac” task heading.
3. One-sentence trust explanation.
4. QR code.
5. Short URL and six-character fallback code.
6. Expiration or remaining validity.
7. Waiting, completed, expired, or failed status.

After the phone authenticates, both devices display the same short verification phrase. The phone
confirms the Mac, and the CLI confirms the masked account identity. The server does not bind the
host or issue a daemon credential until both approvals are recorded.

### Daemon management composition

The first-release lifecycle commands are:

```text
porte start
porte status
porte stop
porte restart
porte logs
```

`porte start` launches the managed background host. `porte up` remains the foreground equivalent
for development, containers, and troubleshooting.

Human-readable `porte status` should answer:

```text
Porte is running

Host             Alex's MacBook Pro
Connection       Connected
Uptime           2h 14m
Remote sessions  3 open
Active turns     1 running
Agent processes  3 managed

Run `porte stop` to stop when current work is idle.
```

This is a content hierarchy, not fixed copy or spacing. Status must distinguish:

- The single Porte host daemon.
- Remote sessions currently opened by Porte.
- Turns currently executing.
- Child coding-agent processes owned by the daemon.
- Local session records that exist on disk but are not running.

`porte status --json` exposes the same model with stable field names.

A future macOS menu-bar helper should consume the same lifecycle and status contract. It must not
introduce a second process-management implementation.

## Desktop Web Standards

Desktop web is a supported control surface, but mobile receives the premium viewport-specific UX.

### Ensure

- Use a session-list and session-detail master-detail layout when space permits.
- Preserve all mobile capabilities and safety behavior.
- Support keyboard navigation and visible focus.
- Keep permission decisions near the relevant transcript event.
- Show host and session context in both panes.
- Collapse predictably to the mobile one-pane model at narrower widths.
- Carry host status and the account entry in a footer slot at the base of the list pane.

### Layout decision

Porte uses two panes, not a navigation sidebar. The list pane is the session list. It is not a
navigation rail.

A navigation sidebar earns its place when a product has several top-level sections. Porte has one:
sessions. Account and host management are a single leaf surface reached from the list-pane footer,
not a second navigation level.

The master-detail shell only renders when a paired host exists. An account with no host has no list
and no detail, so it receives a single full-page surface instead.

### Avoid

- Adding desktop-only capabilities that make mobile incomplete.
- Stretching transcript lines across the full viewport.
- Duplicating navigation controls without a clear hierarchy.
- Treating hover behavior as required.
- Showing an empty detail pane without guidance.

## Pairing Implementation Decision

Pairing runs on the OAuth 2.0 Device Authorization Grant, RFC 8628, through the Better Auth
`device-authorization` plugin. Porte does not implement its own attempt lifecycle.

The plugin owns the transport:

| Step                             | Plugin                                |
| -------------------------------- | ------------------------------------- |
| Create the attempt               | `deviceAuthorization`                 |
| Six-character code               | `userCode`, sized by `userCodeLength` |
| Claim by code                    | `deviceVerify`                        |
| Approve or refuse                | `deviceApprove`, `deviceDeny`         |
| Desktop waits for its credential | `deviceToken`, polled at `interval`   |
| Expiry, single use, replay       | `expiresIn` and the specification     |

Porte owns what the specification does not cover:

1. **The verification phrase.** RFC 8628 proves that a signed-in person approved a device code. It
   does not prove that the approved machine is the machine in front of that person. The phrase shown
   on both screens is the step that binds the two devices, and it is deliberate Porte behavior.
2. **The host record.** Name, platform, availability, and last seen.
3. **The one-host rule.** The first release binds at most one Mac to one account.

`PairingClaim` maps onto verify and `PairingConfirmation` onto approve. Web handlers call the plugin
rather than reimplementing attempt storage, code generation, or single-use enforcement.

## Flow 1: Initiate Pairing on Desktop

### Entry

The unpaired user runs:

```text
porte pair
```

After pairing, `porte start` launches the managed background host. `porte up` remains the
foreground equivalent. Neither command requires the user to manually create or paste a daemon
credential.

### Happy path

1. CLI checks local prerequisites and network reachability.
2. CLI creates a short-lived pairing attempt.
3. CLI displays the Porte pairing composition.
4. CLI waits for the phone to claim the attempt.
5. CLI receives the authenticated account claim and shared verification phrase.
6. CLI shows the masked account identity and asks for explicit confirmation.
7. User confirms the account from the CLI.
8. Server completes the binding after the phone also confirms the host.
9. CLI receives the one-time daemon credential.
10. CLI stores the credential using the approved local credential mechanism.
11. CLI starts or clearly offers to start the managed host.
12. CLI reports “Paired and connected.”

### Required states

- Checking prerequisites.
- Creating pairing attempt.
- Waiting for phone.
- Phone opened the attempt.
- Waiting for authentication.
- Waiting for phone confirmation.
- Waiting for CLI confirmation.
- Confirmations do not match.
- Paired and connecting.
- Paired and connected.
- Attempt expired.
- Network unavailable.
- Server rejected the attempt.
- Already paired.
- Re-pair confirmation required.
- Pairing succeeded but host connection failed.

### Acceptance criteria

- The QR destination opens the exact pairing attempt.
- The short code can complete the same attempt.
- The attempt expires and cannot be reused.
- An authenticated phone claim alone cannot pair the host.
- Both devices display the same verification phrase.
- The CLI confirms a masked account identity before the server binds the host.
- Restarting the command does not create two active host identities.
- No credential appears in normal output or shell history.
- Non-interactive mode prints stable text without cursor control.
- The user always receives a next action after failure.

## Flow 2: Claim Pairing on Mobile

### Entry

The QR code opens a short-lived pairing URL. The URL preserves pairing intent through
authentication without exposing the daemon credential.

### Happy path

1. Phone validates the pairing attempt after authentication.
2. If signed out, the pairing route redirects to sign-in with pairing intent preserved.
3. Sign-in shows why pairing needs an account, then OAuth returns to the same pairing URL.
4. Phone shows the host identity and the shared verification phrase.
5. User confirms the host from the phone.
6. Phone waits for explicit CLI confirmation of the account.
7. Phone reports success after both confirmations.
8. Phone continues directly to the session home.

The user does not re-enter the pairing code after authentication.

### Required states

- Validating pairing link.
- Signed out with preserved intent.
- Authentication pending.
- Authentication cancelled or failed.
- Ready to confirm host.
- Waiting for CLI confirmation.
- Confirmations do not match.
- Paired successfully.
- Attempt expired.
- Attempt already consumed.
- Attempt belongs to another account.
- Host disconnected during pairing.
- Server temporarily unavailable.

### Acceptance criteria

- Refreshing or returning from OAuth preserves the attempt.
- Back navigation does not silently pair the host.
- Confirmation identifies the Mac in human language.
- The phone shows the same verification phrase as the CLI.
- The account and host remain unpaired until both endpoints approve.
- Success has a direct path to sessions.
- Expired and consumed attempts cannot be retried as if still valid.
- The fallback code route reaches the same confirmation state.

## Flow 3: Session Home

### Purpose

The session home answers:

- Which Mac am I controlling?
- Is it reachable?
- What work exists?
- What is active?
- How do I resume or start work?

### Happy path

1. Load the authenticated host snapshot.
2. Show host identity and connection state.
3. Group sessions by repository.
4. Identify active or recently updated sessions.
5. Let the user open a session.
6. Let the user start a session in a known repository.

### Required states

- Loading initial snapshot.
- Online with sessions.
- Online with no sessions.
- Online with sessions but no known repository for creation.
- Host offline with last-seen information.
- Reconnecting.
- Snapshot failed.
- No paired host.
- Pairing revoked.

### No paired host

A signed-in account with no host never sees the master-detail shell. It sees one full-page surface
that states the situation and carries the single next action.

The surface contains:

1. What Porte is about to connect.
2. The `npx porte pair` command as copyable text.
3. One sentence naming what happens next on the phone.
4. A secondary path for a user who already has a pairing code.

The same surface serves a revoked pairing, with copy that names the revocation first.

### Acceptance criteria

- Session titles and repository names remain distinguishable on narrow screens.
- Offline sessions remain visible when safe cached metadata exists.
- “New session” explains why it is unavailable when the host is offline.
- Opening a session has one visible pending state and cannot be submitted twice.
- Phone navigation enters one session pane; desktop can retain the list pane.
- An account with no host never renders an empty list pane or an empty detail pane.
- The unpaired surface states the pairing command without requiring navigation.

## Flow 4: Create a Session

### Happy path

1. User chooses a known repository.
2. Phone shows the selected host and repository.
3. User optionally enters an initial prompt.
4. Phone creates the session with one idempotent request.
5. Phone opens the returned session snapshot.
6. If an initial prompt exists, it starts only after session creation is confirmed.

### Required states

- Loading repositories.
- Repository list ready.
- No known repositories.
- Host went offline.
- Creating session.
- Session created and opening.
- Creation failed safely.
- Creation result unknown after disconnect.

### Acceptance criteria

- Retrying cannot create a duplicate session.
- The repository path is recognizable but does not dominate the mobile layout.
- The user can return without losing an initial prompt.
- An unknown result is not presented as a confirmed failure or success.

## Flow 5: Open and Restore a Session

### Happy path

1. Phone requests the session snapshot.
2. Stable session layout appears.
3. Snapshot replaces any stale local view.
4. Live events begin only after the snapshot.
5. Transcript position moves predictably to the latest relevant content.

### Required states

- Opening.
- Restoring snapshot.
- Ready and idle.
- Turn already running.
- Permission already pending.
- Session unavailable.
- Agent failed.
- Host disconnected while opening.

### Acceptance criteria

- Snapshot and live events never render duplicate transcript items.
- The current model, mode, repository, and session remain discoverable.
- Phone has an explicit route back to session home.
- Desktop can show session list and detail simultaneously.

## Flow 6: Start and Control a Turn

### Happy path

1. User composes a prompt.
2. Phone validates that the session can accept a turn.
3. Prompt enters a sending state.
4. Host acknowledges the turn.
5. UI shows running state and incremental transcript updates.
6. User can stop the turn.
7. Turn reaches completed, cancelled, or failed.

### Required states

- Draft.
- Sending.
- Delivery unknown.
- Running.
- Waiting for permission.
- Waiting for elicitation.
- Stopping.
- Cancelled.
- Completed.
- Failed.
- Reconnecting during any non-terminal state.

### Acceptance criteria

- The prompt cannot be sent twice by repeated taps.
- A failed send preserves the draft when retry is safe.
- Stop remains reachable and has one clear pending state.
- Reconnect restores the authoritative turn state.
- Completion does not erase reasoning, tools, plans, or usage already displayed.

## Flow 7: Permission Decision

### Purpose

The user must understand what the agent wants to do and make an explicit decision without accidental
approval.

### Happy path

1. Permission appears inline at the relevant transcript position.
2. A persistent decision surface remains reachable while pending.
3. UI shows the request title, detail, and every advertised option.
4. User chooses one option.
5. Choice enters a submitting state.
6. Host confirms that the response reached the agent.
7. Transcript records the resolved decision.

### Required states

- Permission requested.
- Submitting response.
- Approved.
- Denied.
- Cancelled with turn.
- Response failed.
- Delivery unknown.
- Reconnecting with permission pending.
- Permission already resolved elsewhere.

### Acceptance criteria

- No option is selected automatically.
- Approval and denial are not communicated by color alone.
- Long option labels reflow without horizontal scrolling.
- Repeated taps cannot submit multiple responses.
- Reconnect does not lose or duplicate the decision.
- The most permissive option does not receive accidental visual priority without product intent.

## Flow 8: Elicitation

### Happy path

1. Agent requests structured input or a URL action.
2. Phone presents the request in the session context.
3. User completes, declines, or cancels.
4. Validation occurs before submission.
5. Host confirms the response.

### Required states

- Form requested.
- URL action requested.
- Invalid input.
- Submitting.
- Completed.
- Declined.
- Cancelled.
- Delivery failed or unknown.

### Acceptance criteria

- Input labels and validation are accessible.
- User input survives recoverable connection failure.
- External URL intent is explicit before leaving Porte.
- Cancellation remains available when the agent supports it.

## Flow 9: Offline and Reconnection

### Purpose

The user must understand what is known, what is stale, and which actions are safe.

### Required states

- Phone temporarily offline.
- Host offline.
- Relay unavailable.
- Reconnecting with no active operation.
- Reconnecting while a turn may be running.
- Reconnecting while a response may be in flight.
- Reconnected and snapshot restoring.
- Recovered.
- Recovery failed.

### Acceptance criteria

- UI distinguishes phone, host, relay, and agent failures when known.
- Cached content is visibly stale without becoming unusable.
- Unsafe actions remain blocked with an explanation.
- Safe drafts remain editable.
- Reconnect restores a snapshot before new events.
- Retry uses the original logical request identifiers.

## Flow 10: Host Management

### First-release capabilities

- View paired host identity and current availability.
- Understand how to run or restart the host.
- Re-pair the existing single-host account deliberately.
- Revoke the host credential.

### Required states

- Paired and online.
- Paired and offline.
- Credential rejected.
- Re-pair required.
- Revoking.
- Revoked.

### Acceptance criteria

- Re-pair and revoke explain their effect on remote access.
- Revocation does not imply deletion of local sessions.
- The account cannot control an old host after credential revocation.

## Flow 11: Manage the Host Daemon

### Purpose

The CLI lets the user understand and control the complete local Porte lifecycle without finding
PIDs, inspecting process lists, or knowing the operating-system service manager.

### Start

```text
porte start
```

1. Check whether the managed host is already running.
2. Validate that the machine is paired.
3. Start exactly one supervised host daemon.
4. Wait for local process readiness.
5. Wait for authenticated relay connection or report reconnecting state.
6. Print the resulting host state and next useful command.

Starting an already running daemon returns its current status and exits successfully.

### Status

```text
porte status
porte status --json
```

Human output reports:

- Paired host identity.
- Daemon state: stopped, starting, running, stopping, or failed.
- Relay state: connected, reconnecting, offline, or credential rejected.
- Process identifier and uptime when useful.
- Open remote session count.
- Active turn count.
- Managed coding-agent process count.
- Last safe failure summary and next action.

Structured output exposes the same facts without ANSI formatting or prose.

### Stop

```text
porte stop
porte stop --force
```

1. Check current daemon and managed-process state.
2. If no active turns exist, stop accepting work and shut down gracefully.
3. Close managed coding-agent processes.
4. Disconnect the host relay.
5. Confirm that the daemon stopped.
6. Preserve local session files and pairing credentials.

If active turns exist, normal `porte stop` refuses to stop and reports their count. It explains
that `porte stop --force` cancels active turns before shutdown.

Stopping an already stopped daemon succeeds and says that Porte is already stopped.

### Restart

```text
porte restart
porte restart --force
```

Restart follows the same active-turn safety rule as stop. A successful restart reports both local
daemon readiness and remote connection state.

### Logs

```text
porte logs
porte logs --follow
```

Logs contain safe lifecycle and diagnostic metadata only. They never contain prompts, transcript
content, tool output, daemon credentials, or pairing claims.

### Required states

- Unpaired.
- Stopped.
- Starting.
- Running and connected.
- Running and reconnecting.
- Running with active turns.
- Stopping.
- Failed to start.
- Credential rejected.
- Stale supervisor state with no live daemon.
- More than one daemon detected.
- Forced shutdown in progress.

### Acceptance criteria

- A normal user never needs `ps`, `kill`, `launchctl`, or PID-file inspection.
- At most one managed host daemon runs for one local Porte identity.
- Status reflects process liveness rather than trusting a PID file alone.
- Session, turn, and process counts have distinct labels.
- Stop cannot silently cancel an active turn.
- Force stop cancels active turns before terminating child processes.
- Stop and unpair remain separate operations.
- Local session data survives start, stop, restart, and unpair.
- Lifecycle commands work without cloud availability when the action is local.
- Every command supports non-interactive output and stable exit behavior.

## Flow 12: Account Management

### Purpose

One surface holds everything the user owns: who they are signed in as, which Mac they control, and
how to leave. It is reached from the list-pane footer and from the unpaired surface.

### First-release capabilities

- View the signed-in identity from the authentication provider.
- View the paired host and its current availability.
- Unpair the host.
- Sign out.
- Delete the account.

### Happy path

1. User opens the account surface.
2. Surface shows the signed-in identity and the paired host.
3. User chooses unpair, sign out, or delete.
4. Destructive choices ask for confirmation that names the effect.
5. Porte applies the change and moves the user to the resulting state.

### Required states

- Signed in with a paired host.
- Signed in with no paired host.
- Unpairing.
- Unpair failed.
- Signing out.
- Delete requested and awaiting confirmation.
- Deleting.
- Delete failed.

### Acceptance criteria

- Sign-out ends the session, clears cached account state, and lands on a signed-out surface.
- Sign-out never leaves the user on an authenticated route with a dead session.
- Unpair states that the Mac keeps its local sessions and files.
- Unpair returns the account to the unpaired state, not to an error.
- Delete states what is removed and that it cannot be undone.
- Delete removes the identity and session metadata described in the privacy page.
- Delete requires a deliberate confirmation, not a single click.
- A failed destructive action leaves the previous state intact and says so.

## Data Contract

This section defines what each surface reads and writes. It constrains shape, not transport.

### Principles

1. One surface, one authoritative read. Related facts arrive together or not at all.
2. A read returns a state, not loose fields. Impossible combinations must be unrepresentable.
3. Mutations are idempotent and carry the logical identifier of the original request.
4. Identity comes from the authenticated route context, never from a separate request.

### Session home

Reads one host snapshot. The snapshot resolves to exactly one state:

| State    | Carries                                                                                 |
| -------- | --------------------------------------------------------------------------------------- |
| Unpaired | Nothing                                                                                 |
| Loading  | Host name when already known                                                            |
| Ready    | Host name, availability, last seen, sessions grouped by repository, running session ids |
| Revoked  | Host name                                                                               |
| Error    | Host name when already known                                                            |

Host and sessions are one fact. Sessions must never render without the host that owns them.

Mutations: open session, create session, pair with code.

### Account

Reads the same host snapshot plus the identity already present in the authenticated route context.
It issues no separate identity request.

Mutations: unpair, sign out, delete account. Each invalidates the host snapshot on success.

### Session detail

Reads one session snapshot, then applies live events. Live events never precede the snapshot.

Mutations: send prompt, stop turn, answer permission, answer elicitation.

## Storybook Coverage Contract

Storybook is the visual specification for web flows.

Each premium mobile flow must include stories for:

- Happy path.
- Loading or pending.
- Empty where applicable.
- Offline or reconnecting.
- Error.
- Long content.
- Narrow reflow.
- Permission or safety-critical interruption where applicable.

Required page story families:

- Mobile pairing: validating, sign-in required, confirm, success, expired, consumed, host lost.
- Session home: online grouped, online empty, offline, reconnecting, load failure, no paired host.
- Account: paired, unpaired, unpairing, delete confirmation, deleting, delete failed.
- New session: repository list, no repositories, creating, unknown result, failed.
- Session: restoring, idle, running, permission, elicitation, stopping, completed, offline.
- Host management: online, offline, revoked, re-pair.

Desktop web stories should demonstrate the master-detail form of session home and session detail.

## CLI Coverage Contract

The CLI requires deterministic output tests rather than Storybook.

Test:

- Interactive Unicode and color output.
- Interactive output with `NO_COLOR`.
- ASCII fallback.
- Non-interactive and redirected output.
- 80-column layout.
- Wide terminal layout.
- Pairing waiting, success, expiry, and failure.
- QR data round trip.
- Short-code fallback.
- Start when stopped and when already running.
- Status for every daemon and relay state.
- Status counts for sessions, turns, and managed processes.
- Structured status output.
- Graceful stop while idle.
- Refused stop while turns are active.
- Forced stop cancellation and child-process cleanup.
- Restart safety.
- Logs and follow mode.
- Duplicate-daemon prevention.
- Stale supervisor-state recovery.
- Secret redaction.
- Stable exit codes.

Golden output can protect composition, but tests must normalize time, terminal capability, and
ephemeral pairing values.

## Quality Gates

A premium flow is complete only when:

1. Happy, pending, empty, offline, and error states are specified.
2. Mobile reflows without horizontal page scrolling at 320 CSS pixels.
3. Text can resize to 200 percent without clipping required actions.
4. Keyboard and screen-reader checks pass.
5. Touch targets meet the mobile standard.
6. Critical state is not conveyed by color alone.
7. Retry and reconnect behavior is defined.
8. Storybook or CLI fixtures cover the states.
9. The implementation passes type, lint, accessibility, and interaction tests.
10. Product copy names the user-visible problem and next action.

## Decisions Still Required

- Where the verification phrase is derived, given the plugin owns the device and user codes.
- Whether the desktop confirmation reuses `deviceApprove` or needs a second Porte-side step.
- Pairing attempt lifetime and refresh behavior, expressed as plugin `expiresIn` and `interval`.
- Source and editability of the host display name.
- Local credential storage mechanism by operating system.
- First-release daemon supervisor: macOS LaunchAgent, portable process manager, or both.
- Local lifecycle/status interface that a future macOS menu-bar helper will consume.
- Repository discovery rules for new sessions.
- Whether an initial prompt is part of session creation or a separate confirmed turn.
- Session-close language and whether it is exposed in the first mobile release.
- Notification behavior for permissions while the PWA is backgrounded.
