import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { cn } from '@web/lib/utils.ts'
import * as React from 'react'

/**
 * A panel that slides from the bottom, and closes when swiped down.
 *
 * Separate from `Sheet`, which is a dialog pinned to an edge: it nudges by a
 * couple of rem and has no gesture. This one travels the whole way and follows
 * a thumb, which is what a phone expects from something anchored to the bottom.
 */
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

/** Dims in step with the gesture, so a half-swipe looks half-dismissed. */
function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-50 min-h-dvh bg-overlay/10 supports-backdrop-filter:backdrop-blur-xs',
        'opacity-[calc(1-var(--drawer-swipe-progress))]',
        DRAWER_TRANSITION,
        'transition-opacity data-swiping:duration-0',
        'data-ending-style:opacity-0 data-starting-style:opacity-0',
        'data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The panel itself.
 *
 * `--bleed` is the height the panel keeps below the screen edge. Overscrolling
 * past the bottom then reveals more panel rather than the page behind it, which
 * is what stops a rubber-band from tearing a gap open on iOS.
 */
function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        className="fixed inset-0 z-50 flex items-end justify-center"
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            // Held to the app's own measure. Full width past that reads as a
            // page taking over rather than a panel belonging to this column.
            '[--bleed:3rem] -mb-(--bleed) w-full max-w-2xl max-h-[calc(85dvh+var(--bleed))]',
            'flex flex-col overflow-y-auto overscroll-contain rounded-t-xl border',
            'bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg outline-none',
            'pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px)+var(--bleed))]',
            'touch-auto [transform:translateY(var(--drawer-swipe-movement-y))]',
            DRAWER_TRANSITION,
            'transition-transform data-swiping:select-none',
            'data-starting-style:[transform:translateY(calc(100%-var(--bleed)+2px))]',
            'data-ending-style:[transform:translateY(calc(100%-var(--bleed)+2px))]',
            'data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]',
            className,
          )}
          {...props}
        >
          <DrawerHandle />
          <DrawerPrimitive.Content data-slot="drawer-body" className="flex flex-col gap-4">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )
}

/** The grab bar. Decoration: the whole panel is draggable, not just this. */
function DrawerHandle() {
  return <div aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border" />
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex flex-col gap-1 px-4', className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex flex-col gap-2 px-4', className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

/**
 * The iOS sheet curve, shared by the panel and the backdrop so they arrive together.
 *
 * `motion-reduce` drops the travel rather than the drawer: the panel still
 * appears, it just does not slide.
 */
const DRAWER_TRANSITION =
  'duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
