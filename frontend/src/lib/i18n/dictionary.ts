// Aggregates every per-namespace string module under ./strings/*.ts into a
// single { en, fr } dictionary. Uses Vite's import.meta.glob so that adding a
// new namespace file requires NO edit here — it is picked up automatically.
// Each strings module must export `en` and `fr` flat objects with NAMESPACED
// keys (e.g. 'validate.title') so merges never collide.

export type Lang = 'en' | 'fr'

type StringsModule = { en?: Record<string, string>; fr?: Record<string, string> }

const modules = import.meta.glob('./strings/*.ts', { eager: true }) as Record<string, StringsModule>

const en: Record<string, string> = {}
const fr: Record<string, string> = {}

for (const mod of Object.values(modules)) {
  if (mod.en) Object.assign(en, mod.en)
  if (mod.fr) Object.assign(fr, mod.fr)
}

export const dictionary: Record<Lang, Record<string, string>> = { en, fr }
