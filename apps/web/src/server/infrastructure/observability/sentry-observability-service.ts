import * as Sentry from '@sentry/cloudflare'

/** Names who a report is about, without the reporter knowing which tool receives it. */
export interface ObservabilityService {
  setUser(user: { id: string }): void
  withIsolationScope<T>(
    callback: (scope: { setUser(user: { id: string }): void }) => T | Promise<T>,
  ): Promise<T>
}

export class SentryObservabilityService implements ObservabilityService {
  setUser(user: { id: string }): void {
    Sentry.setUser(user)
  }

  async withIsolationScope<T>(
    callback: (scope: { setUser(user: { id: string }): void }) => T | Promise<T>,
  ): Promise<T> {
    return await Sentry.withIsolationScope(callback)
  }
}
