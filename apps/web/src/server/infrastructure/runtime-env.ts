/** Cloudflare bindings available in every supported runtime environment. */
export type RuntimeEnv = Cloudflare.Env &
  (Cloudflare.DevEnv | Cloudflare.ProdEnv | Cloudflare.TestEnv)
