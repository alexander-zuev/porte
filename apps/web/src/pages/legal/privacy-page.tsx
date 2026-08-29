import { LEGAL_UPDATED, REPOSITORY_URL } from '@web/lib/product.ts'

import { LegalPage, LegalSection } from './legal-page.tsx'

/** What the hosted Porte relay stores, and what never reaches it. */
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated={LEGAL_UPDATED}>
      <LegalSection heading="The short version">
        <p>
          Your repositories, your files, and your Grok account stay on your Mac. Porte stores your
          sign-in identity, your pairing, and the transcript of every conversation you run through
          it.
        </p>
      </LegalSection>

      <LegalSection heading="What we store">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Account: your name, email address, and avatar from Google, Apple, GitHub, or X. A
            sign-in session lasts 7 days.
          </li>
          <li>
            Pairing: the Mac's name and platform, and when it last connected. While a pairing code
            is open, the IP address and approximate location of the machine that asked for it.
            Deleted when the code is approved, refused, or expires.
          </li>
          <li>
            Conversations: the id, working directory, repository path, title, and the transcript.
            The transcript holds your prompts and attached files, the answers, the reasoning, and
            every tool call with its output, as the Mac reports them. It is stored so your phone can
            read a conversation while the Mac is offline.
          </li>
          <li>
            Product analytics through PostHog and error reports through Sentry. Neither receives
            transcripts.
          </li>
        </ul>
        <p>Everything above is stored on Cloudflare.</p>
      </LegalSection>

      <LegalSection heading="What never reaches us">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Your repositories and files, except what a transcript quotes.</li>
          <li>Your grok.com credentials and spend.</li>
          <li>Anything the coding agent reads or writes on disk.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Deleting your data">
        <p>
          Unpair a Mac to revoke its pairing. Account deletion is not built yet: to delete your
          transcripts or your account, open an issue at{' '}
          <a href={REPOSITORY_URL} rel="noreferrer" target="_blank">
            the Porte repository
          </a>{' '}
          and we delete them by hand.
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
