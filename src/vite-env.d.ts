/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Both are PUBLIC and ship in the browser bundle. See .env.example. */
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
