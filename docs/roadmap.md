# Roadmap

Goal: make Porte the best remote control for local Grok sessions before xAI ships
its own client. Target is the plain browser — no app, no feature may require an
install. Web Push works uninstalled everywhere except iOS Safari, where
add-to-home-screen is an optional opt-in for pings, never a prerequisite.
Every item ends in a public demo (≤60s vertical video) and a share link.

Grounding: Claude Code docs (remote-control, web, mobile, sessions) and Codex docs
(remote, cloud, code-review, notifications), read 2026-08-31. Both products
converge on the same core remote loop: steer mid-turn, diff pane, approvals,
share. Those are table stakes. One verified edge: Claude's remote cannot
interrupt a running turn from the device — Porte can stop a turn today.

## Stack rank (impact × wow)

### 1. Never-blocked composer — shipped

The composer accepts a message while Grok runs. The relay queues it and
sends it when the turn ends. Send now, reorder, and remove live in the
queue sheet.

### 2. Changes pane — shipped

The pill above the composer shows uncommitted files. A tap opens the sheet:
each file is one row with +/− counts; a second tap opens that file's diff.

### 3. `@` file select in the composer

`@` in the composer opens a search over the conversation's workspace, the way
a CLI file picker works. Pick a file; the prompt carries it as a
`resource-link`. Device attachments stay on `+`; this is the machine's tree.

Reuse `ComposerCommandSuggestions` (cmdk). The host answers a file search
(`git ls-files` plus the query). No file list rides on live state.

Proof: type `@span-d` on the phone, pick `span-diff.ts`, send; Grok's next
turn reads that path.

### 4. Read-only share links

A conversation can be shared as a public read-only transcript URL. The
transcript is the landing page: every demo post ends with a live link.

Proof: an incognito browser opens the link and scrolls the full transcript;
composer, permissions, and machine identity are absent.

### 5. Mission control

Each conversation row shows live state instead of a spinner: current activity
("Running `pnpm test` · 34s"), "Needs permission", or last outcome
("Finished +214 −80"). Unseen work is grouped above seen work.

Proof: with three conversations in different states, the list tells them apart
without opening any of them.

### 6. Outcome cards

Commit and PR URLs in tool output render as link cards. One composer action
sends a canned "commit and open a PR" prompt.

Proof: a turn that pushes a PR ends with a tappable card that opens GitHub.

### 7. Model and effort from the phone — shipped

Phone and desktop pickers write `conversation.model.set`. Grok takes the pair
on `session/set_model`.

### 8. Notifications

Web Push for permission requests and turn completion, sent only when no client
watches the conversation. Works uninstalled on desktop browsers and Android
Chrome; an iPhone gets pings after an optional add-to-home-screen. Pieces:
service worker push handler, one-gesture subscribe, subscriptions in D1, send
from the relay DO (VAPID + RFC 8291 via a WebCrypto lib). Tab-title badge
`(1) Porte` + favicon dot ship alongside as the in-tab signal.

Proof: with the tab closed on desktop, a permission request raises an OS
notification that opens the conversation; on a phone with the tab in the
background, the title badge updates within a second.

## Parked

- Voice input in the composer (scoped 2026-08-31: MediaRecorder → server fn →
  Workers AI `whisper-large-v3-turbo`). Input polish, not a demo.
- Photo attachment demo ("photograph a sketch, Grok builds it") — attachments
  already ship; this is a demo script, not a build item.
- Fleet view (several machines side by side) — demo before feature; needs two
  paired machines only.
