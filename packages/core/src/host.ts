import { z } from 'zod'

/**
 * The platforms a host may run on, as Node names them.
 *
 * Three of Node's eleven, because Porte has only ever run on these and a type
 * that claims more is a promise nothing keeps. Supporting another one is one
 * more member here.
 */
export const HOST_PLATFORMS = ['darwin', 'linux', 'win32'] as const
export const HostPlatformSchema = z.enum(HOST_PLATFORMS)
export type HostPlatform = z.infer<typeof HostPlatformSchema>

/** Human-readable host identity returned to trusted clients. */
export const HostDescriptorSchema = z.object({
  name: z.string().min(1),
  platform: HostPlatformSchema,
})

/** Human-readable host identity returned to trusted clients. */
export type HostDescriptor = z.infer<typeof HostDescriptorSchema>

/** What Node calls each platform, against what a person calls it. */
const PLATFORM_LABELS = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
} satisfies Record<HostPlatform, string>

/**
 * Name a platform for a person.
 *
 * The token is what gets stored, so the label is derived here rather than kept
 * as a second column spelling one fact two ways.
 */
export function platformLabel(platform: HostPlatform): string {
  return PLATFORM_LABELS[platform]
}
