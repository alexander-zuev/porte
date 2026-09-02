---
name: remote-control
description: Run this machine's Grok sessions from your phone via Porte. Pairs the machine, then toggles remote control on or off.
argument-hint: '[status | unpair]'
disable-model-invocation: true
---

Run the command, print its output. Nothing else.

1. Run `npx -y @porte/cli@0.2.7 rc <verb>` in the terminal. The verb is the first
   word after `/remote-control`: none → `toggle`, `status` → `status`,
   `unpair` → `unpair`. Any other word: print exactly
   `Unknown option. Use /remote-control, /remote-control status, or /remote-control unpair.`
   and stop.
2. Print the command's stdout verbatim, as the whole reply. No commentary.
