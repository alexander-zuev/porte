import { RuleTester } from 'oxlint/plugins-dev'

import { noRawColorsRule } from './no-raw-colors.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const rawColor = { messageId: 'rawColor' }

tester.run('design-system/no-raw-colors', noRawColorsRule, {
  valid: [
    'const view = <span className="text-status-success">Complete</span>;',
    'const view = <div className={cn("bg-muted", active && "text-foreground")} />;',
    'const color = "status-warning";',
  ],
  invalid: [
    {
      code: 'const view = <span className="text-green-600">Complete</span>;',
      errors: [rawColor],
    },
    {
      code: 'const variants = cva("bg-black/10");',
      errors: [rawColor],
    },
    {
      code: 'const view = <div style={{ color: "#16a34a" }} />;',
      errors: [rawColor],
    },
    {
      code: 'const view = <div className={`border-red-500 ${active ? "bg-muted" : ""}`} />;',
      errors: [rawColor],
    },
  ],
})
