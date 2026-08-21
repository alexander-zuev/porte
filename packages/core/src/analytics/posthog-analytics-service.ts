import { PostHog } from 'posthog-node'

import { MissingConfigurationError } from '../errors/configuration.errors.ts'
import type { UserId } from '../identity/identity.ts'
import type {
  AnalyticsEventInput,
  AnalyticsService,
  CaptureTarget,
  MetricsService,
  IdentifyProperties,
  MetricOptions,
  PostHogAnalyticsInput,
  WaitUntil,
} from './analytics-types.ts'
import type { MetricName } from './metric-names.ts'

/** PostHog US Cloud ingest endpoint. */
const POSTHOG_INGEST_URL = 'https://us.i.posthog.com'

/** Sends to PostHog. A run that must reach nobody uses `NULL_ANALYTICS` instead. */
export class PostHogAnalytics implements AnalyticsService, MetricsService {
  private constructor(
    private readonly client: PostHog,
    private readonly waitUntil: WaitUntil,
  ) {}

  /** Build the client the deployment configured, or refuse to start without a key. */
  static create(input: PostHogAnalyticsInput): PostHogAnalytics {
    const apiKey = input.apiKey.trim()
    // The deployment guarantees the secret exists, not that it says anything.
    if (!apiKey) throw new MissingConfigurationError('POSTHOG_API_KEY')

    // Serverless guidance: send each event, and never wait on a timer.
    // https://posthog.com/docs/libraries/node#short-lived-processes-like-serverless-environments
    const client = new PostHog(apiKey, {
      host: POSTHOG_INGEST_URL,
      flushAt: 1,
      flushInterval: 0,
      metrics: { environment: input.environment, serviceName: input.source },
    })
    void client.register({ environment: input.environment, source: input.source })
    return new PostHogAnalytics(client, input.waitUntil)
  }

  /** Attach traits to the person behind one account. */
  identify(userId: UserId, properties?: IdentifyProperties): void {
    this.client.identify({ distinctId: userId, properties })
  }

  /**
   * Attribute everything on `previousUserId` to `userId`.
   *
   * Irreversible, and PostHog refuses a second merge of the same previous id.
   * https://posthog.com/docs/product-analytics/identify#alias-assigning-multiple-distinct-ids-to-the-same-user
   */
  alias(userId: UserId, previousUserId: UserId): void {
    this.waitUntil(this.client.aliasImmediate({ distinctId: userId, alias: previousUserId }))
  }

  /** Record one event against the account that caused it. */
  track(event: AnalyticsEventInput<string, object>, userId: UserId): void {
    this.capture(event, { profile: 'person', userId })
  }

  /** For a distinctId that is an attempt key rather than a person: no profile is minted. */
  trackAnonymous(event: AnalyticsEventInput<string, object>, distinctId: string): void {
    this.capture(event, { profile: 'anonymous', distinctId })
  }

  /** Add to a running total, such as how many times something happened. */
  count(name: MetricName, value = 1, options?: MetricOptions): void {
    this.client.metrics.count(name, value, options)
    this.flushMetrics()
  }

  /** Record what a moving value is right now, such as a size or a queue depth. */
  gauge(name: MetricName, value: number, options?: MetricOptions): void {
    this.client.metrics.gauge(name, value, options)
    this.flushMetrics()
  }

  /** Record one observation, so its distribution can be read later. */
  histogram(name: MetricName, value: number, options?: MetricOptions): void {
    this.client.metrics.histogram(name, value, options)
    this.flushMetrics()
  }

  /** One send. Who it is for and whether it mints a profile are decided together. */
  private capture(event: AnalyticsEventInput<string, object>, target: CaptureTarget): void {
    const properties = { ...event.properties }

    if (target.profile === 'person') {
      this.waitUntil(
        this.client.captureImmediate({ distinctId: target.userId, event: event.name, properties }),
      )
      return
    }

    this.waitUntil(
      this.client.captureImmediate({
        distinctId: target.distinctId,
        event: event.name,
        properties: { ...properties, $process_person_profile: false },
      }),
    )
  }

  /** Metrics are recorded synchronously, so the send is a separate promise. */
  private flushMetrics(): void {
    this.waitUntil(this.client.metrics.flush())
  }
}

export const NULL_METRICS_SERVICE: MetricsService = {
  count: () => {},
  gauge: () => {},
  histogram: () => {},
}

/** Analytics for a run that must reach nobody. Tests get this instead of a key. */
export const NULL_ANALYTICS: AnalyticsService = {
  ...NULL_METRICS_SERVICE,
  identify: () => {},
  alias: () => {},
  track: () => {},
  trackAnonymous: () => {},
}
