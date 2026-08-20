import { useReducedMotion } from '@web/ui/hooks/use-reduced-motion.ts'
import { useEffect, useRef, useState } from 'react'

/**
 * Reveal text one character at a time while the rest stays scrambled.
 *
 * Adapted from React Bits (https://reactbits.dev/text-animations/decrypted-text).
 * Trimmed to the sequential reveal that starts when the text scrolls into view.
 */

const DEFAULT_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export type DecryptedTextProps = {
  readonly text: string
  readonly speed?: number
  readonly characters?: string
  readonly className?: string
  readonly encryptedClassName?: string
}

function scramble(text: string, revealedCount: number, characters: string) {
  return text
    .split('')
    .map((character, index) => {
      if (index < revealedCount) return character
      if (character === ' ') return ' '
      return characters.charAt(Math.floor(Math.random() * characters.length))
    })
    .join('')
}

export function DecryptedText({
  text,
  speed = 45,
  characters = DEFAULT_CHARACTERS,
  className,
  encryptedClassName,
}: DecryptedTextProps) {
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLSpanElement>(null)
  const [started, setStarted] = useState(false)
  const [revealedCount, setRevealedCount] = useState(0)
  const shownCount = reducedMotion ? text.length : revealedCount

  useEffect(() => {
    const container = containerRef.current
    if (container === null || reducedMotion) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setStarted(true)
      },
      { threshold: 0.1 },
    )
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [reducedMotion])

  useEffect(() => {
    if (!started || revealedCount >= text.length) return undefined
    const timer = window.setTimeout(() => {
      setRevealedCount((count) => count + 1)
    }, speed)
    return () => {
      window.clearTimeout(timer)
    }
  }, [revealedCount, speed, started, text.length])

  const displayed = scramble(text, shownCount, characters)

  return (
    <span ref={containerRef} className="inline-block whitespace-pre-wrap">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {displayed.split('').map((character, index) => (
          <span
            key={`${String(index)}-${character}`}
            className={index < shownCount ? className : encryptedClassName}
          >
            {character}
          </span>
        ))}
      </span>
    </span>
  )
}
