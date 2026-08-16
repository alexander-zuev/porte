# Grok Anywhere

Your Grok sessions live on your machine. Your phone now reaches them.

Leave the desk. Grok keeps working in the same repos, on the same threads. Open the app. Steer. Approve. Start the next turn.

## What it is

Grok Anywhere is a remote control for **local Grok Build**.

It does not replace the TUI. It does not take over a terminal that is already open. It continues the conversations that already exist on disk, and it starts new ones in the repos you already use.

The computer stays the computer. The phone is the remote.

Each person signs in to their own account and pairs their own machines. You only see your sessions.

## How it works

1. Run the daemon on the machine where you already use Grok.
2. Sign in on your phone (or any browser) and pair that machine.
3. Pick a session, or start a new one in a repo the machine already knows.
4. Read the live transcript. Send the next prompt. Approve or deny tool calls.

You continue a desk thread from the train. You unblock a run without opening the lid. If Grok is already open in a terminal, it stays that way.

The laptop never accepts inbound connections. The daemon dials out. The phone talks to the app. The relay joins those two sockets for your account only.

```
Phone (your account)  →  Grok Anywhere  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                    local sessions + repos
```

Work stays on the host: files, shell, credentials, MCP servers, and skills. The phone sends intent. The host does the work. If the machine sleeps, remote access stops. This is not a cloud sandbox.

### What we handle

Almost nothing that matters.

| On our side                                         | On your machine                        |
| --------------------------------------------------- | -------------------------------------- |
| Your app account                                    | `grok.com` login (`~/.grok/auth.json`) |
| Which machines you paired                           | Repos, files, session transcripts      |
| Session list metadata (id, title, cwd, updated)     | Models, spend, MCP, skills             |
| Live relay of prompts, stream events, and approvals | The Grok process itself                |

We do not read your disk. We do not get your Grok password. We are not the source of truth for a conversation. If the host is offline, there is nothing to run.

### Safety

Remote Grok is the same Grok you already run.

It starts in that session’s project directory. It inherits your `AGENTS.md`, rules, hooks, sandbox, and ask/deny settings. We do not pass `--always-approve`. We do not grant extra filesystem or network power.

A tool call that needs a click on the TUI needs a click on the phone. Deny still denies.

## License

[Apache License 2.0](LICENSE).
