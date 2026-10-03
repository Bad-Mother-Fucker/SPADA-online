// Parser dei registri della pipeline: matrice dei criteri, registro dei
// gap, registro delle proposte, audit di consegna, run log. Porting delle
// funzioni parse* di app/frontend/js/gara.js.

import { durata } from "@/lib/formato"
import * as Md from "@/lib/md"
import type { Fasi } from "./fasi"

export interface Criterio { id: string; testo: string; fonte: string; metodo: "tabellare" | "discrezionale" | ""; punti: string }
export interface Prova { fonte: string; testo: string; contraria: boolean }
export interface Gap { id: string; requisito: string; titolo: string; severita: Md.Severita | null; sintesi: string; proposta: string; nota: string; prove: Prova[] }
export interface Proposta { id: string; titolo: string; criterio: string; riferimento: string; decisione: Md.Decisione | null; sintesi: string; severita: Md.Severita | null; punteggio: string; agente: string }
export interface VoceAudit { voce: string; dettaglio: string; esito: string; tono: "ok" | "crit" | "attn" | "run" | "neu" }
export interface Run { fase: number | string; avviato_il: string; modello?: string; effort?: string; esito: string; errore?: string; umana: boolean; durata: string }

/** Matrice dei criteri, nel formato di extract-criteria-from-disciplinary. */
export function parseCriteri(testo: string): Criterio[] {
  const t = Md.tabellaCon(testo, [["id", "codice"]])
  if (!t) return []
  const righe = Md.righeMappate(t, {
    id: ["id", "codice"],
    testo: ["criterio", "descrizione", "titolo"],
    metodo: ["metodo attribuzione", "metodo", "attribuzione"],
    punti: ["punteggio max", "punteggio", "punti"],
  })
  const fonte = Md.ripulisci((/\*\*Fonte:\*\*\s*(.+)/.exec(testo) || [])[1] || "")
  return righe.map((r) => ({
    id: r.id,
    testo: r.testo && r.testo !== r.id ? r.testo : (r._celle[1] || ""),
    fonte,
    metodo: /tabell/i.test(r.metodo) ? "tabellare" as const : /discrez/i.test(r.metodo) ? "discrezionale" as const : "" as const,
    punti: r.punti,
  })).filter((r) => r.id)
}

export function parseDocumento(testo: string): Md.Documento | null {
  const doc = Md.documento(testo)
  return doc.sezioni.length || doc.intro.length ? doc : null
}

export function parseGap(testo: string): Gap[] {
  const t = Md.tabellaCon(testo, [["id", "gap", "codice"]])
  if (!t) return []
  const righe = Md.righeMappate(t, {
    id: ["id", "gap", "codice"],
    requisito: ["criterio", "requisito", "crit", "riferimento", "rif"],
    titolo: ["titolo", "descrizione", "oggetto", "gap"],
    severita: ["severita", "gravita", "priorita", "impatto", "rischio"],
    sintesi: ["sintesi", "note", "dettaglio", "motivazione", "analisi"],
    proposta: ["proposta", "soluzione", "copertura"],
    prova: ["prova", "prove", "evidenza", "evidenze", "fonte", "riscontro"],
  })
  return righe.map((r) => ({
    id: r.id,
    requisito: r.requisito && r.requisito !== r.id ? r.requisito : "",
    titolo: r.titolo && r.titolo !== r.id ? r.titolo : (r._celle[1] || ""),
    severita: Md.severita(r.severita),
    sintesi: r.sintesi,
    proposta: /^P[-.]?\w+/i.test(r.proposta) ? r.proposta : "",
    nota: "",
    prove: r.prova ? [{ fonte: "", testo: r.prova, contraria: /contrari|conflitt|supera|viola/i.test(r.prova) }] : [],
  })).filter((g) => g.id || g.titolo)
}

export function parseProposte(testo: string): Proposta[] {
  const t = Md.tabellaCon(testo, [["id", "proposta", "codice"]])
  if (!t) return []
  const righe = Md.righeMappate(t, {
    id: ["id", "proposta", "codice"],
    titolo: ["titolo", "descrizione", "oggetto"],
    criterio: ["criterio", "sottocriterio", "crit"],
    riferimento: ["gap", "origine", "riferimento", "rif"],
    stato: ["stato", "decisione", "esito"],
    sintesi: ["sintesi", "note", "contenuto", "motivazione"],
    severita: ["severita", "priorita", "impatto", "rischio"],
    punteggio: ["punti", "punteggio", "peso"],
    agente: ["agente", "autore"],
  })
  return righe.map((r) => ({
    id: r.id,
    titolo: r.titolo && r.titolo !== r.id ? r.titolo : (r._celle[1] || ""),
    criterio: r.criterio,
    riferimento: r.riferimento || r.criterio,
    decisione: Md.decisione(r.stato),
    sintesi: r.sintesi,
    severita: Md.severita(r.severita),
    punteggio: r.punteggio,
    agente: r.agente,
  })).filter((p) => p.id || p.titolo)
}

function tonoAudit(s: unknown): VoceAudit["tono"] {
  const n = String(s || "").toLowerCase()
  if (/conform|ok|s[iì]\b|superat|present/.test(n)) return "ok"
  if (/blocc|non conform|kop|fallit|assent|mancant/.test(n)) return "crit"
  if (/incomplet|parziale|attesa|warn/.test(n)) return "attn"
  if (/fuori|escluso|manuale/.test(n)) return "run"
  return "neu"
}

export function parseAudit(testo: string): VoceAudit[] {
  const t = Md.tabellaCon(testo, [["voce", "controllo", "verifica", "requisito", "check"]])
  if (t) {
    const righe = Md.righeMappate(t, {
      voce: ["voce", "controllo", "verifica", "requisito", "check", "oggetto"],
      esito: ["esito", "stato", "risultato", "conforme"],
      dettaglio: ["dettaglio", "note", "nota", "motivazione", "osservazioni"],
    })
    return righe.map((r) => ({ voce: r.voce, dettaglio: r.dettaglio, esito: r.esito || "da verificare", tono: tonoAudit(r.esito) })).filter((v) => v.voce)
  }
  // Nessuna tabella: le sezioni del documento diventano voci di checklist.
  return Md.sezioni(testo)
    .filter((s) => s.livello >= 2 && s.corpo.trim())
    .map((s) => ({
      voce: s.titolo,
      dettaglio: Md.paragrafi(s.corpo, 1)[0] || "",
      esito: Md.severita(s.corpo) === "alta" ? "bloccante" : "da verificare",
      tono: Md.severita(s.corpo) === "alta" ? "crit" as const : "neu" as const,
    }))
}

export interface RunGrezzo { fase: number | string; avviato_il: string; concluso_il?: string; modello?: string; effort?: string; esito?: string; errore?: string }

/** Run dal più recente, con durata leggibile. Un run senza modello è un'azione umana. */
export function normalizzaRuns(runs: RunGrezzo[]): Run[] {
  return runs.slice().reverse().map((r) => {
    const inizio = Date.parse(r.avviato_il)
    const fine = Date.parse(r.concluso_il || "")
    return {
      fase: r.fase, avviato_il: r.avviato_il, modello: r.modello, effort: r.effort,
      esito: r.esito || "sconosciuto", errore: r.errore, umana: !r.modello,
      durata: Number.isFinite(inizio) && Number.isFinite(fine) ? durata((fine - inizio) / 1000) : "non disponibile",
    }
  })
}

/** Perché l'ultimo run di una fase è fallito, da run_log: l'unico posto in
    cui la pipeline scrive la causa. */
export function erroreUltimoRun(runs: Run[] | undefined, n: number): string | null {
  const ultimo = (runs || []).find((r) => Number(r.fase) === n)
  if (!ultimo || ultimo.esito === "completato" || ultimo.esito === "in_corso") return null
  return ultimo.errore || `Esito «${ultimo.esito}» senza motivo registrato.`
}

export type Copertura = { stato: "da_valutare" | "scoperto" | "coperto"; etichetta: string; dettaglio: string }

/** Copertura di un criterio, ricavata dai registri che la producono: gap
    (Fase 5), proposte approvate (Fase 6), manifest.criteri_stato. */
export function coperturaCriteri(gap: Gap[], proposte: Proposta[], criteriStato: Record<string, { analizzato?: boolean }> = {}) {
  const di = (id: string, criterio: string, codice: string) => {
    const re = new RegExp(`(^|[^A-Za-z0-9])${id}(?![0-9])`, "i")
    return criterio ? new RegExp(`^${id}(?![0-9])`, "i").test(criterio.trim()) : re.test(codice || "")
  }
  return (id: string): Copertura => {
    const suoi = gap.filter((g) => di(id, g.requisito, g.id))
    const approvate = proposte.filter((p) => di(id, p.criterio, p.id)).length
    const analizzato = !!criteriStato[id]?.analizzato || suoi.length > 0
    if (!analizzato) return { stato: "da_valutare", etichetta: "Da valutare in Fase 5", dettaglio: "" }
    const senza = suoi.filter((g) => !g.proposta).length
    const dettaglio = approvate ? `${approvate} ${approvate === 1 ? "proposta approvata" : "proposte approvate"}` : ""
    if (senza) return { stato: "scoperto", etichetta: `${senza}/${suoi.length} gap senza proposta`, dettaglio }
    return {
      stato: "coperto",
      etichetta: !suoi.length ? "Nessun gap" : suoi.length === 1 ? "1 gap, con proposta" : `${suoi.length} gap, tutti con proposta`,
      dettaglio,
    }
  }
}

/** Elaborati prodotti da una fase: la pipeline li scrive in cartelle
    numerate, e il numero della cartella non coincide con quello della fase. */
export const CARTELLE_FASE: Record<number, string[]> = {
  1: ["01_extracted/"],
  2: ["02_graph/"],
  3: ["03_criteria/strategy_audit", "04_doc_summaries/"],
  4: ["07_questions/domande.md", "07_questions/risposte_professionista"],
  5: ["05_criteria_outputs/", "06_registers/gap_register"],
  6: ["06_registers/proposal_register", "06_registers/score_forecast"],
  7: ["10_offer/"],
  8: ["06_registers/audit_summary"],
}

export function elaboratiDiFase(output: string[], n: number) {
  const prefissi = CARTELLE_FASE[n] || []
  return output
    .filter((p) => prefissi.some((pre) => p.startsWith(pre)) && !p.startsWith("11_view/"))
    .map((p) => {
      const gemello = `11_view/${p.replace(/\.md$/, ".html")}`
      const haGemello = p.endsWith(".md") && output.includes(gemello)
      const href = haGemello ? gemello : p
      return {
        nome: (p.split("/").pop() || p).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]/g, " "),
        href,
        ext: `.${href.split(".").pop()}`,
      }
    })
    .slice(0, 12)
}

/** Stato complessivo di una gara, utile per il titolo della pagina. */
export const faseDi = (fasi: Fasi, chiave: string) => fasi[chiave]
