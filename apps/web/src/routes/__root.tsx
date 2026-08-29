import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ROOT_LINKS, ROOT_META } from '@web/lib/seo.ts'
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
    meta: [...ROOT_META],
    links: [...ROOT_LINKS],
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
