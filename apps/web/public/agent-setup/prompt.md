# Set up Porte on this machine

Porte runs your local Grok sessions from your phone. A small daemon on the machine pairs with https://useporte.dev; Grok, the repos, and every transcript stay on the machine. Source: https://github.com/alexander-zuev/porte (Apache-2.0).

You are an AI agent running on the person's machine. Follow these steps in order. Report each result in one line.

## Rules

- Do not use `sudo`. If a step needs it, stop and say why.
- Do not change Grok's own configuration, login, or files.
- Pairing needs the person: when you hand over, wait.

## 1. Check the machine

Run:

```sh
node --version
grok --version
```

- Node must be 22 or newer. If it is older or missing, stop and tell the person to install Node 22+ from https://nodejs.org.
- `grok` must be on the path. If it is missing, stop and point the person to the Grok CLI install. Porte does not install Grok.

## 2. Install the Grok plugin

This is the whole install. Grok runs Porte with each session; there is no daemon to manage.

```sh
grok plugin install porte --trust
```

If Grok cannot find `porte` (the official listing may still be propagating), run `grok plugin marketplace add alexander-zuev/porte` first, then retry. If `grok plugin` is not available at all, stop and tell the person to update Grok.

## 3. Hand over

Tell the person: open a new Grok session and type `/remote-control`. It prints a link; they open it on their phone, sign in, and approve. The machine connects on its own once they do.

## Done

Tell the person: remote control is on. Every Grok session on this machine can now be viewed, controlled, and continued from https://useporte.dev. Open it on your phone, pick this machine, and you are in your sessions. `/remote-control` in Grok turns remote control off and on; `/remote-control unpair` undoes the pairing; `grok plugin uninstall porte` removes the plugin.
