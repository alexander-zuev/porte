export const SOCIAL_PROVIDERS = ['github', 'twitter', 'vercel'] as const

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]
