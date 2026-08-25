import { createFileRoute } from '@tanstack/react-router'

/** Groups the routes that share one relay connection without adding a component. */
export const Route = createFileRoute('/_auth/_relay')({})
