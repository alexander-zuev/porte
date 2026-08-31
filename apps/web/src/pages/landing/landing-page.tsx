import { GithubLogoIcon, LaptopIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { RiGrokAiFill } from '@remixicon/react'
import { PLUGIN_INSTALL_COMMAND } from '@web/lib/product.ts'
import { TerminalCommand } from '@web/ui/components/terminal-command.tsx'
import type { ReactNode } from 'react'

const PROOF: readonly { readonly icon: ReactNode; readonly label: string }[] = [
  { icon: <ShieldCheckIcon aria-hidden />, label: 'Adds no new permissions' },
  { icon: <LaptopIcon aria-hidden />, label: 'Repos never leave the machine' },
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
        Grok stays on your machine.
        <br />
        <span className="text-muted-foreground">You do not have to.</span>
      </h1>

      <div className="flex flex-col gap-4">
        {/* One control: the box shows the command and copies it verbatim. */}
        <TerminalCommand typed className="max-w-2xl" command={PLUGIN_INSTALL_COMMAND} />
        <p className="max-w-[46ch] text-muted-foreground">
          Pair your machine. Then run Grok from your phone.
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
