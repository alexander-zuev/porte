import { describe, it } from 'vitest'

/**
 * The four seams the spikes could not settle by reading (plan §10). Each runs
 * against the ConversationAgent facet with `runInDurableObject`; the names are
 * final, the bodies arrive with step 3.
 */
describe('ConversationAgent through its facet', () => {
  it.todo('keeps the user row with its browser id from chat-request through turn.finished (F12)')

  it.todo('survives a facet hibernation between two Host requests without HostOfflineError (F13)')

  it.todo('leaves exactly one assistant row when a snapshot lands during a stream')

  it.todo('holds one full assistant row after a restart mid-turn followed by turn.finished')
})
