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
2. Sign in at the Grok Anywhere app on your phone (or any browser).
3. Pair that machine to your account.
4. Pick a session, or start a new one in a repo the machine already knows.
5. Read the live transcript. Send the next prompt. Approve or deny tool calls.

Work stays on the host: files, shell, credentials, MCP servers, and skills. The phone sends intent. The host does the work.

If the machine sleeps, remote access stops. This is not a cloud sandbox. Auth, models, and spend stay on the host’s Grok login.

## What you gain

- **Continue a thread from the train.** Resume the session you started at the desk. Same history. Same repo.
- **Start work without opening a laptop lid.** Pick a known repo. Start a new session. Grok writes on that machine.
- **Unblock a run.** Approve a command. Deny a bad one. Send a follow-up. Put the phone away.
- **Leave the TUI alone.** If Grok is already open in a terminal, it stays that way. Remote work does not scrape or hijack the screen.

## Architecture

The app never opens a port on your laptop. The daemon dials out. Your phone talks to the app. The relay joins those two connections for your account only.

```
Phone (your account)  →  Grok Anywhere  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                    local sessions + repos
```

- **Daemon** on the host lists sessions from disk and talks to Grok over ACP (`grok agent stdio`). It resumes or starts sessions. It does not attach to an open TUI.
- **Relay** is a Cloudflare Worker plus one Durable Object per machine. The daemon holds an outbound WebSocket. The phone holds another. The object forwards envelopes. It never reads the host filesystem.
- **App** is an authed PWA. Sign in, see your machines, open a session, stream, approve.

## License

[Apache License 2.0](LICENSE).
