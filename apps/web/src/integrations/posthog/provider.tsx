import { PostHogProvider as BasePostHogProvider } from '@posthog/react'
import { settings } from '@web/lib/env/env.ts'
import posthog from 'posthog-js'
import type { ReactNode } from 'react'

if (!import.meta.env.SSR && settings.posthog.apiKey.length > 0) {
  posthog.init(settings.posthog.apiKey, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    defaults: '2025-11-30',
  })
}

interface PostHogProviderProps {
  children: ReactNode
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
  return <BasePostHogProvider client={posthog}>{children}</BasePostHogProvider>
}
