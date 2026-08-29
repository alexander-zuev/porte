import { createFileRoute } from '@tanstack/react-router'

/**
 * Pairing, inside the app frame it is on its way into.
 *
 * `card` holds one step below the bar, so a taller step does not move what sits
 * above it, and carries the legal footer: this is where an account is bound to
 * a machine, and the terms belong in view. Declared here rather than on each
 * step, so every screen under it shares one shape.
 *
 * There is no machine yet, so the bar names none. It carries the wordmark and the
 * menu, which is the way out for somebody stuck partway through.
 */
export const Route = createFileRoute('/_auth/pair')({
  staticData: { appShell: 'card' },
})
