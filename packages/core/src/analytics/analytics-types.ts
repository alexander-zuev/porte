import type { PostHog } from 'posthog-node'

import type { UserId } from '../identity/identity.ts'
import type { MetricName } from './metric-names.ts'

/** Hands a promise to the runtime so a Worker outlives the response it sent. */
export type WaitUntil = (promise: Promise<unknown>) => void

/** Read from the client, so these cannot drift from the SDK they are passed to. */
export type IdentifyProperties = Parameters<PostHog['identify']>[0]['properties']
export type CaptureMessage = Parameters<PostHog['captureImmediate']>[0]

export type PostHogAnalyticsInput = {
  apiKey: string
  environment: string
  source: string
  waitUntil: WaitUntil
}

/**
 * Who one event is recorded against.
 *
 * A person is always an account. Only the anonymous branch may carry a loose
 * id, and it is the branch that suppresses the profile, so neither fact can be
 * set without the other.
 */
export type CaptureTarget =
  | { profile: 'person'; userId: UserId }
  | { profile: 'anonymous'; distinctId: string }

export type MetricAttributeValue = string | number | boolean
export type MetricAttributes = Readonly<Record<string, MetricAttributeValue>>

export interface MetricOptions {
  attributes?: MetricAttributes
  unit?: string
}

/**
 * Records operational time series without exposing the PostHog SDK.
 * Applications depend on this interface instead of the external client.
 */
export interface MetricsService {
  count(name: MetricName, value?: number, options?: MetricOptions): void
  gauge(name: MetricName, value: number, options?: MetricOptions): void
  histogram(name: MetricName, value: number, options?: MetricOptions): void
}

/**
 * What the application may report, without naming who receives it.
 *
 * Which implementation exists is a composition decision, so nothing below the
 * root ever asks whether analytics is on.
 */
export interface AnalyticsService extends MetricsService {
  identify(userId: UserId, properties?: IdentifyProperties): void
  alias(userId: UserId, previousUserId: UserId): void
  track(event: AnalyticsEventInput<string, object>, userId: UserId): void
  /** The one distinct id that is not a user: an attempt key, minting no profile. */
  trackAnonymous(event: AnalyticsEventInput<string, object>, distinctId: string): void
}

export interface BaseProperties {
  /** Platform-wide transport tag, stamped by the layer (client super-property / server service). */
  _source: 'web' | 'worker'
}

/**
 * Full analytics event with _source (after service layer adds it)
 */
export interface AnalyticsEvent<TName extends string, TProperties extends object> {
  name: TName
  properties: TProperties & BaseProperties
}

/**
 * Analytics event input (before _source is added by service layer)
 * Factory functions return this type.
 */
export interface AnalyticsEventInput<TName extends string, TProperties extends object> {
  name: TName
  properties: TProperties
}

/**
 * Helper type to extract properties without _source for factory functions
 */
export type EventProperties<T extends AnalyticsEvent<string, object>> = Omit<
  T['properties'],
  keyof BaseProperties
>
