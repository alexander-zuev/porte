import {
  NewSession,
  type NewSessionProps,
} from '#/features/session-create/components/new-session.tsx'

/** Props for the new-session page. */
export type NewSessionPageProps = NewSessionProps

/** Render the new-session flow in its responsive page shell. */
export function NewSessionPage(props: NewSessionPageProps) {
  return <NewSession {...props} />
}
