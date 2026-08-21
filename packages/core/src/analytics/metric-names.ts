/**
 * Stable names for operational time series sent to PostHog Metrics.
 * The catalog prevents different names for the same metric.
 */
export const METRICS = {
  D1_DATABASE_SIZE: 'd1.database.size',
} as const

export type MetricName = (typeof METRICS)[keyof typeof METRICS]
