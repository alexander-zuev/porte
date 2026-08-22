import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from '@web/ui/components/ui/sonner.tsx'
import { TooltipProvider } from '@web/ui/components/ui/tooltip.tsx'

import PostHogProvider from '../lib/analytics/provider'
import TanStackQueryDevtools from '../lib/clients/devtools'

// Side-effect, not `?url`: Start finds it in the build manifest, so it reaches
// static Early Hints and `inlineCss`, which `?url` links are excluded from.
import '../ui/stylesheets/globals.css'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        // `viewport-fit=cover` is what makes the safe-area insets non-zero.
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        title: 'Porte',
      },
    ],
    links: [
      // The emoji is drawn by the reader's own font, so the file stays 3 lines.
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>
          <PostHogProvider>
            {children}
            <Toaster />
            <TanStackDevtools
              config={{
                position: 'bottom-right',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
              ]}
            />
          </PostHogProvider>
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}
