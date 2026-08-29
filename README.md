# Porte

Porte - means door in French - is a secure remote interface for your local Grok conversations.

Manage the same Grok threads and repos from your phone while they continue to run on your laptop. Porte does not replace the TUI, and each account can access only its own machines.

## Install

```sh
npm i -g @porte/cli
porte pair
```

Or hand it to your agent: `Fetch and execute the instructions from https://useporte.dev/agent-setup/prompt.md to set up Porte on this machine.`

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

## Development

```sh
pnpm install
pnpm dev                                          # web on :3000; `pnpm dev up` connects a local host through the tunnel
pnpm turbo run lint typecheck test:unit test:integration
pnpm --filter @porte/web test:design              # Playwright pictures; Mac only, run before a commit
```

Cloudflare types are generated (`worker-configuration.d.ts`, gitignored). Turbo runs `cf-typegen` before lint, typecheck, tests, and build, so a fresh checkout sees what a dev does.

### Releasing the CLI

`apps/host` publishes as `@porte/cli`. A release is a version bump on `main`:

```sh
pnpm --filter @porte/cli version patch --no-git-checks   # bumps apps/host/package.json only
git commit -am "release(cli): x.y.z" && git push
```

`.github/workflows/publish-cli.yaml` lints, typechecks, tests, builds, and publishes with provenance through npm trusted publishing (`pnpm publish --provenance`, no token). A push that leaves the version alone publishes nothing. The npm page shows this README, copied at pack time.

### Deploying the web app

Cloudflare Workers Builds is connected to this repository: every push to `main` builds and deploys the web app. Nothing is deployed by hand.

## License

[Apache License 2.0](LICENSE).
