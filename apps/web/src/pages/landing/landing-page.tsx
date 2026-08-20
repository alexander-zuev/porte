import { GithubLogoIcon, LaptopIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { RiGrokAiFill } from '@remixicon/react'
import type { ReactNode } from 'react'

import { PAIR_COMMAND } from '#/lib/product.ts'
import { PublicShell } from '#/ui/components/public-shell.tsx'
import { TerminalCommand } from '#/ui/components/terminal-command.tsx'

const PROOF: readonly { readonly icon: ReactNode; readonly label: string }[] = [
  { icon: <ShieldCheckIcon aria-hidden />, label: 'Adds no new permissions' },
  { icon: <LaptopIcon aria-hidden />, label: 'Repos never leave the Mac' },
  { icon: <GithubLogoIcon aria-hidden />, label: 'Apache-2.0' },
]

/** Single-screen marketing entry that sends visitors to the pairing command. */
export function LandingPage() {
  return (
    <PublicShell background>
      <div className="flex flex-1 flex-col justify-center">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 md:px-10">
          <h1 className="text-display-hero max-w-[16ch]">
            {/* The icon writes its own width attribute, so em sizing goes through
                `size`, not a class. A shade over cap height, so the mark leads. */}
            <RiGrokAiFill
              aria-hidden
              className="mr-[0.18em] inline-block align-baseline"
              size="0.8em"
            />
            Grok stays on your Mac.
            <br />
            <span className="text-muted-foreground">You do not have to.</span>
          </h1>

          <div className="flex flex-col gap-4">
            <TerminalCommand typed className="max-w-md" command={PAIR_COMMAND} />
            <p className="max-w-[46ch] text-muted-foreground">
              Run this on the Mac where you use Grok, then confirm the phrase on your phone. Pick up
              a session, start a new one, and approve every action from anywhere.
            </p>
          </div>

          <ul className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:gap-x-7">
            {PROOF.map((proof) => (
              <li key={proof.label} className="flex items-center gap-2 text-muted-foreground">
                {proof.icon}
                <small>{proof.label}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PublicShell>
  )
}
