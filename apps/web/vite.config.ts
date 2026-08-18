import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(() => {
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

  return {
    resolve: { tsconfigPaths: true },
    build: { sourcemap: Boolean(sentryAuthToken) },
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      devtools(),
      tailwindcss(),
      tanstackStart({
        router: {
          entry: './lib/router/router.tsx',
          generatedRouteTree: './lib/router/routeTree.gen.ts',
        },
      }),
      viteReact(),
      sentryTanstackStart({
        org: 'azcompany',
        project: 'porte',
        authToken: sentryAuthToken,
        silent: !sentryAuthToken,
        telemetry: false,
        tunnelRoute: true,
        sourcemaps: sentryAuthToken
          ? { filesToDeleteAfterUpload: ['./dist/client/**/*.map'] }
          : { disable: 'disable-upload' },
      }),
    ],
  }
})
