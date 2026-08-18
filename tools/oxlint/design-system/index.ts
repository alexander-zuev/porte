import { eslintCompatPlugin } from '@oxlint/plugins'

import { noTypographyOverridesRule } from './rules/no-typography-overrides.ts'
import { preferUiPrimitivesRule } from './rules/prefer-ui-primitives.ts'

/** Oxlint rules that enforce the installed design-system boundaries. */
const designSystemPlugin = eslintCompatPlugin({
  meta: { name: 'design-system' },
  rules: {
    'no-typography-overrides': noTypographyOverridesRule,
    'prefer-ui-primitives': preferUiPrimitivesRule,
  },
})

export default designSystemPlugin
