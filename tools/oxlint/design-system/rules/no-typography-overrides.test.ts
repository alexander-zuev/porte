import { RuleTester } from 'oxlint/plugins-dev'

import { noTypographyOverridesRule } from './no-typography-overrides.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
tester.run('design-system/no-typography-overrides', noTypographyOverridesRule, {
  valid: [
    'const view = <h1>Title</h1>;',
    'const view = <p className="text-muted-foreground">Description</p>;',
    'const view = <h1 className="text-display-hero">Title</h1>;',
  ],
  invalid: [
    {
      code: 'const view = <h1 className="text-xl">Title</h1>;',
      errors: [{ messageId: 'override', data: { kind: 'font size' } }],
    },
    {
      code: 'const view = <p className="font-semibold">Text</p>;',
      errors: [{ messageId: 'override', data: { kind: 'font weight' } }],
    },
    {
      code: 'const view = <div className={cn("leading-tight")}>Text</div>;',
      errors: [{ messageId: 'override', data: { kind: 'line height' } }],
    },
    {
      code: 'const view = <p className="tracking-wide">Text</p>;',
      errors: [{ messageId: 'override', data: { kind: 'letter spacing' } }],
    },
    {
      code: 'const view = <p style={{ fontSize: "12px" }}>Text</p>;',
      errors: [{ messageId: 'override', data: { kind: 'font size' } }],
    },
  ],
})
