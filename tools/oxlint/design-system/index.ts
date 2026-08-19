import { eslintCompatPlugin } from '@oxlint/plugins'

import { noColorOpacityModifiersRule } from './rules/no-color-opacity-modifiers.ts'
import { noRawColorsRule } from './rules/no-raw-colors.ts'
import { noTypographyOverridesRule } from './rules/no-typography-overrides.ts'
import { preferUiPrimitivesRule } from './rules/prefer-ui-primitives.ts'

/** Oxlint rules that enforce the installed design-system boundaries. */
const designSystemPlugin = eslintCompatPlugin({
  meta: { name: 'design-system' },
  rules: {
    'no-color-opacity-modifiers': noColorOpacityModifiersRule,
    'no-raw-colors': noRawColorsRule,
    'no-typography-overrides': noTypographyOverridesRule,
    'prefer-ui-primitives': preferUiPrimitivesRule,
  },
})

export default designSystemPlugin
