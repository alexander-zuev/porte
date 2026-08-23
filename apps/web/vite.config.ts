import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import agents from 'agents/vite'
import { defineConfig } from 'vite'

/** Named tunnel, so the dev URL survives restarts and OAuth callbacks stay registered. */
const TUNNEL_NAME = 'porte-dev'

export default defineConfig(() => {
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

  return {
    resolve: { tsconfigPaths: true },
    build: { sourcemap: Boolean(sentryAuthToken) },
    // Vite rejects unknown Host headers, so the tunnel domains need naming.
    server: { allowedHosts: ['.trycloudflare.com', '.useporte.dev'] },
    preview: { allowedHosts: ['.trycloudflare.com', '.useporte.dev'] },
    plugins: [
      agents(),
      cloudflare({
        viteEnvironment: { name: 'ssr' },
        tunnel: { name: TUNNEL_NAME, autoStart: true },
      }),
      devtools(),
      tailwindcss(),
      tanstackStart({
        router: {
          entry: './lib/router/router.tsx',
          generatedRouteTree: './lib/router/routeTree.gen.ts',
        },
        // Embed the stylesheet in the SSR HTML, so first paint costs no round trip.
        server: { build: { inlineCss: true } },
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
