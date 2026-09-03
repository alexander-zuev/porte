# Porte

Porte (French for door) is a remote control for Grok CLI, from your phone.

Grok stays on your machine. The phone reads, prompts, and approves.

https://useporte.dev

## Install

As a Grok plugin — no manual install; Grok runs Porte with each session. Needs Node 22+. The official marketplace listing is not approved yet, so install from this repository:

```sh
grok plugin marketplace add alexander-zuev/porte
grok plugin install porte --trust
```

Once the official listing lands ([xai-org/plugin-marketplace#463](https://github.com/xai-org/plugin-marketplace/pull/463)), the first command becomes unnecessary.

Then type `/remote-control` in Grok and approve on your phone. Undo: `/remote-control unpair`, then `grok plugin uninstall porte` — and if you enabled the instant hook, `npx -y @porte/cli@0.3.1 rc disable-hook` first; plugin uninstall does not remove it.

Optional, instant `/remote-control` — answers in under a second instead of a model turn, at the cost of Grok's "Prompt blocked" framing around the reply: `npx -y @porte/cli@0.3.1 rc enable-hook` (undo with `rc disable-hook`).

Status row in Grok — green `/rc on` while the machine is reachable, yellow while it connects, red with the fix when it cannot. Porte adds it to `~/.grok/config.toml` on the first session, unless you already have a status line of your own, which it leaves alone:

```toml
[ui.status_line]
type = "command"
command = "~/.porte/statusline.sh"
refresh_interval = 2
```

Or hand it to your agent:

> Fetch and execute the instructions from https://useporte.dev/agent-setup/prompt.md to set up Porte on this machine.

## What it does

```
Phone (your account)  →  Porte  →  your paired machine
                                              │
                                         Grok agent
                                              │
                                           local repos
```

Works today:

- Open any Grok conversation on the paired machine, or start one in a known repo
- Read the transcript live: thoughts, tool calls with diffs and read output, Grok's answer
- Prompt, attach files, run slash commands, stop a turn
- Queue a prompt while a turn runs; it sends when the turn ends
- Open uncommitted changes from the pill above the composer; tap a file for its diff
- Allow or deny a permission request from the phone
- Switch the model and its reasoning effort from the composer; mode and context usage shown beside it
- Install as a home-screen app on iOS and Android
- Pair, connect, and disconnect from inside Grok with one `/remote-control` command (Grok plugin)

Not yet:

- Live output of a turn you started in the TUI: the phone shows it once that turn ends
- Grok's own questions to you (`ask_user_question`): the turn waits until you answer in the TUI
- Push notification when Grok needs an approval
- Switching the permission mode from the phone
- More than one paired machine per account

## Safety

Remote Grok is the same Grok you already run: same directory, `AGENTS.md`, rules, hooks, sandbox, and ask/deny. No `--always-approve`. No extra filesystem or network power. Deny on the phone is deny.

Porte stores your account, pairing, and the transcript of conversations you run through it, so the phone can read while the machine is offline. Repos, files, and your grok.com login stay on the machine. [Privacy](https://useporte.dev/privacy).

The CLI stores a Porte bearer credential at `~/.porte/credentials.json` with owner-only file permissions. `/remote-control unpair` revokes the credential and deletes the file.

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
