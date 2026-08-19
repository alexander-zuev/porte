import { RuleTester } from 'oxlint/plugins-dev'

import { noColorOpacityModifiersRule } from './no-color-opacity-modifiers.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const opacityModifier = { messageId: 'opacityModifier' }

tester.run('design-system/no-color-opacity-modifiers', noColorOpacityModifiersRule, {
  valid: [
    'const view = <span className="text-muted-foreground">Muted</span>;',
    'const view = <div className="bg-status-success" />;',
    'const view = <button className="disabled:opacity-50" />;',
  ],
  invalid: [
    {
      code: 'const view = <button className="hover:bg-primary/80" />;',
      errors: [opacityModifier],
    },
    {
      code: 'const view = <span className="text-muted-foreground/50">Muted</span>;',
      errors: [opacityModifier],
    },
    {
      code: 'const variants = cva(`focus-visible:ring-ring/50`);',
      errors: [opacityModifier],
    },
  ],
})
