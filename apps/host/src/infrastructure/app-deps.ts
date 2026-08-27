import type { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'

/** Everything a handler may touch. Built once by the composition root. */
export type AppDeps = {
  readonly outbox: EventOutbox
}
