# Porte

Porte (French for door) is a remote control for Grok CLI, from your phone.

Your Grok sessions keep running on your laptop; the phone reads, prompts, and approves.

https://useporte.dev

## Install

Hand it to your agent:

> Fetch and execute the instructions from https://useporte.dev/agent-setup/prompt.md to set up Porte on this machine.

Or by hand. Needs Node 22+ and `grok` on your PATH; Porte does not install Grok.

```sh
npm i -g @porte/cli
porte pair   # prints a code: sign in on the phone and enter it
porte up     # keep this running so the phone can reach the machine
```

Undo: `porte unpair`, then `npm rm -g @porte/cli`.

## How it works

1. Run `porte up` on the machine where you already use Grok.
2. Sign in on your phone and pair that machine.
3. Open a conversation — or start a new one in a known repo.
4. Read the transcript. Prompt. Approve or deny.

```
Phone (your account)  →  Porte  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                           local repos
```

## What Porte handles

Porte relays remote actions. Your machine keeps the Grok runtime, repos, and files.

| ☁️ Us                                          | 💻 Your machine         |
| ---------------------------------------------- | ----------------------- |
| App account, pairing, and live relay           | `grok.com` login, spend |
| Conversation list (id, cwd, repo, title)       | Repos, files            |
| Transcript of conversations you run through it | The Grok process        |

Transcripts stay on the relay so the phone can read a conversation while the machine is offline. Details: [Privacy](https://useporte.dev/privacy).

## What works today

- Open any Grok conversation on the paired machine, or start one in a known repo
- Read the transcript live: thoughts, tool calls with diffs and read output, Grok's answer
- Prompt, attach files, run slash commands, stop a turn
- Allow or deny a permission request from the phone
- Model, mode, and context usage shown under the composer
- Install as a home-screen app on iOS and Android

## Not yet

- Grok's own questions to you (`ask_user_question`): the turn waits until you answer in the TUI
- Push notification when Grok needs an approval
- Switching model or mode from the phone
- More than one paired machine per account
- A Grok plugin that pairs and connects with one `/remote-control` command

## Safety

Remote Grok is the same Grok you already run.

- Starts in **that project’s directory**
- Inherits your `AGENTS.md`, rules, hooks, sandbox, and ask/deny
- No `--always-approve`. No extra filesystem or network power
- A click on the TUI is still a click on the phone. Deny still denies

## Development

For people working in this repository. npm copies this README onto `@porte/cli` at pack time.

```sh
pnpm install
pnpm dev                                          # web on :3000
pnpm --filter @porte/cli dev:up                   # local host through the tunnel
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

`.github/workflows/publish-cli.yaml` lints, typechecks, runs unit tests, builds, and publishes with provenance through npm trusted publishing (`pnpm publish --provenance`, no token). A push that leaves the version alone publishes nothing.

### Deploying the web app

Cloudflare Workers Builds is connected to this repository: every push to `main` builds and deploys the web app. Nothing is deployed by hand.

## License

[Apache License 2.0](LICENSE). Hosted service: [Privacy](https://useporte.dev/privacy), [Terms](https://useporte.dev/terms).
