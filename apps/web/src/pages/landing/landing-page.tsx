import { GithubLogoIcon, LaptopIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { RiGrokAiFill } from '@remixicon/react'
import { AGENT_PROMPT, PAIR_COMMAND } from '@web/lib/product.ts'
import { CopyPrompt } from '@web/ui/components/copy-prompt.tsx'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import type { ReactNode } from 'react'

const PROOF: readonly { readonly icon: ReactNode; readonly label: string }[] = [
  { icon: <ShieldCheckIcon aria-hidden />, label: 'Adds no new permissions' },
  { icon: <LaptopIcon aria-hidden />, label: 'Repos never leave the Mac' },
  { icon: <GithubLogoIcon aria-hidden />, label: 'Apache-2.0' },
]

/** Single-screen marketing entry that sends visitors to the pairing command. */
export function LandingPage() {
  return (
    <div className="flex flex-col gap-8">
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
        {/* One control: the box is the command to type, the button is the path
            for a person who hands setup to Claude Code, Codex, or Grok. */}
        <div className="flex max-w-2xl flex-wrap items-center gap-3">
          <TerminalCommand typed className="max-w-md flex-1" command={PAIR_COMMAND} copy={false} />
          <CopyPrompt prompt={AGENT_PROMPT} />
        </div>
        <p className="max-w-[46ch] text-muted-foreground">
          Pair your Mac. Then run Grok from your phone.
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
  )
}
