import { gsap } from 'gsap'
import { useEffect, useRef, useState } from 'react'

import { cn } from '#/lib/utils.ts'
import { useReducedMotion } from '#/ui/hooks/use-reduced-motion.ts'

/**
 * Type one string out once, then leave it in place.
 *
 * Adapted from React Bits (https://reactbits.dev/text-animations/text-type).
 * Reduced motion renders the finished string without typing.
 */

export type TextTypeProps = {
  readonly text: string
  readonly typingSpeed?: number
  readonly initialDelay?: number
  readonly showCursor?: boolean
  readonly cursorBlinkDuration?: number
  readonly className?: string
  readonly cursorClassName?: string
}

export function TextType({
  text,
  typingSpeed = 55,
  initialDelay = 350,
  showCursor = true,
  cursorBlinkDuration = 0.6,
  className,
  cursorClassName,
}: TextTypeProps) {
  const reducedMotion = useReducedMotion()
  const [typedCount, setTypedCount] = useState(0)
  const cursorRef = useRef<HTMLSpanElement>(null)
  const shownCount = reducedMotion ? text.length : typedCount

  useEffect(() => {
    if (reducedMotion || typedCount >= text.length) return undefined
    const delay = typedCount === 0 ? initialDelay : typingSpeed
    const timer = window.setTimeout(() => {
      setTypedCount((count) => count + 1)
    }, delay)
    return () => {
      window.clearTimeout(timer)
    }
  }, [initialDelay, reducedMotion, text.length, typedCount, typingSpeed])

  useEffect(() => {
    const cursor = cursorRef.current
    if (cursor === null) return undefined
    const tween = gsap.to(cursor, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut',
    })
    return () => {
      tween.kill()
    }
  }, [cursorBlinkDuration])

  return (
    <span className={cn('inline', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="whitespace-pre">
        {text.slice(0, shownCount)}
      </span>
      {showCursor ? (
        <span
          ref={cursorRef}
          aria-hidden
          // A drawn caret keeps the baseline steady; a glyph would shift the line box.
          className={cn(
            'ml-px inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-current',
            cursorClassName,
          )}
        />
      ) : null}
    </span>
  )
}
