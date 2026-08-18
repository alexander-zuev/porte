import { RuleTester } from 'oxlint/plugins-dev'

import { preferUiPrimitivesRule } from './prefer-ui-primitives.ts'

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })

tester.run('design-system/prefer-ui-primitives', preferUiPrimitivesRule, {
  valid: ['const view = <Button />;', 'const view = <form />;', 'const view = <a />;'],
  invalid: [
    {
      code: 'const view = <button />;',
      errors: [{ messageId: 'primitive', data: { element: 'button', component: 'Button' } }],
    },
    {
      code: 'const view = <input />;',
      errors: [{ messageId: 'primitive', data: { element: 'input', component: 'Input' } }],
    },
    {
      code: 'const view = <textarea />;',
      errors: [{ messageId: 'primitive', data: { element: 'textarea', component: 'Textarea' } }],
    },
    {
      code: 'const view = <select />;',
      errors: [{ messageId: 'primitive', data: { element: 'select', component: 'Select' } }],
    },
    {
      code: 'const view = <label />;',
      errors: [{ messageId: 'primitive', data: { element: 'label', component: 'Label' } }],
    },
    {
      code: 'const view = <dialog />;',
      errors: [{ messageId: 'primitive', data: { element: 'dialog', component: 'Dialog' } }],
    },
    {
      code: 'const view = <details />;',
      errors: [{ messageId: 'primitive', data: { element: 'details', component: 'Collapsible' } }],
    },
    {
      code: 'const view = <summary />;',
      errors: [
        {
          messageId: 'primitive',
          data: { element: 'summary', component: 'CollapsibleTrigger' },
        },
      ],
    },
    {
      code: 'const view = <fieldset />;',
      errors: [{ messageId: 'primitive', data: { element: 'fieldset', component: 'FieldSet' } }],
    },
    {
      code: 'const view = <legend />;',
      errors: [{ messageId: 'primitive', data: { element: 'legend', component: 'FieldLegend' } }],
    },
    {
      code: 'const view = <hr />;',
      errors: [{ messageId: 'primitive', data: { element: 'hr', component: 'Separator' } }],
    },
  ],
})
