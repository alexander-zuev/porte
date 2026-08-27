import type { DomainEvent } from '@host/domain/messages/types.ts'

/**
 * Base for aggregates: identity, raised events, and the shape the repository stores.
 * `id` keeps the branded type from `TData` (`ConversationId`, Grok's session id);
 * the host mints no aggregate id itself.
 */
export abstract class Entity<TData extends { readonly id: string }> {
  private events: DomainEvent[] = []

  abstract readonly id: TData['id']

  protected addEvent(event: DomainEvent): void {
    this.events.push(event)
  }

  collectEvents(): readonly DomainEvent[] {
    return [...this.events]
  }

  clearEvents(): void {
    this.events = []
  }

  /** Plain data for the repository. */
  abstract toPlainObject(): TData
}
