import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  dts: false,
  clean: true,
  deps: {
    // Bundled, so the published package needs neither the workspace nor these two on install.
    alwaysBundle: ['better-result', 'zod', /^@porte\/core(\/|$)/],
  },
})
