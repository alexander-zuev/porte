import { LEGAL_UPDATED, REPOSITORY_URL } from '#/lib/product.ts'

import { LegalPage, LegalSection } from './legal-page.tsx'

/** What the hosted Porte relay stores, and what never reaches it. */
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated={LEGAL_UPDATED}>
      <LegalSection heading="The short version">
        <p>
          Your repositories, your files, and your Grok account stay on your Mac. Porte holds the
          account you sign in with, the record of which machines you paired, and enough about each
          conversation to list it.
        </p>
      </LegalSection>

      <LegalSection heading="What we store">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Account identity from your sign-in provider: your name, email address, and avatar.
          </li>
          <li>Pairing records: which machines your account controls, and when they connected.</li>
          <li>
            Conversation metadata: the conversation id, its working directory, and when it last
            changed.
          </li>
          <li>Product analytics through PostHog, and error reports through Sentry.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="What passes through">
        <p>
          Prompts, approvals, and conversation output travel through the relay so your phone and
          your Mac can talk. They move through it in transit rather than being kept as a stored
          transcript.
        </p>
      </LegalSection>

      <LegalSection heading="What never reaches us">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Your repositories and files.</li>
          <li>Your grok.com credentials and spend.</li>
          <li>Anything the coding agent reads or writes on disk.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Deleting your data">
        <p>
          Unpair a machine to remove its pairing record. Delete your account to remove your identity
          and conversation metadata. Ask through an issue at{' '}
          <a href={REPOSITORY_URL} rel="noreferrer" target="_blank">
            the Porte repository
          </a>{' '}
          if you want a manual deletion.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We update this page and the date above when what we store changes. Read the source to
          check any claim here: Porte is open under the Apache License 2.0.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
