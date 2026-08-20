# Porte UX Flows and Surface Standards

## Status

This document defines the intended first-release experience. It is the source of truth for flow
design, responsive behavior, Storybook states, CLI output, and acceptance criteria.

Implementation details can change. The experience contract should change only through an explicit
product decision.

Nothing here is settled because it is written down. Replace a section when a better design appears,
and delete the part that no longer holds in the same edit. A document nobody finishes reading is a
document that keeps requirements nobody can build.

## Product Model

Porte is a secure remote control for coding-agent conversations that continue to run on a local machine.

The primary journey crosses two devices, but pairing itself does not:

1. The user runs `porte pair` on the Mac.
2. The CLI prints a URL and an eight-character code.
3. The user opens that URL in any browser already signed in to Porte, on any device.
4. The user checks the account named on screen and approves.
5. The Mac receives its credential and connects.
6. The user browses, opens, creates, and controls local conversations from the phone.

Step 3 is deliberately not "scan this with your phone". The person is sitting at the Mac, and any
signed-in browser can approve. The phone is what Porte is _for_, not what pairing needs.

The desktop owns local execution. The phone owns remote control. Porte coordinates trust and
delivery without becoming the execution owner.

The first release supports one paired host for each account. One account controls one Mac. Every
surface that names the host names that single Mac, never a list.

### Account states

Porte has no onboarding wizard, no tour, and no checklist. An account is in exactly one of three
states, and every surface resolves to the same next action.

| State    | Meaning                              | Next action                     |
| -------- | ------------------------------------ | ------------------------------- |
| Unpaired | The account controls no Mac          | Run `npx porte pair` on the Mac |
| Pairing  | A code is open and awaiting approval | Approve the code in a browser   |
| Paired   | The account controls one Mac         | Open or start a conversation    |

A fourth condition, failed, is a recoverable variant of pairing. It always returns the user to the
unpaired next action.

The whole product funnel is one line: install the CLI, sign in, approve the code. Nothing else is
taught before first use. Capability is discovered inside the conversation surfaces, not in an
introduction.

## Experience Contract

### Premium surfaces

The following surfaces must feel deliberate, complete, and trustworthy:

- Desktop CLI onboarding, pairing, connection, and recovery.
- Mobile authentication and pairing handoff.
- Mobile conversation home and repository selection.
- Mobile conversation and turn control.
- Mobile permission and elicitation decisions.
- Mobile offline, reconnecting, and failure recovery.

### Supported surface

The desktop web interface must remain fully functional and accessible. It can use a straightforward
master-detail layout rather than receiving the same level of viewport-specific polish as mobile.

### Product experience principles

1. **Trust before novelty.** Show what machine, repository, conversation, and operation the user controls.
2. **State before action.** The user should understand connection and execution state before acting.
3. **No ambiguous delivery.** Distinguish queued, sent, running, completed, cancelled, and failed.
4. **Recovery is a primary flow.** Remote connectivity failures are expected product states.
5. **One action, one result.** Retry and reconnect must not duplicate prompts or conversations.
6. **Safe interruption.** Stop, deny, and cancel must remain understandable and reachable.
7. **Meaning is never color-only.** Labels, icons, placement, and state text carry the message.
8. **Responsive means adapted.** Mobile is not a scaled-down desktop composition.

## Universal UI Standards

### Ensure

- Give every screen one clear primary purpose.
- Keep the current host, repository, and conversation identifiable wherever they affect an action.
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

- Use one primary pane at a time: conversation list, conversation detail, or focused decision.
- Provide an explicit back path from every conversation to the conversation home.
- Keep primary touch targets at least 44 by 44 CSS pixels.
- Place frequent and time-sensitive actions within comfortable thumb reach.
- Keep Stop available while a turn is running.
- Keep permission actions visible without requiring transcript scrolling.
- Respect safe-area insets around fixed headers, bottom controls, and the software keyboard.
- Use dynamic viewport units so browser chrome and the keyboard do not hide controls.
- Let long repository paths, conversation titles, tool output, and code wrap or scroll intentionally.
- Keep the composer stable while transcript content streams.
- Restore the latest confirmed conversation snapshot before applying live events.
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
- Display the pairing URL and code in copyable plain text.
- Show expiry and regenerate without requiring the daemon to be reinstalled.
- Say that the pairing lapses after a period without connecting.
- Keep daemon credentials out of stdout, logs, URLs, screenshots, and shell history.
- Make start, status, stop, restart, and logs discoverable from root help.
- Distinguish the one host daemon from the coding-agent processes it manages.
- Report daemon state, relay state, uptime, remote conversations, active turns, and agent process count.
- Prevent duplicate host daemons from starting for the same local identity.
- Keep lifecycle commands idempotent: starting an active host and stopping an inactive host are safe.
- Explain whether stopping will cancel active work before it changes process state.
- Preserve local conversation files when the host stops or is unpaired.
- Offer structured `--json` status for scripts and a composed summary for people.

### Avoid

- Relying on terminal color for meaning.
- Large ASCII art that pushes the actual instruction below the fold.
- Animated output in CI, redirected output, or unsupported terminals.
- Printing a long secret for the user to copy manually.
- Infinite waiting with no timeout, expiry, or recovery instruction.
- Technical transport language such as Durable Object, WebSocket, or daemon token in normal UX.
- Reporting “connected” before the server confirms the authenticated host.
- Erasing useful error output while redrawing an interactive terminal region.
- Requiring PID discovery or operating-system process commands for normal management.
- Conflating conversations stored on disk with active agent processes.
- Killing active turns without an explicit warning and deliberate force option.
- Making `stop`, `restart`, or `status` depend on cloud availability.
- Using a stale PID file as the only proof that the daemon is alive.

### Pairing composition

The terminal composition contains:

1. A task heading naming what is about to happen.
2. The verification URL.
3. The eight-character code, set apart so it can be read off the screen.
4. Remaining validity.
5. Waiting, completed, expired, or failed status.

No QR code. The person is at the Mac and can open the URL in the browser in front of them; a QR
would only help if approval had to happen on a second device, and it does not.

The CLI shows the code and waits. It has no second confirmation step, because nothing reaches the
daemon between requesting the code and receiving the credential except the credential itself.

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
Remote conversations  3 open
Active turns     1 running
Agent processes  3 managed

Run `porte stop` to stop when current work is idle.
```

This is a content hierarchy, not fixed copy or spacing. Status must distinguish:

- The single Porte host daemon.
- Remote conversations currently opened by Porte.
- Turns currently executing.
- Child coding-agent processes owned by the daemon.
- Local conversation records that exist on disk but are not running.

`porte status --json` exposes the same model with stable field names.

A future macOS menu-bar helper should consume the same lifecycle and status contract. It must not
introduce a second process-management implementation.

## Desktop Web Standards

Desktop web is a supported control surface, but mobile receives the premium viewport-specific UX.

### Ensure

- Use a conversation-list and conversation-detail master-detail layout when space permits.
- Preserve all mobile capabilities and safety behavior.
- Support keyboard navigation and visible focus.
- Keep permission decisions near the relevant transcript event.
- Show host and conversation context in both panes.
- Collapse predictably to the mobile one-pane model at narrower widths.
- Carry host status and the account entry in a footer slot at the base of the list pane.

### Layout decision

Porte uses two panes, not a navigation sidebar. The list pane is the conversation list. It is not a
navigation rail.

A navigation sidebar earns its place when a product has several top-level sections. Porte has one:
conversations. Account and host management are a single leaf surface reached from the list-pane footer,
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

### Why a device grant at all

The Mac has no browser and must never handle a password. The grant moves the authorising step to a
browser that already holds a conversation, and hands the Mac a credential belonging to whoever approved.

### What the plugin owns

| Step                            | Endpoint                          | Notes                                    |
| ------------------------------- | --------------------------------- | ---------------------------------------- |
| Request a code pair             | `/device/code`                    | Returns `device_code` and `user_code`    |
| Validate and claim by code      | `/device`                         | Claims the code for the signed-in person |
| Approve or refuse               | `/device/approve`, `/device/deny` | Requires the claim first                 |
| Daemon waits for its credential | `/device/token`                   | Polled at `interval`                     |
| Expiry, single use, replay      | `expiresIn`                       | Per the specification                    |

Two codes exist for a reason: the daemon polls with the long secret one, and shows the short one.
Displaying the polling secret would let anyone reading the screen take the conversation.

The daemon receives a **Better Auth session token**, not a bespoke credential. There is no Porte
daemon token and no token hash stored anywhere.

### What Porte owns

1. **The host record.** Name, platform, availability, last seen.
2. **The one-host rule.** The first release binds at most one Mac to one account.
3. **The approval screen.** Which account is about to gain a Mac.

### What Porte deliberately does not do

**There is no verification phrase shown on both screens.** Between requesting a code and receiving
a credential, the only channel from server to daemon is the token poll, which carries a credential
or an error and nothing else. The Mac cannot be told a phrase, so it cannot display one.

What the grant proves is that a signed-in person approved a specific code. What it does not prove
is that the machine holding that code is the machine in front of them. The mitigation is the code's
short life, its single use, and the account named on the approval screen, which is where a person
notices they are signed in as someone they did not expect.

### Where the host record is created

At the daemon's **first connection**, not at approval. Only the daemon knows its name and platform,
so creating the row earlier would mean writing a placeholder and correcting it moments later.

One consequence to design for: between approval and first connect, a valid conversation exists with no
host row. That window is what an account with no paired Mac looks like, and it is honest — no Mac
has connected yet.

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

1. CLI requests a code pair.
2. CLI displays the URL and the code, then waits.
3. CLI polls at the interval the server set.
4. Someone approves the code in a signed-in browser.
5. CLI receives the conversation token and stores it, readable only by this user.
6. CLI reports success and names the next command.

### Required states

- Requesting a code.
- Waiting for approval, with remaining validity.
- Paired.
- Code expired without approval.
- Approval declined.
- Porte unreachable.
- Porte answered with something the grant does not define.

### Acceptance criteria

- The code expires and cannot be reused.
- The polling secret never appears on screen.
- Polling stays within the server's rate limit at the interval the server set.
- Repeating the command does not create two host identities.
- No credential appears in normal output or shell history.
- Non-interactive mode prints stable text without cursor control.
- The user always receives a next action after failure.
- Success states that the pairing lapses after a period without connecting.

## Flow 2: Approve Pairing in a Browser

### Entry

`/pair`, opened from the URL the CLI printed. The code can arrive in the URL or be typed.

Any browser, on any device. Usually the Mac's own, since that is where the person is standing.

### Happy path

1. If signed out, the route sends the user to sign-in and returns to `/pair` afterwards.
2. The user enters the eight-character code, or it arrives prefilled.
3. Porte validates the code and claims it for this conversation.
4. The screen names the account that is about to gain a Mac, and asks for approval.
5. The user approves.
6. The screen confirms, and says the Mac will appear once it connects.

The user does not re-enter the code after signing in.

### Required states

- Entering the code.
- Validating.
- Ready to approve, naming the account.
- Approving.
- Approved.
- Code not recognised.
- Code expired.
- Code already used.
- Porte temporarily unavailable.

### Acceptance criteria

- Returning from sign-in preserves the code.
- Back navigation does not silently approve.
- The approval screen names the account, so a wrong sign-in is visible before approving.
- Nothing is approved until the user acts; arriving at the page is not consent.
- Expired and used codes cannot be retried as if still valid.
- Success has a direct path to conversations.
- Success does not claim a Mac is paired before one has connected.

## Flow 3: Conversation Home

### Purpose

The conversation home answers:

- Which Mac am I controlling?
- Is it reachable?
- What work exists?
- What is active?
- How do I resume or start work?

### Happy path

1. Load the authenticated host snapshot.
2. Show host identity and connection state.
3. Group conversations by repository.
4. Identify active or recently updated conversations.
5. Let the user open a conversation.
6. Let the user start a conversation in a known repository.

### Required states

- Loading initial snapshot.
- Online with conversations.
- Online with no conversations.
- Online with conversations but no known repository for creation.
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

- Conversation titles and repository names remain distinguishable on narrow screens.
- Offline conversations remain visible when safe cached metadata exists.
- “New conversation” explains why it is unavailable when the host is offline.
- Opening a conversation has one visible pending state and cannot be submitted twice.
- Phone navigation enters one conversation pane; desktop can retain the list pane.
- An account with no host never renders an empty list pane or an empty detail pane.
- The unpaired surface states the pairing command without requiring navigation.

## Flow 4: Create a Conversation

### Happy path

1. User chooses a known repository.
2. Phone shows the selected host and repository.
3. User optionally enters an initial prompt.
4. Phone creates the conversation with one idempotent request.
5. Phone opens the returned conversation snapshot.
6. If an initial prompt exists, it starts only after conversation creation is confirmed.

### Required states

- Loading repositories.
- Repository list ready.
- No known repositories.
- Host went offline.
- Creating conversation.
- Conversation created and opening.
- Creation failed safely.
- Creation result unknown after disconnect.

### Acceptance criteria

- Retrying cannot create a duplicate conversation.
- The repository path is recognizable but does not dominate the mobile layout.
- The user can return without losing an initial prompt.
- An unknown result is not presented as a confirmed failure or success.

## Flow 5: Open and Restore a Conversation

### Happy path

1. Phone requests the conversation snapshot.
2. Stable conversation layout appears.
3. Snapshot replaces any stale local view.
4. Live events begin only after the snapshot.
5. Transcript position moves predictably to the latest relevant content.

### Required states

- Opening.
- Restoring snapshot.
- Ready and idle.
- Turn already running.
- Permission already pending.
- Conversation unavailable.
- Agent failed.
- Host disconnected while opening.

### Acceptance criteria

- Snapshot and live events never render duplicate transcript items.
- The current model, mode, repository, and conversation remain discoverable.
- Phone has an explicit route back to conversation home.
- Desktop can show conversation list and detail simultaneously.

## Flow 6: Start and Control a Turn

### Happy path

1. User composes a prompt.
2. Phone validates that the conversation can accept a turn.
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
2. Phone presents the request in the conversation context.
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
- Revocation does not imply deletion of local conversations.
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
- Open remote conversation count.
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
6. Preserve local conversation files and pairing credentials.

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
- Conversation, turn, and process counts have distinct labels.
- Stop cannot silently cancel an active turn.
- Force stop cancels active turns before terminating child processes.
- Stop and unpair remain separate operations.
- Local conversation data survives start, stop, restart, and unpair.
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

- Sign-out ends the conversation, clears cached account state, and lands on a signed-out surface.
- Sign-out never leaves the user on an authenticated route with a dead conversation.
- Unpair states that the Mac keeps its local conversations and files.
- Unpair returns the account to the unpaired state, not to an error.
- Delete states what is removed and that it cannot be undone.
- Delete removes the identity and conversation metadata described in the privacy page.
- Delete requires a deliberate confirmation, not a single click.
- A failed destructive action leaves the previous state intact and says so.

## Data Contract

This section defines what each surface reads and writes. It constrains shape, not transport.

### Principles

1. One surface, one authoritative read. Related facts arrive together or not at all.
2. A read returns a state, not loose fields. Impossible combinations must be unrepresentable.
3. Mutations are idempotent and carry the logical identifier of the original request.
4. Identity comes from the authenticated route context, never from a separate request.

### Conversation home

Reads one host snapshot. The snapshot resolves to exactly one state:

| State    | Carries                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------- |
| Unpaired | Nothing                                                                                           |
| Loading  | Host name when already known                                                                      |
| Ready    | Host name, availability, last seen, conversations grouped by repository, running conversation ids |
| Revoked  | Host name                                                                                         |
| Error    | Host name when already known                                                                      |

Host and conversations are one fact. Conversations must never render without the host that owns them.

Mutations: open conversation, create conversation, pair with code.

### Account

Reads the same host snapshot plus the identity already present in the authenticated route context.
It issues no separate identity request.

Mutations: unpair, sign out, delete account. Each invalidates the host snapshot on success.

### Conversation detail

Reads one conversation snapshot, then applies live events. Live events never precede the snapshot.

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

- Pairing: entering code, validating, sign-in required, ready to approve, approving, approved,
  not recognised, expired, already used.
- Conversation home: online grouped, online empty, offline, reconnecting, load failure, no paired host.
- Account: paired, unpaired, unpairing, delete confirmation, deleting, delete failed.
- New conversation: repository list, no repositories, creating, unknown result, failed.
- Conversation: restoring, idle, running, permission, elicitation, stopping, completed, offline.
- Host management: online, offline, revoked, re-pair.

Desktop web stories should demonstrate the master-detail form of conversation home and conversation detail.

## CLI Coverage Contract

The CLI requires deterministic output tests rather than Storybook.

Test:

- Interactive Unicode and color output.
- Interactive output with `NO_COLOR`.
- ASCII fallback.
- Non-interactive and redirected output.
- 80-column layout.
- Wide terminal layout.
- Pairing waiting, success, expiry, decline, and unreachable.
- Polling interval honoured, including a server asking for a slower one.
- Start when stopped and when already running.
- Status for every daemon and relay state.
- Status counts for conversations, turns, and managed processes.
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

- Source and editability of the host display name.
- Whether the stored credential moves from a `0600` file to the macOS Keychain.
- First-release daemon supervisor: macOS LaunchAgent, portable process manager, or both.
- Local lifecycle/status interface that a future macOS menu-bar helper will consume.
- Repository discovery rules for new conversations.
- Whether an initial prompt is part of conversation creation or a separate confirmed turn.
- Conversation-close language and whether it is exposed in the first mobile release.
- Notification behavior for permissions while the PWA is backgrounded.
