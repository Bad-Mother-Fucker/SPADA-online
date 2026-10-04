// Lettura dei registri e dei documenti markdown prodotti dalla pipeline.
// Porting di md.js del frontend precedente, senza la parte di rendering, che in
// React è il componente <Markdown>.
//
// I registri sono scritti da agenti: le intestazioni di colonna variano
// nella forma ma non nel significato. Il parsing cerca le colonne per
// sinonimi, non per posizione, e non fallisce mai in silenzio: se una
// tabella non si riconosce, chi chiama riceve una lista vuota.

export interface Tabella { intestazioni: string[]; righe: string[][] }

/** Tutte le tabelle pipe presenti nel documento. */
export function tabelle(testo: string): Tabella[] {
  const righe = String(testo || "").split("\n")
  const out: string[][] = []
  let corrente: string[] | null = null
  for (const riga of righe) {
    const r = riga.trim()
    if (r.startsWith("|") && r.length > 1) (corrente ||= []).push(r)
    else if (corrente) { out.push(corrente); corrente = null }
  }
  if (corrente) out.push(corrente)
  return out.map((blocco) => {
    const celle = (r: string) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim())
    const intestazioni = celle(blocco[0])
    const inizio = blocco[1] && /^[\s|:-]+$/.test(blocco[1]) ? 2 : 1
    const righeDati = blocco.slice(inizio).map(celle).filter((c) => c.some((x) => x))
    return { intestazioni, righe: righeDati }
  }).filter((t) => t.righe.length > 0)
}

export const normalizza = (s: unknown) => String(s || "").toLowerCase()
  .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
  .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
  .replace(/[^a-z0-9]/g, "")

/** Indice della prima colonna il cui titolo contiene uno dei sinonimi. */
export function colonna(intestazioni: string[], sinonimi: string[]): number {
  const norm = intestazioni.map(normalizza)
  for (const sin of sinonimi) {
    const i = norm.indexOf(normalizza(sin))
    if (i !== -1) return i
  }
  for (const sin of sinonimi) {
    const s = normalizza(sin)
    const i = norm.findIndex((h) => h.includes(s))
    if (i !== -1) return i
  }
  return -1
}

export type RigaMappata<K extends string> = Record<K, string> & { _celle: string[] }

/** Righe della tabella come oggetti, secondo una mappa {campo: [sinonimi]}. */
export function righeMappate<K extends string>(tabella: Tabella, mappa: Record<K, string[]>): RigaMappata<K>[] {
  const indici = {} as Record<K, number>
  for (const campo of Object.keys(mappa) as K[]) indici[campo] = colonna(tabella.intestazioni, mappa[campo])
  return tabella.righe.map((celle) => {
    const o = { _celle: celle } as RigaMappata<K>
    for (const campo of Object.keys(mappa) as K[]) {
      const i = indici[campo]
      ;(o as Record<string, unknown>)[campo] = i >= 0 ? ripulisci(celle[i] || "") : ""
    }
    return o
  })
}

/** La prima tabella che contiene tutte le colonne obbligatorie. */
export function tabellaCon(testo: string, obbligatorie: string[][]): Tabella | null {
  for (const t of tabelle(testo)) {
    if (obbligatorie.every((sin) => colonna(t.intestazioni, sin) !== -1)) return t
  }
  return null
}

/** Toglie enfasi, wikilink e link markdown, lasciando il testo leggibile. */
export function ripulisci(s: unknown): string {
  return String(s || "")
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a: string, b?: string) => (b ? b.slice(1) : a))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/<!--.*?-->/g, "")
    .trim()
}

export interface SezioneTesto { livello: number; titolo: string; corpo: string }

/** Sezioni di primo e secondo livello: { livello, titolo, corpo }. */
export function sezioni(testo: string): SezioneTesto[] {
  const righe = String(testo || "").split("\n")
  const out: { livello: number; titolo: string; corpo: string[] }[] = []
  let corrente: (typeof out)[number] | null = null
  for (const riga of righe) {
    const m = /^(#{1,4})\s+(.*)$/.exec(riga)
    if (m) {
      if (corrente) out.push(corrente)
      corrente = { livello: m[1].length, titolo: ripulisci(m[2]), corpo: [] }
    } else if (corrente) corrente.corpo.push(riga)
  }
  if (corrente) out.push(corrente)
  return out.map((s) => ({ ...s, corpo: s.corpo.join("\n").trim() }))
}

/** Primi paragrafi di prosa di un documento, saltando titoli e tabelle. */
export function paragrafi(testo: string, max = 3): string[] {
  const out: string[] = []
  for (const b of String(testo || "").split(/\n\s*\n/)) {
    const t = b.trim()
    if (!t || t.startsWith("#") || t.startsWith("|") || t.startsWith("---") || t.startsWith("```")) continue
    out.push(ripulisci(t.replace(/\n/g, " ")))
    if (out.length >= max) break
  }
  return out
}

/** Citazione in virgolette caporali: il formato con cui gli agenti riportano il testo letterale. */
export function citazione(testo: string): string | null {
  const m = /«([^»]{10,400})»/.exec(String(testo || ""))
  return m ? m[1].trim() : null
}

/** Frontmatter YAML piatto in testa al file (solo coppie chiave: valore). */
export function frontmatter(testo: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(String(testo || "").trim())
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const riga of m[1].split("\n")) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(riga)
    if (kv) out[kv[1]] = ripulisci(kv[2].replace(/^["']|["']$/g, ""))
  }
  return out
}

export type Severita = "alta" | "media" | "bassa"
/** Prima parola-chiave di severità riconosciuta nel testo. */
export function severita(s: unknown): Severita | null {
  const n = normalizza(s)
  if (/alta|critica|high|bloccante/.test(n)) return "alta"
  if (/media|medium|presidiare/.test(n)) return "media"
  if (/bassa|low|conforme|minore/.test(n)) return "bassa"
  return null
}

export type Decisione = "approvata" | "da_modificare" | "scartata"
/** Decisione umana riconosciuta in una cella di stato. */
export function decisione(s: unknown): Decisione | null {
  const n = normalizza(s)
  if (/approvat|accettat|ok/.test(n)) return "approvata"
  if (/modific|rimandat|revision/.test(n)) return "da_modificare"
  if (/scartat|respint|rifiutat/.test(n)) return "scartata"
  return null
}

// ------------------------------------------------------------------
// Modello a blocchi di un documento (gara brief, audit strategico).
// Copre ciò che gli agenti scrivono davvero: titoli, paragrafi, tabelle
// pipe, elenchi anche a due livelli, citazioni-avviso, separatori,
// grassetto, corsivo, codice, link http(s) e wikilink [[C1]].
// ------------------------------------------------------------------

export type Blocco =
  | { tipo: "titolo"; livello: number; testo: string }
  | { tipo: "hr" }
  | { tipo: "tabella"; intestazioni: string[]; corpo: string[][] }
  | { tipo: "citazione"; testo: string; figli: Blocco[] }
  | { tipo: "lista"; ordinata: boolean; voci: { livello: number; testo: string }[] }
  | { tipo: "paragrafo"; righe: string[] }

const RE_TAB = /^\s*\|.*\|\s*$/
const RE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const RE_VOCE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const RE_TITOLO = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RE_HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

/** Blocchi del documento (frontmatter e commenti per gli agenti esclusi). */
export function blocchi(testo: string): Blocco[] {
  const righe = String(testo || "").replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "").split("\n")
  const out: Blocco[] = []
  let i = 0
  const inizioBlocco = (r: string, succ: string) =>
    RE_TITOLO.test(r) || /^\s*>/.test(r) || RE_VOCE.test(r) || RE_HR.test(r) || (RE_TAB.test(r) && RE_SEP.test(succ || ""))

  while (i < righe.length) {
    const r = righe[i]
    if (!r.trim()) { i++; continue }
    let m: RegExpExecArray | null
    if ((m = RE_TITOLO.exec(r))) {
      out.push({ tipo: "titolo", livello: m[1].length, testo: m[2] }); i++
    } else if (RE_HR.test(r)) {
      out.push({ tipo: "hr" }); i++
    } else if (RE_TAB.test(r) && RE_SEP.test(righe[i + 1] || "")) {
      const celle = (x: string) => x.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
      const intestazioni = celle(r)
      const corpo: string[][] = []
      i += 2
      while (i < righe.length && RE_TAB.test(righe[i])) corpo.push(celle(righe[i++]))
      out.push({ tipo: "tabella", intestazioni, corpo })
    } else if (/^\s*>/.test(r)) {
      const q: string[] = []
      while (i < righe.length && /^\s*>/.test(righe[i])) q.push(righe[i++].replace(/^\s*>\s?/, ""))
      out.push({ tipo: "citazione", testo: q.join(" "), figli: blocchi(q.join("\n")) })
    } else if (RE_VOCE.test(r)) {
      const ordinata = /^\s*\d/.test(r)
      const voci: { livello: number; testo: string }[] = []
      while (i < righe.length) {
        const x = righe[i]
        const mv = RE_VOCE.exec(x)
        if (mv) voci.push({ livello: mv[1].replace(/\t/g, "  ").length >= 2 ? 1 : 0, testo: mv[3] })
        else if (voci.length && /^\s{2,}\S/.test(x)) voci[voci.length - 1].testo += " " + x.trim()
        else break
        i++
      }
      out.push({ tipo: "lista", ordinata, voci })
    } else {
      const righeP: string[] = []
      while (i < righe.length && righe[i].trim() && !inizioBlocco(righe[i], righe[i + 1])) righeP.push(righe[i++].trim())
      out.push({ tipo: "paragrafo", righe: righeP })
    }
  }
  return out
}

/** Testo senza formattazione markdown: per copiare o scaricare testo semplice. */
export function testoSemplice(t: unknown): string {
  return String(t || "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, alias?: string) => alias || id)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1$2").replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1$2")
}

export type TokenInline =
  | { tipo: "testo"; testo: string }
  | { tipo: "strong"; figli: TokenInline[] }
  | { tipo: "em"; figli: TokenInline[] }
  | { tipo: "code"; testo: string }
  | { tipo: "ref"; testo: string }
  | { tipo: "link"; testo: string; href: string }

const RE_INLINE = /(\*\*[^*]+?\*\*|\[\[[^\]]+\]\]|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|(?<![\w*])\*[^*\s][^*]*?\*(?![\w*])|(?<![\w])_[^_\s][^_]*?_(?![\w]))/g

/** Testo con formattazione in linea, come albero di token per il renderer. */
export function inline(testo: unknown): TokenInline[] {
  const t0 = String(testo || "")
  const out: TokenInline[] = []
  let ultimo = 0
  for (const m of t0.matchAll(RE_INLINE)) {
    const idx = m.index ?? 0
    if (idx > ultimo) out.push({ tipo: "testo", testo: t0.slice(ultimo, idx) })
    const t = m[0]
    if (t.startsWith("**")) out.push({ tipo: "strong", figli: inline(t.slice(2, -2)) })
    else if (t.startsWith("[[")) out.push({ tipo: "ref", testo: t.slice(2, -2).split("|").pop() || "" })
    else if (t.startsWith("`")) out.push({ tipo: "code", testo: t.slice(1, -1) })
    else if (t.startsWith("[")) {
      const ml = /^\[([^\]]+)\]\((.+)\)$/.exec(t)
      if (ml) out.push({ tipo: "link", testo: ml[1], href: ml[2] })
    } else out.push({ tipo: "em", figli: inline(t.slice(1, -1)) })
    ultimo = idx + t.length
  }
  if (ultimo < t0.length) out.push({ tipo: "testo", testo: t0.slice(ultimo) })
  return out
}

/** Tono di una citazione-avviso, dalla prima parola in grassetto. */
export function tonoCitazione(testo: string): "crit" | "attn" | "run" {
  const t = String(testo || "").replace(/^[\s*_]+/, "").toUpperCase()
  if (/^(ALERT|URGENTE|BLOCCANTE)/.test(t)) return "crit"
  if (/^(ATTENZIONE|⚠|AVVISO)/.test(t)) return "attn"
  return "run"
}

export interface Sottosezione { titolo: string; blocchi: Blocco[] }
export interface Sezione { titolo: string; blocchi: Blocco[]; sottosezioni: Sottosezione[] }
export interface Documento { titolo: string; intro: Blocco[]; sezioni: Sezione[] }

/** Il documento diviso per sezioni di secondo livello, ciascuna con le sue
    sottosezioni di terzo livello. `intro` è ciò che sta fra il titolo e la
    prima sezione. */
export function documento(testo: string): Documento {
  const bs = blocchi(testo)
  let titolo = ""
  const intro: Blocco[] = []
  const sez: Sezione[] = []
  let s: Sezione | null = null
  let sotto: Sottosezione | null = null
  for (const b of bs) {
    if (b.tipo === "titolo" && b.livello === 1 && !titolo) { titolo = b.testo; continue }
    if (b.tipo === "titolo" && b.livello === 2) { s = { titolo: b.testo, blocchi: [], sottosezioni: [] }; sez.push(s); sotto = null; continue }
    if (b.tipo === "titolo" && b.livello === 3 && s) { sotto = { titolo: b.testo, blocchi: [] }; s.sottosezioni.push(sotto); continue }
    if (b.tipo === "hr") continue
    ;(sotto ? sotto.blocchi : s ? s.blocchi : intro).push(b)
  }
  return { titolo, intro, sezioni: sez }
}
