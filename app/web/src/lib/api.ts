// Client del backend FastAPI. Porting tipizzato di app/frontend/js/api.js.
//
// Gli errori portano con sé stato HTTP e percorso: gli stati di errore li
// mostrano testualmente ("Il servizio ha risposto 503 per /gare"), e senza
// questi campi il messaggio si ridurrebbe a "qualcosa è andato storto".
// Ogni richiesta ha un timeout: nessuna schermata resta in attesa per sempre.

import type { Fasi } from "@/dominio/fasi"

export class ApiError extends Error {
  stato: number
  percorso: string
  dettaglio: string
  timeout: boolean
  constructor(messaggio: string, o: { stato?: number; percorso?: string; dettaglio?: string; timeout?: boolean } = {}) {
    super(messaggio)
    this.name = "ApiError"
    this.stato = o.stato ?? 0
    this.percorso = o.percorso ?? ""
    this.dettaglio = o.dettaglio ?? ""
    this.timeout = o.timeout ?? false
  }
  /** Il backend non espone questo endpoint: è più vecchio del frontend. */
  get assente() { return this.stato === 405 || this.stato === 501 }
  /** La pipeline non ha ancora prodotto questo elaborato: stato previsto. */
  get nonProdotto() { return this.stato === 404 }
}

export const TIMEOUT_MS = 15_000

const base = () => (import.meta.env.VITE_API_BASE as string | undefined) || ""

interface Opzioni extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal
  timeoutMs?: number
}

function segnale(esterno: AbortSignal | undefined, timeoutMs: number) {
  const t = AbortSignal.timeout(timeoutMs)
  return esterno ? AbortSignal.any([esterno, t]) : t
}

async function richiesta<T = unknown>(percorso: string, opzioni: Opzioni = {}): Promise<T> {
  const { signal, timeoutMs = TIMEOUT_MS, headers, ...resto } = opzioni
  let resp: Response
  try {
    resp = await fetch(base() + percorso, {
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      signal: segnale(signal, timeoutMs),
      ...resto,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    const scaduta = e instanceof DOMException && e.name === "TimeoutError"
    throw new ApiError(scaduta ? "Il servizio non ha risposto in tempo" : "Servizio non raggiungibile", {
      percorso, dettaglio: e instanceof Error ? e.message : String(e), timeout: scaduta,
    })
  }
  if (!resp.ok) {
    let dettaglio = ""
    try {
      const corpo = await resp.json()
      dettaglio = typeof corpo?.detail === "string" ? corpo.detail : JSON.stringify(corpo)
    } catch { /* corpo non JSON: resta il solo stato */ }
    throw new ApiError(dettaglio || `${resp.status} ${resp.statusText}`, { stato: resp.status, percorso, dettaglio })
  }
  if (resp.status === 204) return undefined as T
  const tipo = resp.headers.get("content-type") || ""
  return (tipo.includes("application/json") ? resp.json() : resp.text()) as Promise<T>
}

// ---------------------------------------------------------------- tipi

export interface Gara {
  slug: string
  nome: string
  regione: string
  anno_prezzario: number
  modello: string
  effort: string
  creato_il: string
  stato: string
  fase_corrente?: number | null
  fasi: Fasi
  prezzario_disponibile: boolean
}

export interface CreaGara {
  slug: string
  nome: string
  regione: string
  anno_prezzario: number
  modello: string
  effort: string
}

export interface Manifest {
  gara?: { nome?: string; CIG?: string; scadenza_offerta?: string | null; [k: string]: unknown }
  [k: string]: unknown
}

export interface StatoPrezzario {
  regione?: string
  anno?: number
  disponibile: boolean
  da_rielaborare?: boolean
}

export interface DettaglioGara {
  manifest: Manifest
  fasi: { fase_corrente?: number; fasi?: Fasi } | Fasi
  attivita: Record<string, unknown>
  prezzario: StatoPrezzario
}

export interface Prezzario {
  regione: string
  anno: number
  importato_il: string
  totale_voci: number
}

export interface StatoAuth {
  disponibile: boolean
  motivo?: string
  stima_scadenza?: { giorni_alla_scadenza_stimata: number; nota: string } | null
}

export interface Documento {
  nome: string
  categoria: string
  dimensione?: number
  caricato_il?: string
  [k: string]: unknown
}

const s = (slug: string) => encodeURIComponent(slug)

// ---------------------------------------------------------------- client

export const Api = {
  ApiError,
  base,

  salute: (o?: Opzioni) => richiesta<{ servizio: string; stato: string }>("/salute", { ...o, timeoutMs: 5_000 }),

  elencoGare: (o?: Opzioni) => richiesta<Gara[]>("/gare", o),
  creaGara: (dati: CreaGara, o?: Opzioni) =>
    richiesta<{ slug: string; creato: boolean }>("/gare", { ...o, method: "POST", body: JSON.stringify(dati), timeoutMs: 60_000 }),
  dettaglioGara: (slug: string, o?: Opzioni) => richiesta<DettaglioGara>(`/gare/${s(slug)}`, o),
  eliminaGara: (slug: string, o?: Opzioni) => richiesta<void>(`/gare/${s(slug)}`, { ...o, method: "DELETE" }),
  runLog: (slug: string, o?: Opzioni) => richiesta<{ runs?: unknown[] }>(`/gare/${s(slug)}/run-log`, o),
  elencoOutput: (slug: string, o?: Opzioni) => richiesta<string[]>(`/gare/${s(slug)}/output`, o),
  percorsoOutput: (slug: string, p: string) => `${base()}/gare/${s(slug)}/output/${p}`,

  /** Testo grezzo di un elaborato: serve alle viste che ne fanno il parsing. */
  async testoOutput(slug: string, p: string, o?: Opzioni): Promise<string> {
    const percorso = `/gare/${s(slug)}/output/${p}`
    const resp = await fetch(base() + percorso, { signal: segnale(o?.signal, o?.timeoutMs ?? TIMEOUT_MS) })
    if (!resp.ok) throw new ApiError(`${resp.status} ${resp.statusText}`, { stato: resp.status, percorso })
    return resp.text()
  },

  esegui: (slug: string, fase: number) => richiesta(`/gare/${s(slug)}/fasi/${fase}/esegui`, { method: "POST" }),
  riesegui: (slug: string, fase: number) => richiesta(`/gare/${s(slug)}/fasi/${fase}/riesegui`, { method: "POST" }),
  approva: (slug: string, fase: number) => richiesta(`/gare/${s(slug)}/fasi/${fase}/approva`, { method: "POST" }),
  registraApprovazione: (slug: string, body: unknown) =>
    richiesta(`/gare/${s(slug)}/approvazioni`, { method: "POST", body: JSON.stringify(body) }),

  elencoDocumenti: (slug: string, o?: Opzioni) => richiesta<Documento[]>(`/gare/${s(slug)}/documenti`, o),

  /** Upload con avanzamento: fetch non lo espone, quindi XMLHttpRequest. */
  caricaDocumento(slug: string, categoria: string, file: File, suProgresso?: (frazione: number) => void, signal?: AbortSignal) {
    const percorso = `/gare/${s(slug)}/documenti?categoria=${encodeURIComponent(categoria)}`
    return new Promise<Documento>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const form = new FormData()
      form.append("file", file)
      xhr.open("POST", base() + percorso)
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && suProgresso) suProgresso(e.loaded / e.total) }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)) } catch { resolve({ nome: file.name, categoria }) }
        } else {
          let dettaglio = ""
          try { dettaglio = JSON.parse(xhr.responseText)?.detail || "" } catch { /* corpo non JSON */ }
          reject(new ApiError(dettaglio || `${xhr.status} ${xhr.statusText}`, { stato: xhr.status, percorso, dettaglio }))
        }
      }
      xhr.onerror = () => reject(new ApiError("Servizio non raggiungibile", { percorso }))
      xhr.onabort = () => reject(new DOMException("Caricamento annullato", "AbortError"))
      signal?.addEventListener("abort", () => xhr.abort())
      xhr.send(form)
    })
  },

  chiediAssistente: (slug: string, messaggio: string) =>
    richiesta(`/gare/${s(slug)}/assistente`, { method: "POST", body: JSON.stringify({ messaggio }), timeoutMs: 180_000 }),
  cronologiaAssistente: (slug: string, o?: Opzioni) => richiesta<unknown[]>(`/gare/${s(slug)}/assistente`, o),

  grafo: (slug: string, o?: Opzioni) => richiesta<{ nodi: unknown[]; archi: unknown[] }>(`/gare/${s(slug)}/grafo`, o),
  elencoDeliverables: (slug: string, o?: Opzioni) => richiesta<unknown[]>(`/gare/${s(slug)}/deliverables`, o),
  eseguiDeliverable: (slug: string, id: string) => richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/esegui`, { method: "POST" }),
  rieseguiDeliverable: (slug: string, id: string) => richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/riesegui`, { method: "POST" }),
  dettaglioProposta: (slug: string, id: string, o?: Opzioni) => richiesta<unknown>(`/gare/${s(slug)}/proposte/${s(id)}`, o),
  elencoProposteOperatore: (slug: string, criterio?: string, o?: Opzioni) =>
    richiesta<unknown[]>(`/gare/${s(slug)}/proposte-operatore${criterio ? `?criterio=${encodeURIComponent(criterio)}` : ""}`, o),
  creaPropostaOperatore: (slug: string, body: unknown) =>
    richiesta(`/gare/${s(slug)}/proposte-operatore`, { method: "POST", body: JSON.stringify(body) }),
  cronologiaInterventi: (slug: string, o?: Opzioni) => richiesta<unknown[]>(`/gare/${s(slug)}/interventi`, o),
  intervieni: (slug: string, messaggio: string) =>
    richiesta(`/gare/${s(slug)}/interventi`, { method: "POST", body: JSON.stringify({ messaggio }), timeoutMs: 600_000 }),

  streamUrl: (slug: string) => `${base()}/gare/${s(slug)}/stream`,
  sistemaAuth: (o?: Opzioni) => richiesta<StatoAuth>("/sistema/auth", o),
  sistemaPrezzari: (o?: Opzioni) => richiesta<Prezzario[]>("/sistema/prezzari", o),
  sistemaPipeline: (o?: Opzioni) => richiesta<{ versione: string; git_ref: string }>("/sistema/pipeline", o),
  importaPrezzario: (regione: string, anno: number) =>
    richiesta("/sistema/prezzari/importa", { method: "POST", body: JSON.stringify({ regione, anno }), timeoutMs: 600_000 }),
  risposteBrief: (slug: string, o?: Opzioni) => richiesta<unknown>(`/gare/${s(slug)}/brief/risposte`, o),
  salvaRisposteBrief: (slug: string, risposte: string[]) =>
    richiesta(`/gare/${s(slug)}/brief/risposte`, { method: "PUT", body: JSON.stringify({ risposte }) }),
  indicazioni: (slug: string, o?: Opzioni) => richiesta<unknown>(`/gare/${s(slug)}/strategia/indicazioni`, o),
  salvaIndicazioni: (slug: string, dati: unknown) =>
    richiesta(`/gare/${s(slug)}/strategia/indicazioni`, { method: "PUT", body: JSON.stringify(dati) }),
}
