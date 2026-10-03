// Formattazione condivisa: tempi relativi, scadenze, byte, plurali, slug.
// Porting di app/frontend/js/ui.js (sezione Formattazione).

/** "18 min fa", "ieri", "3 h fa". Torna "non disponibile" su input non leggibile. */
export function quandoRelativo(iso?: string | null, adesso = Date.now()): string {
  if (!iso) return "non disponibile"
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "non disponibile"
  const sec = Math.round((adesso - t) / 1000)
  if (sec < 0) return "tra poco"
  if (sec < 60) return `${sec} s fa`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min fa`
  const ore = Math.round(min / 60)
  if (ore < 24) return `${ore} h fa`
  const gg = Math.round(ore / 24)
  if (gg === 1) return "ieri"
  if (gg < 30) return `${gg} g fa`
  return new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** "29/07 10:02", il formato dello storico esecuzioni. */
export function quandoBreve(iso?: string | null): string {
  if (!iso) return "non disponibile"
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return String(iso)
  return new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "")
}

/** Scadenza come distanza: "scade in 14 g", "scaduta da 2 g", "scade oggi". */
export function scadenza(iso?: string | null, adesso = Date.now()): { testo: string; tono: "neu" | "attn" | "crit" } {
  if (!iso) return { testo: "scadenza non indicata", tono: "neu" }
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return { testo: String(iso), tono: "neu" }
  const gg = Math.ceil((t - adesso) / 86400000)
  if (gg < 0) return { testo: `scaduta da ${Math.abs(gg)} g`, tono: "crit" }
  if (gg === 0) return { testo: "scade oggi", tono: "crit" }
  if (gg <= 7) return { testo: `scade in ${gg} g`, tono: "attn" }
  return { testo: `scade in ${gg} g`, tono: "neu" }
}

export function byte(n: number): string {
  if (!Number.isFinite(n)) return "non disponibile"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
}

/** Durata in secondi: "13m 41s". */
export function durata(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "non disponibile"
  const m = Math.floor(sec / 60)
  const s2 = Math.round(sec % 60)
  return m > 0 ? `${m}m ${String(s2).padStart(2, "0")}s` : `${s2}s`
}

/** Plurale semplice: 1 prova / 2 prove. */
export const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`

/** Slug dal nome: minuscolo, senza accenti, trattini singoli, max 48. */
export function slugify(t: string): string {
  return String(t || "").toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)
}
