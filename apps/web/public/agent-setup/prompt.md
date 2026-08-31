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
grok plugin marketplace add alexander-zuev/porte
grok plugin install porte --trust
```

If both commands succeed, go to step 3. If `grok plugin` is not available, use the manual install at the end instead.

## 3. Hand over

Tell the person: open a new Grok session and type `/remote-control`. It prints a link; they open it on their phone, sign in, and approve. The machine connects on its own once they do.

## Done

Tell the person: open https://useporte.dev on the phone, pick this machine, and open a conversation. `/remote-control` in Grok turns remote control off and on; `/remote-control unpair` undoes the pairing. To remove the plugin: `grok plugin uninstall porte`.

## Manual install (fallback)

Only when the Grok plugin route is not available.

```sh
npm i -g @porte/cli
porte --version
```

If `npm i -g` fails with a permissions error, do not retry with `sudo`. Tell the person, and suggest a Node version manager (fnm, nvm, volta) that owns the global folder.

Pair the machine:

```sh
porte pair
```

It prints a short code and a URL, then waits. The code expires in a few minutes. Show the person the code and the URL, then wait. They open the URL on their phone, sign in, and enter the code. `porte pair` reports success on its own when they do. If it reports that the code expired, run `porte pair` again and show the new code.

Connect:

```sh
porte up
```

This keeps running. It is what the phone talks to; the person starts it whenever they want the machine reachable. To undo everything: `porte unpair`, then `npm rm -g @porte/cli`.
