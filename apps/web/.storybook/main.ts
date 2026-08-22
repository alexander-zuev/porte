import type { StorybookConfig } from '@storybook/tanstack-react'

const config: StorybookConfig = {
  stories: ['./**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/tanstack-react',
    options: {
      builder: {
        viteConfigPath: '.storybook/vite.config.ts',
      },
    },
  },
  core: {
    disableTelemetry: true,
  },
}

export default config
