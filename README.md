# Grok Anywhere

Remote control for **local Grok Build**. Your laptop stays the computer. Your phone is the remote.

Continue the same threads, in the same repos. It does not replace or hijack the TUI. Each account sees only its own machines.

## How it works

1. Run the daemon on the machine where you already use Grok.
2. Sign in on your phone and pair that machine.
3. Open a session — or start a new one in a known repo.
4. Read the transcript. Prompt. Approve or deny.

```
Phone (your account)  →  Grok Anywhere  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                    local sessions + repos
```

The daemon dials out. Nothing listens on your laptop. If the machine sleeps, access stops. Files, spend, and Grok login stay on the host.

## What we handle

Almost nothing.

| ☁️ Us                               | 💻 Your machine           |
| ----------------------------------- | ------------------------- |
| App account + pairing               | `grok.com` login, spend   |
| Session titles (id, cwd, updated)   | Repos, files, transcripts |
| Live relay of prompts and approvals | The Grok process          |

We do not read your disk. We do not get your Grok password. Offline host = nothing to run.

## Safety

Remote Grok is the same Grok you already run.

- Starts in **that project’s directory**
- Inherits your `AGENTS.md`, rules, hooks, sandbox, and ask/deny
- No `--always-approve`. No extra filesystem or network power
- A click on the TUI is still a click on the phone. Deny still denies

## License

[Apache License 2.0](LICENSE).
