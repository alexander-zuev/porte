/** Public facts about Porte shared by marketing and onboarding surfaces. */
export const REPOSITORY_URL = 'https://github.com/alexander-zuev/porte'

/** Installs the Porte plugin from Grok's official marketplace, on the machine that runs Grok. */
export const PLUGIN_INSTALL_COMMAND = 'grok plugin install porte --trust'

/** Typed inside Grok: pairs the machine, then toggles remote control. */
export const REMOTE_CONTROL_COMMAND = '/remote-control'

/** One page of setup steps written for an AI agent on the machine. Served as a static file. */
export const AGENT_PROMPT_URL = 'https://useporte.dev/agent-setup/prompt.md'

/** What the landing copies for the person to paste into their agent. */
export const AGENT_PROMPT = `Fetch and execute the instructions from ${AGENT_PROMPT_URL} to set up Porte on this machine.`

/** Date the Terms and Privacy pages last changed. */
export const LEGAL_UPDATED = '29 August 2026'
