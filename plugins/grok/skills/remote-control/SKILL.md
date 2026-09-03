---
name: remote-control
description: Run this machine's Grok sessions from your phone via Porte. Pairs the machine, then toggles remote control on or off.
argument-hint: '[on | off | status | status-line [on|off] | unpair]'
disable-model-invocation: true
---

Run the command, print its output. Nothing else.

1. Run `cd ~ && env -u FORCE_COLOR npx -y @porte/cli@0.3.2 rc <words>` in the terminal, where
   `<words>` is everything after `/remote-control`, passed through as is. Allowed:
   nothing, `on`, `off`, `status`, `status-line`, `status-line on`, `status-line off`,
   `unpair`. Anything else: print exactly
   `Unknown option. Use /remote-control [on|off], /remote-control status, /remote-control status-line [on|off], or /remote-control unpair.`
   and stop.
2. Print the command's stdout verbatim, as the whole reply. No commentary.
