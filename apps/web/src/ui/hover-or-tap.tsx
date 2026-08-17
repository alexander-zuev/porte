import { type ReactElement, useEffect, useState } from 'react'

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip.tsx'

type HoverOrTapProps = {
  readonly label: string
  readonly children: ReactElement
}

/** Tooltip on a fine pointer. Popover on tap. Label is never hover-only. */
export function HoverOrTap({ label, children }: HoverOrTapProps) {
  const hover = useFineHover()

  if (hover) {
    return (
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Popover>
      <PopoverTrigger render={children} />
      <PopoverContent className="w-auto max-w-xs p-3">
        <PopoverDescription>{label}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}

function useFineHover(): boolean {
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => {
      setHover(media.matches)
    }
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [])

  return hover
}
