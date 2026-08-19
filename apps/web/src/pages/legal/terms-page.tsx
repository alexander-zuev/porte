import { LEGAL_UPDATED, REPOSITORY_URL } from '#/lib/product.ts'

import { LegalPage, LegalSection } from './legal-page.tsx'

/** Terms for the hosted Porte relay. The software itself is Apache-2.0. */
export function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={LEGAL_UPDATED}>
      <LegalSection heading="What Porte is">
        <p>
          Porte connects your phone to a Mac you control, so you can read and steer Grok sessions
          that run on that Mac. The Porte source code is open under the Apache License 2.0. These
          terms cover the hosted service that relays messages between your devices.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You sign in with Google, Apple, GitHub, or X. You are responsible for the security of that
          account and of every Mac you pair. Pair only machines you own or are allowed to control.
        </p>
      </LegalSection>

      <LegalSection heading="Your machine, your responsibility">
        <p>
          Porte relays your prompts and approvals. It does not add permissions to the coding agent
          on your Mac. The agent keeps the rules, hooks, and approval prompts you already
          configured. You remain responsible for what the agent does when you approve an action.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>Do not use the service to:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Reach a machine you do not own or have permission to control.</li>
          <li>Break the law or another person's rights.</li>
          <li>Attack, overload, or probe the relay outside a reported security test.</li>
          <li>Resell the hosted relay as your own service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Service availability">
        <p>
          The hosted relay is free and provided as is. It can change, break, or stop at any time. We
          may suspend an account that harms the service or other users. You can stop using Porte at
          any time by unpairing your machines and deleting your account.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          The software and the hosted relay come with no warranty of any kind. Sections 7 and 8 of
          the Apache License 2.0 state the disclaimer of warranty and the limitation of liability
          that apply to the source code. The same limits apply to the hosted relay, to the extent
          the law allows.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          We update these terms by changing this page and the date above. Continued use means you
          accept the current version. Raise questions as an issue at{' '}
          <a href={REPOSITORY_URL} rel="noreferrer" target="_blank">
            the Porte repository
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
