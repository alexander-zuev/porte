# ACP conformance probe

This probe decides if stock Grok Build can support the LRAS v1 daemon contract.

Each operator adds a new **Pass** section. Do not edit another operator’s pass.

## Status

- `[ ]` Not tested.
- `[ ] BLOCKED` Attempted, but the environment prevented a valid result.
- `[x] PASS` Tested and passed.
- `[x] FAIL` Tested and failed.
- `[x] PARTIAL` Tested, but the contract is incomplete.

## Contracts

### 1. Session lifecycle

**Purpose:** Prove the LRAS host can create and control a Grok session in a selected repository. This enables “New session” from the phone.

- Run `initialize`, authentication, `session/new`, and `session/prompt`.
- Confirm the session persists under `$GROK_HOME`.
- Confirm Grok uses the requested `cwd`.

### 2. Session resume

- Stop the Grok process.
- Start a new process and call `session/load`.
- Confirm transcript replay and prior context.
- Confirm the next prompt continues the same session ID.
- Confirm a TUI open on a different session is untouched.

### 3. Approval round trip

This contract is a release blocker for LRAS v1.

- Force one file edit and one shell command in `ask` mode.
- Confirm ACP sends `session/request_permission`.
- Confirm no side effect occurs before the response.
- Test allow and deny separately.
- Confirm Grok continues after either response.

### 4. Event fidelity

Diagnostic. A gap here is PARTIAL, not Stop.

- Capture every `session/update` discriminator.
- Verify text, reasoning, tool calls, tool results, diffs, and final status.
- Verify stable tool-call IDs and event order.
- Verify replay events do not duplicate live events.

### 5. Control and failure

Diagnostic. A gap here is PARTIAL, not Stop.

- Cancel a running turn with `session/cancel`.
- Kill Grok during a tool call.
- Restart and load the session.
- Confirm no duplicate prompt, orphan process, or hidden side effect.

## Decision rules

- **Go:** §1–§3 pass with the installed Grok Build version.
- **Stop:** `session/load` fails, or ACP does not send approval requests in `ask` mode.
- **Partial:** §4 or §5 fail. Record the gap. Do not start the relay.

The probe saves sanitized ACP messages as NDJSON. Evidence records must not contain credentials, secrets, or unrelated file content.

---

## Pass #1 (Codex)

- [x] PASS — Run `initialize`; Grok `1.0.4` returned ACP protocol version `1`.
- [x] PASS — Authenticate with `cached_token`; Grok returned a successful result.
- [x] PASS — Create a session with `session/new` in the selected workspace. Outside the Codex sandbox, Grok created session `01a00eb1-…` and returned the requested workspace as `currentWorkingDirectory`.
- [ ] Run `session/prompt`.
- [ ] Confirm the session persists under `$GROK_HOME`.
- [ ] Confirm Grok uses the requested `cwd`.

### 2. Session resume

- [ ] Stop the Grok process.
- [ ] Start a new process and call `session/load`.
- [ ] Confirm transcript replay and prior context.
- [ ] Confirm the next prompt continues the same session ID.
- [ ] Confirm a TUI open on a different session is untouched.

### 3. Approval round trip

This contract is a release blocker for LRAS v1.

- [ ] Force one file edit and one shell command in `ask` mode.
- [ ] Confirm ACP sends `session/request_permission`.
- [ ] Confirm no side effect occurs before the response.
- [ ] Test allow and deny separately.
- [ ] Confirm Grok continues after either response.

### 4. Event fidelity

Diagnostic. A gap here is PARTIAL, not Stop.

- [ ] Capture every `session/update` discriminator.
- [ ] Verify text, reasoning, tool calls, tool results, diffs, and final status.
- [ ] Verify stable tool-call IDs and event order.
- [ ] Verify replay events do not duplicate live events.

### 5. Control and failure

Diagnostic. A gap here is PARTIAL, not Stop.

- [ ] Cancel a running turn with `session/cancel`.
- [ ] Kill Grok during a tool call.
- [ ] Restart and load the session.
- [ ] Confirm no duplicate prompt, orphan process, or hidden side effect.

### Probe environment

- Grok Build: `1.0.4` (`d846eb93d94d`, stable).
- Local transport: ACP over `grok agent stdio`.
- Probe workspace: an isolated directory under `/private/tmp`.

---

## Pass #2 (Grok CLI, this agent)

Live `grok agent stdio`. Sessions `01a00eb6-ba35-7ff0-ba5b-a6098935345c` (lifecycle/resume) and `01a00eb8-4301-7e52-8c9b-eb5d51ed56f4` (ask-mode approvals).

### 1. Session lifecycle

- [x] PASS — `initialize`: `protocolVersion=1`, `loadSession=true`.
- [x] PASS — `authenticate` with `cached_token` succeeded.
- [x] PASS — `session/new` created `01a00eb6-…`. Result omitted `currentWorkingDirectory`.
- [x] PASS — `session/prompt` streamed 115 updates (`user_message_chunk`, `agent_thought_chunk`, `agent_message_chunk`, `tool_call`, `tool_call_update`).
- [x] PASS — Session persisted at `~/.grok/sessions/%2Ftmp%2Flras-acp-probe%2Fworkspace/01a00eb6-ba35-7ff0-ba5b-a6098935345c`.
- [x] PASS — Wrote `probe-allow.txt` in `/tmp/lras-acp-probe/workspace`.

### 2. Session resume

- [x] PASS — First process exited before the second spawn.
- [x] PASS — `session/load` on `01a00eb6-…` returned the same session.
- [x] PASS — Load replayed 17 updates.
- [x] PASS — Next prompt used the same session id (`stopReason=end_turn`).
- [ ] BLOCKED — No second TTY. Did not open a Grok TUI.

### 3. Approval round trip

Host `[ui] permission_mode = "always-approve"`. A run with no CLI override sent zero `session/request_permission` and wrote both files. Not ask-mode.

Ask-mode run: `grok --permission-mode default agent stdio`.

- [x] PARTIAL — Forced one file edit and one shell command in ask mode.
- [x] PARTIAL — `session/request_permission` fired for the shell (`echo DENIED-SHELL`, `reject-once`). File edits did not. Grok sent `_x.ai/session_notification` `pending_interaction` / `kind=permission` and did not wait for an ACP reply.
- [x] FAIL — File write is not gated on the ACP reply. `ask-allow.txt` and `ask-deny.txt` were both written.
- [x] PARTIAL — Shell deny worked over ACP. File edit could not be denied over ACP.
- [x] PASS — Grok returned from both turns.

### 4. Event fidelity

Evidence: `/tmp/lras-acp-probe/evidence.ndjson` (928 lines). Counts below are from that file.

`session/update` discriminators this run produced:

| `sessionUpdate`             | Count | Result |
| --------------------------- | ----: | ------ |
| `user_message_chunk`        |    13 | PASS   |
| `agent_thought_chunk`       |   226 | PASS   |
| `agent_message_chunk`       |   503 | PASS   |
| `tool_call`                 |     9 | PASS   |
| `tool_call_update`          |     8 | PASS   |
| `available_commands_update` |    11 | PASS   |
| `session_info_update`       |     1 | PASS   |
| `plan` (ACP spec)           |     0 | FAIL   |
| `usage_update` (ACP spec)   |     0 | FAIL   |

Required payload checks:

| Check                          | Result | Evidence                                                                                                                                     |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Text                           | PASS   | 503 `agent_message_chunk`, content type `text`                                                                                               |
| Reasoning                      | PASS   | 226 `agent_thought_chunk`                                                                                                                    |
| Tool calls                     | PASS   | 9 `tool_call`, 3 distinct `toolCallId`s                                                                                                      |
| Tool results                   | PASS   | `tool_call_update` status `completed` (9) and `in_progress` (2)                                                                              |
| Diffs                          | PASS   | 8 `content[].type=diff` on `tool_call_update`, not a separate `sessionUpdate`                                                                |
| Final status                   | PASS   | `session/prompt` result `stopReason=end_turn` (4 times)                                                                                      |
| Stable tool-call IDs           | PASS   | Same 3 ids on live turns and on `session/load`                                                                                               |
| Live event order               | PASS   | `tool_call` then `tool_call_update` (diff) then `completed` on the same id                                                                   |
| Replay does not duplicate live | FAIL   | `session/load` replayed each of the 3 `toolCallId`s twice (6 `tool_call` events). The next live prompt after load did not re-emit those ids. |

- [x] FAIL — Did not capture every ACP discriminator. `plan` and `usage_update` never arrived. The seven kinds in the table above did.
- [x] PASS — Text, reasoning, tool calls, tool results, diffs, and final status all present in this run.
- [x] PASS — Tool-call IDs were stable. Live order was `tool_call` → update → `completed`.
- [x] FAIL — Replay duplicated `tool_call` events (each id twice on load).

### 5. Control and failure

- [x] PARTIAL — `session/cancel` returned `stopReason=end_turn`, not `cancelled`.
- [x] PASS — Killed Grok during `sleep 30`. `probe-killed.txt` was not written.
- [x] PASS — Loaded `01a00eb6-…` after the mid-turn kill.
- [x] PASS — No leftover probe file. No extra Grok process.

### Decision

Not Go. §1–§2 pass. §3 does not. `session/load` works. File edits are not on stock ACP permission. Daemon must pass `--permission-mode default` or host always-approve hides shell prompts too. §4: `plan`/`usage_update` absent; load replay duplicated each `tool_call`. §5: cancel returned `end_turn`, not `cancelled`. Do not start the relay.

### Probe environment

- Operator: this agent.
- Grok Build: `1.0.4` (`d846eb93d94d`, stable).
- Transport: ACP over `grok agent stdio`.
- Ask-mode override: `grok --permission-mode default agent stdio`.
- Workspaces: `/tmp/lras-acp-probe/workspace`, `/tmp/lras-acp-probe/ask-workspace`.
- Evidence: `/tmp/lras-acp-probe/evidence.ndjson`, `/tmp/lras-acp-probe/results.json`.
- Host config: `[ui] permission_mode = "always-approve"`.
