import type { AnyEvent } from '@host/domain/messages/base.ts'

/**
 * In-memory outbox. Repositories push the events an aggregate raised on `save`;
 * the message bus drains it after every handler, so events run after the writes.
 */
export class EventOutbox {
  private pending: AnyEvent[] = []

  push(events: readonly AnyEvent[]): void {
    this.pending.push(...events)
  }

  /** Every event pushed since the last drain, in push order. */
  drain(): readonly AnyEvent[] {
    const drained = this.pending
    this.pending = []
    return drained
  }
}
