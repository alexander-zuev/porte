# Porte

Porte (French for door) is a remote control for Grok CLI, from your phone.

Grok stays on your machine. The phone reads, prompts, and approves.

https://useporte.dev

## Install

Paste this into any agent on the machine:

> Fetch and execute the instructions from https://useporte.dev/agent-setup/prompt.md to set up Porte on this machine.

Or by hand (Node 22+):

```sh
grok plugin marketplace add alexander-zuev/porte
grok plugin install porte --trust
```

Then, in a new Grok session:

- `/remote-control` prints a link. Open it on your phone and approve. The machine connects on its own and stays connected across sessions.
- `/remote-control` again turns remote control off; once more turns it on. `/remote-control on` and `off` say it explicitly.
- `/remote-control status` shows the state and the URL.
- `/remote-control unpair` removes the machine from your account.

The `/rc` row at the bottom of Grok shows the same: green when reachable, red with the fix when not. `/remote-control status-line off` hides it, `on` brings it back.

Instant `/remote-control`, no model turn: `npx -y @porte/cli@0.3.3 rc enable-hook`.

## Update

```sh
grok plugin marketplace update porte && grok plugin update porte
```

Then start a new Grok session.

## Features

```
Phone (your account)  →  Porte  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                           local repos
```

- Open any Grok conversation on the machine, or start one in a known repo
- Read the transcript live, also for turns you started in the terminal: thoughts, tool calls with diffs, the answer
- Prompt, attach files, run slash commands, stop a turn, queue a prompt while a turn runs
- Allow or deny a permission request; the terminal sees the answer
- Switch the model and its reasoning effort; see the mode and context usage
- Open uncommitted changes and read a file's diff

## Planned

- `@file` mentions in the composer
- Push notification when Grok needs an approval
- Grok's own questions to you (`ask_user_question`); today the turn waits for the terminal
- Switching the permission mode from the phone

## Safety

Remote Grok is the same Grok you already run, with the same directory, `AGENTS.md`, hooks, sandbox, and ask/deny. Nothing is auto-approved. Repos, files, and your grok.com login stay on the machine. Porte stores your account, the pairing, and the transcripts you open, so the phone can read while the machine is offline ([Privacy](https://useporte.dev/privacy)). The pairing credential is `~/.porte/credentials.json`, readable by you only; `/remote-control unpair` revokes and deletes it.

## Development

For people working in this repository. npm copies this README onto `@porte/cli` at pack time.

The CLI keeps `porte pair` and `porte up` as internal commands for development and debugging; the user path is the Grok plugin above.

```sh
pnpm install
pnpm dev                                          # web on :3000
pnpm --filter @porte/cli dev:up                   # local host through the tunnel
pnpm turbo run lint typecheck test:unit test:integration
pnpm --filter @porte/web test:design              # Playwright pictures; Mac only, run before a commit
```

Cloudflare types are generated (`worker-configuration.d.ts`, gitignored). Turbo runs `cf-typegen` before lint, typecheck, tests, and build.

### Releasing the CLI

`apps/host` publishes as `@porte/cli`. A release is a version bump on `main`, made only through the release script — it rewrites the package version, `LATEST_CLI_VERSION` in core, the plugin version, and every `@porte/cli@` pin together:

```sh
pnpm release:cli patch   # or minor | major
git commit -am "release(cli): x.y.z" && git push
```

`publish-cli.yaml` refuses to publish when any version fact disagrees (`release:cli check`), then lints, tests, builds, and publishes with provenance through npm trusted publishing (no token). A version already on npm is skipped.

## License

[Apache License 2.0](LICENSE). Hosted service: [Privacy](https://useporte.dev/privacy), [Terms](https://useporte.dev/terms).
