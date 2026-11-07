// Client del backend FastAPI. Porting tipizzato di api.js del frontend precedente.
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
      // Con FormData il Content-Type (multipart, con boundary) lo mette il browser.
      headers: resto.body instanceof FormData ? headers : { "Content-Type": "application/json", ...(headers || {}) },
      signal: segnale(signal, timeoutMs),
      ...resto,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    const scaduta = e instanceof DOMException && e.name === "TimeoutError"
    throw new ApiError(scaduta ? "Il servizio non ha risposto in tempo" : "Servizio non raggiungibile", {
      percorso, timeout: scaduta,
      dettaglio: scaduta ? `Nessuna risposta entro ${Math.round(timeoutMs / 1000)} secondi.` : "Connessione al servizio non riuscita: il backend potrebbe essere spento o la rete assente.",
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

export type ModalitaAssistente = "rapida" | "approfondita"
/** Eventi di /assistente/stream: «stato» viene da uno strumento davvero usato. */
export type EventoAssistente =
  | { tipo: "stato"; testo: string }
  | { tipo: "nuovo" }
  | { tipo: "testo"; delta: string }
  | { tipo: "fine"; risposta: string }
  | { tipo: "errore"; messaggio: string }

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

/** Login di Claude dall'interfaccia (backend: login_claude.py). */
export interface StatoLoginClaude extends StatoAuth {
  metodo?: "oauth_token" | "login_config_dedicata"
  account?: string | null
  /** Nome dell'account collegato (profilo Claude), se noto. */
  nome?: string | null
  abbonamento?: string | null
  login: { fase: "inattivo" | "in_attesa" | "concluso" | "fallito"; url: string | null; codice_inviato: boolean; messaggio: string }
}

export interface Avanzamento {
  run_id: string; fase: number | null; criterio: string | null; deliverable_id: string | null
  avviato_il: string | null; aggiornato_il: string | null
  /** Passo in corso e i precedenti, dal più recente: frasi già leggibili. */
  attuale: string | null; precedenti: string[]
}

export interface NuovaPropostaProfessionista { criterio: string; sottocriterio: string | null; gap_id: string | null; titolo: string; descrizione: string }
/** `elaborata`: è già un nodo del grafo (dopo la conferma), non si toglie più. */
export interface PropostaProfessionista extends NuovaPropostaProfessionista { id: string; creato_il: string; elaborata: boolean }

export interface ApprovazioneRegistrata {
  riferimento: string | null
  tipo: "direttive" | "proposta" | "offerta"
  fase: number
  decisione: "approvata" | "da_modificare" | "scartata" | null
  nota: string | null
  creato_il: string
}

export interface Documento {
  nome_file: string
  percorso: string
  categoria: string
  caricato_il: string
  dimensione?: number
  /** Opzionale: se il backend non lo riporta, l'assenza del campo non è un'assenza del file. */
  presente?: boolean
  /** Dove sta rispetto al contesto della gara: "fase" (lo legge la Fase 2),
      "da_integrare", "in_coda", "in_corso", "integrato", "errore". */
  contesto?: string | null
  errore_integrazione?: string | null
}

/** Grafiche della relazione tecnica (Fase 7), una o più per proposta approvata. */
export interface PropostaPerGrafica { id: string; titolo: string; sottocriterio: string; criterio: string }
export interface ErroreGrafica {
  /** chiave, credito, rifiuto, rete, modello: errori di OpenAI; interrotta: riavvio di SPADA; altro. */
  tipo: string
  operazione: "prompt" | "immagine"
  messaggio: string
}
export interface Grafica {
  id: string
  proposta_id: string
  proposta_approvata: boolean
  richiesta: string
  prompt: string
  didascalia: string
  note_prompt: string
  prompt_preparato_il: string | null
  immagine: { origine: "openai" | "caricata"; modello: string | null; caricata_il: string; nome: string } | null
  operazione: { tipo: "prompt" | "immagine"; avviata_il: string } | null
  errore: ErroreGrafica | null
  /** Per bozza e definitivo: true se il testo ha il segnaposto, null se il testo non c'è ancora. */
  collocata: Record<string, boolean | null>
  avvisi: string[]
  creata_il: string
}
export interface ElencoGrafiche {
  proposte: PropostaPerGrafica[]
  grafiche: Grafica[]
  openai: { configurata: boolean; modello: string }
  testi: Record<string, boolean>
}
/** Schede tecniche della relazione (Fase 7): SPADA propone, il professionista sceglie quali allegare. */
export type TipoScheda = "scheda_tecnica" | "epd" | "dop" | "certificato" | "rapporto_prova"
export type ConsegnaSchede = "in_coda" | "file" | "zip"
export interface CandidatoScheda { produttore: string; modello: string; url_pdf: string; url_pagina: string; verifica: string }
export interface Scheda {
  id: string
  proposta_id: string
  proposta_approvata: boolean
  oggetto: string
  tipo: TipoScheda
  documenta: string
  origine: "spada" | "professionista"
  inclusa: boolean
  produttore: string
  modello: string
  file: { nome: string; fonte: { tipo: "caricata" | "online"; url?: string; pagina?: string; nome_originale?: string } | null; caricato_il: string; pagine: number | null; avvisi: string[] } | null
  candidati: CandidatoScheda[]
  note_ricerca: string
  operazione: { tipo: "cerca"; avviata_il: string } | null
  errore: { tipo: string; operazione: string; messaggio: string } | null
  /** Per bozza e definitivo: true se il testo la cita, null se il testo non c'è ancora. */
  citata: Record<string, boolean | null>
}
export interface ElencoSchede {
  proposte: PropostaPerGrafica[]
  schede: Scheda[]
  tipi: Record<TipoScheda, string>
  consegna: ConsegnaSchede
  consegne: Record<ConsegnaSchede, string>
  proposta_il: string | null
  operazione: { tipo: "proponi"; avviata_il: string } | null
  errore: { tipo: string; operazione: string; messaggio: string } | null
  testi: Record<string, boolean>
  /** File dell'ultima esportazione (ZIP o PDF sciolti), sotto output/. */
  consegnati: string[]
}
export interface StatoOpenAI { configurata: boolean; chiave: string | null; modello: string; origine: "impostazioni" | "ambiente" | null }

const s = (slug: string) => encodeURIComponent(slug)

/** POST multipart con avanzamento dell'upload: fetch non lo espone. */
function inviaConProgresso<T>(percorso: string, form: FormData, suProgresso?: (frazione: number) => void, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", base() + percorso)
    xhr.timeout = 120_000
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && suProgresso) suProgresso(e.loaded / e.total) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) } catch { resolve(undefined as T) }
        return
      }
      let dettaglio = ""
      try { dettaglio = JSON.parse(xhr.responseText)?.detail || "" } catch { /* corpo non JSON */ }
      reject(new ApiError(dettaglio || `${xhr.status} ${xhr.statusText}`, { stato: xhr.status, percorso, dettaglio }))
    }
    xhr.onerror = () => reject(new ApiError("Servizio non raggiungibile", { percorso }))
    xhr.ontimeout = () => reject(new ApiError("Il servizio non ha risposto in tempo", { percorso, timeout: true }))
    xhr.onabort = () => reject(new DOMException("Caricamento annullato", "AbortError"))
    signal?.addEventListener("abort", () => xhr.abort())
    xhr.send(form)
  })
}
const g = (slug: string, id: string) => `/gare/${s(slug)}/deliverables/${s(id)}/grafiche`
const sch = (slug: string, id: string) => `/gare/${s(slug)}/deliverables/${s(id)}/schede`

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
  /** Cosa sta facendo adesso una fase o un deliverable in esecuzione (null se nulla gira). */
  avanzamento: (slug: string, q: { fase?: number; deliverable?: string }, o?: Opzioni) =>
    richiesta<Avanzamento | null>(`/gare/${s(slug)}/avanzamento?${q.deliverable ? `deliverable=${encodeURIComponent(q.deliverable)}` : `fase=${q.fase}`}`, o),
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
  /** «Interrompi» una fase o un deliverable: in coda la toglie, in corso la
      ferma. Rieseguirla con `esegui` riprende da dove si era fermata. */
  interrompiJob: (slug: string, jobId: number) => richiesta(`/gare/${s(slug)}/job/${jobId}/interrompi`, { method: "POST" }),
  /** Storico delle decisioni, dalla più vecchia: per riferimento vale l'ultima. */
  elencoApprovazioni: (slug: string, fase: number, o?: Opzioni) =>
    richiesta<ApprovazioneRegistrata[]>(`/gare/${s(slug)}/approvazioni?fase=${fase}`, o),
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
          try { resolve(JSON.parse(xhr.responseText)) } catch { resolve({ nome_file: file.name, percorso: "", categoria, caricato_il: new Date().toISOString() }) }
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
  /** Risposta dell'assistente mentre viene scritta (NDJSON, un evento per
      riga). Nessun timeout: una ricerca approfondita può durare minuti; si
      interrompe con `signal`. */
  streamAssistente: async (slug: string, messaggio: string, modalita: ModalitaAssistente, onEvento: (e: EventoAssistente) => void, signal: AbortSignal) => {
    const percorso = `/gare/${s(slug)}/assistente/stream`
    let resp: Response
    try {
      resp = await fetch(base() + percorso, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messaggio, modalita }), signal })
    } catch (e) {
      if (signal.aborted) throw e
      throw new ApiError("Servizio non raggiungibile", { percorso, dettaglio: "Connessione al servizio non riuscita: il backend potrebbe essere spento." })
    }
    if (!resp.ok || !resp.body) {
      let dettaglio = ""
      try { const c = await resp.json(); dettaglio = typeof c?.detail === "string" ? c.detail : "" } catch { /* corpo non JSON */ }
      throw new ApiError(dettaglio || `${resp.status} ${resp.statusText}`, { stato: resp.status, percorso, dettaglio })
    }
    const lettore = resp.body.pipeThrough(new TextDecoderStream()).getReader()
    let resto = ""
    for (;;) {
      const { value, done } = await lettore.read()
      if (done) break
      resto += value
      const righe = resto.split("\n")
      resto = righe.pop() || ""
      for (const r of righe) if (r.trim()) onEvento(JSON.parse(r) as EventoAssistente)
    }
    if (resto.trim()) onEvento(JSON.parse(resto) as EventoAssistente)
  },

  grafo: (slug: string, o?: Opzioni) => richiesta<{ nodi: unknown[]; archi: unknown[] }>(`/gare/${s(slug)}/grafo`, o),
  elencoDeliverables: (slug: string, o?: Opzioni) => richiesta<unknown[]>(`/gare/${s(slug)}/deliverables`, o),
  eseguiDeliverable: (slug: string, id: string) => richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/esegui`, { method: "POST" }),
  rieseguiDeliverable: (slug: string, id: string) => richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/riesegui`, { method: "POST" }),
  /** Stadi di un deliverable (scaletta → bozza → definitivo): approvare
      accoda lo stadio successivo; «modifica» lo fa riscrivere con la nota. */
  approvaStadio: (slug: string, id: string, stadio: string) =>
    richiesta<{ job_id?: number | null; successivo?: string }>(`/gare/${s(slug)}/deliverables/${s(id)}/stadi/${s(stadio)}/approva`, { method: "POST" }),
  modificaStadio: (slug: string, id: string, stadio: string, nota: string) =>
    richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/stadi/${s(stadio)}/modifica`, { method: "POST", body: JSON.stringify({ nota }) }),
  /** Rifà da zero un solo stadio con i dati attuali; i successivi tornano da produrre. */
  rifaiStadio: (slug: string, id: string, stadio: string) =>
    richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/stadi/${s(stadio)}/rifai`, { method: "POST" }),
  salvaStadio: (slug: string, id: string, stadio: string, testo: string) =>
    richiesta(`/gare/${s(slug)}/deliverables/${s(id)}/stadi/${s(stadio)}`, { method: "PUT", body: JSON.stringify({ testo }) }),
  esportaDeliverable: (slug: string, id: string, formato: "docx" | "pdf") =>
    richiesta<{ percorso: string }>(`/gare/${s(slug)}/deliverables/${s(id)}/esporta?formato=${formato}`, { method: "POST", timeoutMs: 200_000 }),
  dettaglioProposta: (slug: string, id: string, o?: Opzioni) => richiesta<unknown>(`/gare/${s(slug)}/proposte/${s(id)}`, o),
  elencoProposteOperatore: (slug: string, criterio?: string, o?: Opzioni) =>
    richiesta<unknown[]>(`/gare/${s(slug)}/proposte-operatore${criterio ? `?criterio=${encodeURIComponent(criterio)}` : ""}`, o),
  creaPropostaOperatore: (slug: string, body: unknown) =>
    richiesta(`/gare/${s(slug)}/proposte-operatore`, { method: "POST", body: JSON.stringify(body) }),
  /** Fase 6: proposte scritte dal professionista, approvate per definizione. */
  elencoProposteProfessionista: (slug: string, o?: Opzioni) =>
    richiesta<PropostaProfessionista[]>(`/gare/${s(slug)}/proposte-professionista`, o),
  creaPropostaProfessionista: (slug: string, body: NuovaPropostaProfessionista) =>
    richiesta<PropostaProfessionista>(`/gare/${s(slug)}/proposte-professionista`, { method: "POST", body: JSON.stringify(body) }),
  eliminaPropostaProfessionista: (slug: string, id: string) =>
    richiesta<void>(`/gare/${s(slug)}/proposte-professionista/${s(id)}`, { method: "DELETE" }),
  cronologiaInterventi: (slug: string, o?: Opzioni) => richiesta<unknown[]>(`/gare/${s(slug)}/interventi`, o),
  intervieni: (slug: string, messaggio: string) =>
    richiesta(`/gare/${s(slug)}/interventi`, { method: "POST", body: JSON.stringify({ messaggio }), timeoutMs: 600_000 }),

  streamUrl: (slug: string) => `${base()}/gare/${s(slug)}/stream`,
  sistemaAuth: (o?: Opzioni) => richiesta<StatoAuth>("/sistema/auth", o),
  loginClaude: (o?: Opzioni) => richiesta<StatoLoginClaude>("/sistema/auth/login", o),
  avviaLoginClaude: () => richiesta<StatoLoginClaude>("/sistema/auth/login", { method: "POST", timeoutMs: 30_000 }),
  codiceLoginClaude: (codice: string) =>
    richiesta<StatoLoginClaude>("/sistema/auth/login/codice", { method: "POST", body: JSON.stringify({ codice }), timeoutMs: 30_000 }),
  annullaLoginClaude: () => richiesta<StatoLoginClaude>("/sistema/auth/login", { method: "DELETE" }),
  esciClaude: () => richiesta<StatoLoginClaude>("/sistema/auth/logout", { method: "POST", timeoutMs: 30_000 }),
  sistemaPrezzari: (o?: Opzioni) => richiesta<Prezzario[]>("/sistema/prezzari", o),
  sistemaPipeline: (o?: Opzioni) => richiesta<{ versione: string; git_ref: string }>("/sistema/pipeline", o),
  importaPrezzario: (regione: string, anno: number) =>
    richiesta("/sistema/prezzari/importa", { method: "POST", body: JSON.stringify({ regione, anno }), timeoutMs: 600_000 }),
  /** File PriMus (.dcf) pubblicato dalla regione: conversione e import lato server. */
  caricaPrezzario: (regione: string, anno: number, file: File) => {
    const corpo = new FormData()
    corpo.append("regione", regione)
    corpo.append("anno", String(anno))
    corpo.append("file", file)
    return richiesta("/sistema/prezzari/carica", { method: "POST", body: corpo, timeoutMs: 900_000 })
  },
  // Fase 4, registro unico delle domande. Salvare non invia: le risposte
  // entrano nel contesto solo eseguendo la Fase 4.
  domande: (slug: string, o?: Opzioni) => richiesta<unknown>(`/gare/${s(slug)}/domande`, o),
  salvaDomande: (slug: string, risposte: Record<string, string>, indicazioni: unknown) =>
    richiesta<unknown>(`/gare/${s(slug)}/domande`, { method: "PUT", body: JSON.stringify({ risposte, indicazioni }) }),
  aggiungiInformazione: (slug: string, body: { titolo: string; testo: string; criterio: string | null }) =>
    richiesta<unknown>(`/gare/${s(slug)}/domande/informazioni`, { method: "POST", body: JSON.stringify(body) }),
  eliminaInformazione: (slug: string, id: string) =>
    richiesta<unknown>(`/gare/${s(slug)}/domande/${s(id)}`, { method: "DELETE" }),
  // Integrazioni fuori fase (dopo la Fase 2): nessuna fase rieseguita.
  integraDocumento: (slug: string, percorso: string) =>
    richiesta(`/gare/${s(slug)}/documenti/integra`, { method: "POST", body: JSON.stringify({ percorso }) }),
  riallineaBrief: (slug: string) => richiesta(`/gare/${s(slug)}/brief/riallinea`, { method: "POST" }),

  // Grafiche della relazione tecnica. Prompt e immagine si preparano in
  // background (202): l'elenco riporta l'operazione in corso e l'esito.
  grafiche: (slug: string, id: string, o?: Opzioni) => richiesta<ElencoGrafiche>(g(slug, id), o),
  creaGrafica: (slug: string, id: string, body: { proposta_id: string; richiesta: string }) =>
    richiesta<{ id: string }>(g(slug, id), { method: "POST", body: JSON.stringify(body) }),
  aggiornaGrafica: (slug: string, id: string, gid: string, body: Partial<Pick<Grafica, "richiesta" | "prompt" | "didascalia">>) =>
    richiesta<{ id: string }>(`${g(slug, id)}/${s(gid)}`, { method: "PATCH", body: JSON.stringify(body) }),
  eliminaGrafica: (slug: string, id: string, gid: string) => richiesta<void>(`${g(slug, id)}/${s(gid)}`, { method: "DELETE" }),
  preparaPromptGrafica: (slug: string, id: string, gid: string) => richiesta(`${g(slug, id)}/${s(gid)}/prompt`, { method: "POST" }),
  generaImmagineGrafica: (slug: string, id: string, gid: string) => richiesta(`${g(slug, id)}/${s(gid)}/genera`, { method: "POST" }),
  caricaImmagineGrafica: (slug: string, id: string, gid: string, file: File, suProgresso?: (frazione: number) => void) => {
    const form = new FormData()
    form.append("file", file)
    return inviaConProgresso<{ id: string }>(`${g(slug, id)}/${s(gid)}/immagine`, form, suProgresso)
  },
  /** `versione` (data dell'immagine) cambia l'URL a ogni immagine nuova. */
  urlImmagineGrafica: (slug: string, id: string, gid: string, versione: string) =>
    `${base()}${g(slug, id)}/${s(gid)}/immagine?v=${encodeURIComponent(versione)}`,

  // Schede tecniche della relazione. Proposta dell'elenco e ricerca online
  // girano in background (202): l'elenco riporta l'operazione e l'esito.
  schede: (slug: string, id: string, o?: Opzioni) => richiesta<ElencoSchede>(sch(slug, id), o),
  proponiSchede: (slug: string, id: string) => richiesta(`${sch(slug, id)}/proponi`, { method: "POST" }),
  consegnaSchede: (slug: string, id: string, consegna: ConsegnaSchede) =>
    richiesta(`${sch(slug, id)}/consegna`, { method: "PUT", body: JSON.stringify({ consegna }) }),
  creaScheda: (slug: string, id: string, body: { proposta_id: string; oggetto: string; tipo: TipoScheda; documenta?: string }) =>
    richiesta<{ id: string }>(sch(slug, id), { method: "POST", body: JSON.stringify(body) }),
  aggiornaScheda: (slug: string, id: string, sid: string, body: Partial<Pick<Scheda, "inclusa" | "oggetto" | "tipo" | "documenta" | "produttore" | "modello">>) =>
    richiesta<{ id: string }>(`${sch(slug, id)}/${s(sid)}`, { method: "PATCH", body: JSON.stringify(body) }),
  eliminaScheda: (slug: string, id: string, sid: string) => richiesta<void>(`${sch(slug, id)}/${s(sid)}`, { method: "DELETE" }),
  cercaScheda: (slug: string, id: string, sid: string) => richiesta(`${sch(slug, id)}/${s(sid)}/cerca`, { method: "POST" }),
  usaCandidatoScheda: (slug: string, id: string, sid: string, indice: number) =>
    richiesta<{ id: string }>(`${sch(slug, id)}/${s(sid)}/usa`, { method: "POST", body: JSON.stringify({ indice }), timeoutMs: 120_000 }),
  caricaFileScheda: (slug: string, id: string, sid: string, file: File, suProgresso?: (frazione: number) => void) => {
    const form = new FormData()
    form.append("file", file)
    return inviaConProgresso<{ id: string }>(`${sch(slug, id)}/${s(sid)}/file`, form, suProgresso)
  },
  /** `versione` (data del file) cambia l'URL a ogni PDF nuovo. */
  urlFileScheda: (slug: string, id: string, sid: string, versione: string) =>
    `${base()}${sch(slug, id)}/${s(sid)}/file?v=${encodeURIComponent(versione)}`,

  // Generazione immagini con OpenAI: la chiave torna sempre mascherata.
  statoOpenAI: (o?: Opzioni) => richiesta<StatoOpenAI>("/sistema/openai", o),
  salvaOpenAI: (body: { chiave?: string; modello?: string }) =>
    richiesta<StatoOpenAI>("/sistema/openai", { method: "PUT", body: JSON.stringify(body) }),
  rimuoviOpenAI: () => richiesta<StatoOpenAI>("/sistema/openai", { method: "DELETE" }),
  verificaOpenAI: () => richiesta<{ ok: boolean; messaggio: string; tipo?: string }>("/sistema/openai/verifica", { method: "POST", timeoutMs: 30_000 }),
}
