/** Public facts about Porte shared by marketing and onboarding surfaces. */
export const REPOSITORY_URL = 'https://github.com/alexander-zuev/porte'

/**
 * Command that installs Porte on the machine that runs Grok.
 *
 * Installed rather than run through `npx`: this is a daemon someone starts most
 * days, and every other command we print assumes `porte` is on the path.
 */
export const INSTALL_COMMAND = 'npm i -g porte'

/** Command that starts pairing on the machine that runs Grok. */
export const PAIR_COMMAND = 'porte pair'

/** Command that connects a paired Mac, so the browser can reach it. */
export const UP_COMMAND = 'porte up'

/** Date the Terms and Privacy pages last changed. */
export const LEGAL_UPDATED = '19 August 2026'
