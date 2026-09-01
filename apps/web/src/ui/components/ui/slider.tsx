import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@web/lib/utils.ts'
import * as React from 'react'

/** Discrete slider: pill track with one dot per stop; the thumb, not a fill, carries the value. */
function Slider({ className, ...props }: SliderPrimitive.Root.Props) {
  const { min = 0, max = 100, step = 1 } = props
  const stops = (max - min) / step + 1
  // Dots only for a small finite stop count; a continuous range stays dotless.
  const ticks = Number.isInteger(stops) && stops > 1 && stops <= 12 ? stops : 0

  return (
    <SliderPrimitive.Root data-slot="slider" className={cn('w-full', className)} {...props}>
      <SliderPrimitive.Control
        className="relative flex h-4 w-full touch-none items-center select-none"
        data-slot="slider-control"
      >
        {/* The pill is not the track: its rounded ends must extend past the thumb travel range. */}
        <span aria-hidden className="absolute inset-0 rounded-full bg-surface-active" />
        <SliderPrimitive.Track className="relative mx-2 h-full grow" data-slot="slider-track">
          {Array.from({ length: ticks }, (_, index) => (
            <span
              aria-hidden
              key={index}
              className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border-interactive-strong"
              style={{ left: `${(index / (ticks - 1)) * 100}%` }}
            />
          ))}
          <SliderPrimitive.Thumb
            className="absolute top-1/2 size-3 rounded-full bg-primary transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            data-slot="slider-thumb"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
