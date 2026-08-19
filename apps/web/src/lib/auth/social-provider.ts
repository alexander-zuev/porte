export const SOCIAL_PROVIDERS = ['google', 'apple', 'github', 'twitter'] as const

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]
