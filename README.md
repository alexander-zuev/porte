# Porte

Porte - means door in French - is a secure remote interface for your local Grok conversations.

Manage the same Grok threads and repos from your phone while they continue to run on your laptop. Porte does not replace the TUI, and each account can access only its own machines.

## How it works

1. Run the daemon on the machine where you already use Grok.
2. Sign in on your phone and pair that machine.
3. Open a conversation — or start a new one in a known repo.
4. Read the transcript. Prompt. Approve or deny.

```
Phone (your account)  →  Porte  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                    local conversations + repos
```

## What Porte handles

Porte relays remote actions while your machine keeps the Grok runtime and all local data.

| ☁️ Us                                  | 💻 Your machine           |
| -------------------------------------- | ------------------------- |
| App account + pairing                  | `grok.com` login, spend   |
| Conversation titles (id, cwd, updated) | Repos, files, transcripts |
| Live relay of prompts and approvals    | The Grok process          |

## Safety

Remote Grok is the same Grok you already run.

- Starts in **that project’s directory**
- Inherits your `AGENTS.md`, rules, hooks, sandbox, and ask/deny
- No `--always-approve`. No extra filesystem or network power
- A click on the TUI is still a click on the phone. Deny still denies

## License

[Apache License 2.0](LICENSE).
