import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview, ReactRenderer } from '@storybook/tanstack-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import '../src/ui/stylesheets/globals.css'
import { TooltipProvider } from '@web/ui/components/ui/tooltip.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    a11y: {
      // `region` asks every node to sit in a landmark. Base UI renders overlays
      // in a portal outside one by design, so the rule reports the library
      // rather than the story. Storybook turns it off for the same reason.
      config: { rules: [{ id: 'region', enabled: false }] },
      test: 'error',
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName<ReactRenderer>({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'dark',
    }),
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </QueryClientProvider>
    ),
  ],
}

export default preview
