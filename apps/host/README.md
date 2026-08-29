# @porte/cli

Run your local Grok sessions from your phone. This is the daemon that pairs a Mac with [useporte.dev](https://useporte.dev); Grok, your repos, and every transcript stay on the Mac.

## Install

```sh
npm i -g @porte/cli
```

Needs Node 22 or newer, and the `grok` CLI on the path and signed in.

## Use

```sh
porte pair   # link this Mac to your account: copy the code, approve it in the browser
porte up     # connect, so the phone can reach it
porte unpair # end the pairing
```

## What it does not do

Porte adds no permissions. Remote Grok starts in the project's directory and inherits your `AGENTS.md`, hooks, sandbox, and ask/deny rules. Deny on the phone is deny on the Mac.

Source and issues: [github.com/alexander-zuev/porte](https://github.com/alexander-zuev/porte). Apache-2.0.
