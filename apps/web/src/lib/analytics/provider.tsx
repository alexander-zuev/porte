import { PostHogProvider as BasePostHogProvider } from '@posthog/react'
import { settings } from '@web/lib/env/env.ts'
import posthog from 'posthog-js'
import type { ReactNode } from 'react'

if (!import.meta.env.SSR && settings.posthog.apiKey.length > 0) {
  posthog.init(settings.posthog.apiKey, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    defaults: '2026-08-29',
    // Off until PostHog's web-vitals crash on soft navigations is fixed (posthog-js 1.422.5).
    capture_performance: { web_vitals: false },
  })
}

interface PostHogProviderProps {
  children: ReactNode
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
  return <BasePostHogProvider client={posthog}>{children}</BasePostHogProvider>
}
