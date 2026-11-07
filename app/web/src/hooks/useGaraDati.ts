// Letture della pagina gara: una query per risorsa, tutte sotto la chiave
// ["gara", slug], così un cambio di stato delle fasi le invalida insieme.
// I registri markdown si leggono solo se GET /output li elenca: un file
// assente non viene nemmeno richiesto.

import { useMutation, useMutationState, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import { toast } from "sonner"
import { Api, ApiError, type ElencoGrafiche, type ElencoSchede, type ConsegnaSchede, type Scheda, type TipoScheda, type Grafica, type NuovaPropostaProfessionista, type DettaglioGara, type Documento as DocumentoApi, type Manifest, type StatoPrezzario } from "@/lib/api"
import type { Fasi, JobFase } from "@/dominio/fasi"
import * as Md from "@/lib/md"
import { comeApiError } from "@/lib/risorsa"
import { normalizzaRuns, parseAudit, parseCriteri, parseDocumento, parseGap, parseProposte, type Run, type RunGrezzo } from "@/dominio/registri"

export const chiaviGara = {
  tutto: (slug: string) => ["gara", slug] as const,
  dettaglio: (slug: string) => ["gara", slug, "dettaglio"] as const,
  output: (slug: string) => ["gara", slug, "output"] as const,
  documenti: (slug: string) => ["gara", slug, "documenti"] as const,
  registro: (slug: string, chiave: string) => ["gara", slug, "registro", chiave] as const,
  deliverables: (slug: string) => ["gara", slug, "deliverables"] as const,
  contenutoDeliverable: (slug: string, file: string) => ["gara", slug, "deliverable-file", file] as const,
  grafo: (slug: string) => ["gara", slug, "grafo"] as const,
  runLog: (slug: string) => ["gara", slug, "run-log"] as const,
  avanzamento: (slug: string, chi: string) => ["gara", slug, "avanzamento", chi] as const,
  proposteOperatore: (slug: string) => ["gara", slug, "proposte-operatore"] as const,
  proposteProfessionista: (slug: string) => ["gara", slug, "proposte-professionista"] as const,
  proposta: (slug: string, id: string) => ["gara", slug, "proposta", id] as const,
  approvazioni: (slug: string, fase: number) => ["gara", slug, "approvazioni", fase] as const,
  domande: (slug: string) => ["gara", slug, "domande"] as const,
  assistente: (slug: string) => ["gara", slug, "assistente"] as const,
  interventi: (slug: string) => ["gara", slug, "interventi"] as const,
  grafiche: (slug: string, id: string) => ["gara", slug, "grafiche", id] as const,
  schede: (slug: string, id: string) => ["gara", slug, "schede", id] as const,
  sistema: ["sistema"] as const,
}

export interface GaraNormalizzata {
  manifest: Manifest & { nome?: string; esecuzione?: { modello?: string; effort?: string }; prezzario?: { regione?: string; anno?: number }; criteri_stato?: Record<string, { analizzato?: boolean }>; deliverables?: unknown[] }
  fasi: Fasi
  faseCorrente?: number
  attivita: { agenti_attivi?: Agente[]; agenti_conclusi?: Agente[]; aggiornato_il?: string; [k: string]: unknown }
  prezzario: StatoPrezzario & { da_rielaborare?: { tipo: "fase" | "deliverable"; fase?: number; id?: string; etichetta: string }[] }
}
export interface Agente { agente?: string; descrizione?: string; stato?: string; [k: string]: unknown }

function normalizza(d: DettaglioGara): GaraNormalizzata {
  const f = d.fasi as { fase_corrente?: number; fasi?: Fasi } | Fasi
  const conInvolucro = f && typeof f === "object" && "fasi" in f && typeof (f as { fasi?: unknown }).fasi === "object"
  return {
    manifest: (d.manifest || {}) as GaraNormalizzata["manifest"],
    fasi: (conInvolucro ? (f as { fasi: Fasi }).fasi : (f as Fasi)) || {},
    faseCorrente: conInvolucro ? (f as { fase_corrente?: number }).fase_corrente : undefined,
    attivita: (d.attivita || {}) as GaraNormalizzata["attivita"],
    prezzario: (d.prezzario || { disponibile: true }) as GaraNormalizzata["prezzario"],
  }
}

export function useDettaglioGara(slug: string) {
  return useQuery({
    queryKey: chiaviGara.dettaglio(slug),
    queryFn: ({ signal }) => Api.dettaglioGara(slug, { signal }),
    select: normalizza,
    staleTime: 5_000,
  })
}

export function useOutput(slug: string) {
  return useQuery({ queryKey: chiaviGara.output(slug), queryFn: ({ signal }) => Api.elencoOutput(slug, { signal }), staleTime: 10_000 })
}

export function useDocumenti(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.documenti(slug), queryFn: ({ signal }) => Api.elencoDocumenti(slug, { signal }), enabled: attivo })
}
export type { DocumentoApi }

/** Un registro markdown: il primo fra `percorsi` che GET /output elenca e
    che il parser riconosce. `null` = non ancora prodotto (stato previsto). */
export function useRegistro<T>(slug: string, chiave: string, percorsi: string[], parser: (testo: string) => T | null, attivo = true): UseQueryResult<T | null> {
  const output = useOutput(slug)
  return useQuery({
    queryKey: chiaviGara.registro(slug, chiave),
    enabled: attivo && (output.isSuccess || output.isError),
    queryFn: async ({ signal }) => {
      if (output.isError) throw output.error
      const elenco = output.data || []
      const disponibili = percorsi.filter((p) => elenco.includes(p))
      if (!disponibili.length) return null
      let ultimo: T | null = null
      for (const p of disponibili) {
        try {
          const dati = parser(await Api.testoOutput(slug, p, { signal }))
          if (dati && (!Array.isArray(dati) || dati.length)) return dati
          ultimo = dati
        } catch (e) {
          if (e instanceof ApiError && e.nonProdotto) continue
          throw e
        }
      }
      return ultimo
    },
  })
}

export const useCriteri = (slug: string, attivo = true) =>
  useRegistro(slug, "criteri", ["03_criteria/criteria_matrix.md", "03_criteria/criteria_checklist.md"], parseCriteri, attivo)
export const useAnalisi = (slug: string, attivo = true) =>
  useRegistro(slug, "analisi", ["03_criteria/strategy_audit.md"], parseDocumento, attivo)
export const useGaraBrief = (slug: string, attivo = true) =>
  useRegistro(slug, "brief", ["03_criteria/gara_brief.md"], parseDocumento, attivo)
export const useGap = (slug: string, attivo = true) =>
  useRegistro(slug, "gap", ["06_registers/gap_register.md"], parseGap, attivo)
export const useProposte = (slug: string, attivo = true) =>
  useRegistro(slug, "proposte", ["06_registers/proposal_register.md"], parseProposte, attivo)
export const useAudit = (slug: string, attivo = true) =>
  useRegistro(slug, "audit", ["06_registers/audit_summary.md"], parseAudit, attivo)

/** Stadio di un deliverable: da_produrre, da_approvare, approvato, superato
    (prodotto, ma uno stadio precedente è cambiato dopo). */
export interface StadioDeliverable { id: string; etichetta: string; file: string | null; stato: "da_produrre" | "da_approvare" | "approvato" | "superato"; prodotto_il?: string | null; approvato_il?: string | null }
/** Un documento dell'offerta (non una parte per criterio): `criteri` sono
    quelli che copre. `job.stadio` = stadio accodato o in lavorazione. */
export interface Deliverable {
  id: string; criterio: string; criteri: string[]; trasversale: boolean; nome: string; vincolo_formato: string; fonte: string; tipo: string
  agente: string; skill: string | null; cartella: string; stato?: string; prodotto?: boolean; errore?: string | null; nota?: string | null
  stadi: StadioDeliverable[]; esportazioni: { docx?: string; pdf?: string }; job?: JobFase & { stadio?: string | null }
}
export function useDeliverables(slug: string, attivo = true) {
  return useQuery({
    queryKey: chiaviGara.deliverables(slug), queryFn: ({ signal }) => Api.elencoDeliverables(slug, { signal }) as Promise<Deliverable[]>, enabled: attivo,
    // Lo stream SSE porta le fasi, non i deliverable: finché uno è in coda o
    // gira si rilegge l'elenco, così lo stato resta quello vero.
    refetchInterval: (q) => (q.state.data || []).some((d) => d.job) ? 3_000 : false,
  })
}

export const TIPI_TABELLARI = new Set(["computo_metrico", "elenco_prezzi", "cronoprogramma", "quadro_economico"])
export const tabellare = (d: Deliverable) => TIPI_TABELLARI.has(d.tipo)

/** File prodotti per un deliverable: una cartella per documento, output/10_offer/<id>/. */
export function fileDeliverable(output: string[], d: Deliverable) {
  const cartella = `${d.cartella}/`
  return output.filter((p) => p.startsWith(cartella) && !p.slice(cartella.length).includes("/"))
}

/** Testo di un file di output; `versione` (data di produzione) lo fa rileggere quando cambia. */
export function useTestoOutput(slug: string, percorso: string | null, versione?: string | null) {
  return useQuery({
    queryKey: [...chiaviGara.tutto(slug), "testo", percorso || "", versione || ""],
    queryFn: ({ signal }) => Api.testoOutput(slug, percorso!, { signal }),
    enabled: !!percorso,
  })
}

export interface ContenutoDeliverable { paragrafi: { titolo?: string; testo?: string }[]; sezioni: { titolo: string; parole: number }[] }

export function useContenutoDeliverable(slug: string, file: string | null) {
  return useQuery({
    queryKey: chiaviGara.contenutoDeliverable(slug, file || ""),
    enabled: !!file,
    queryFn: async ({ signal }): Promise<ContenutoDeliverable | null> => {
      const testo = await Api.testoOutput(slug, file!, { signal })
      const paragrafi: ContenutoDeliverable["paragrafi"] = []
      const sezioni: ContenutoDeliverable["sezioni"] = []
      for (const sez of Md.sezioni(testo)) {
        paragrafi.push({ titolo: sez.titolo })
        for (const p of Md.paragrafi(sez.corpo, 3)) paragrafi.push({ testo: p })
        sezioni.push({ titolo: sez.titolo, parole: sez.corpo.split(/\s+/).filter(Boolean).length })
      }
      if (!paragrafi.length) for (const p of Md.paragrafi(testo, 6)) paragrafi.push({ testo: p })
      return paragrafi.length ? { paragrafi, sezioni } : null
    },
  })
}

export interface NodoGrafo { id: string; tipo: string; etichetta?: string; confidence?: string; stato?: string; [k: string]: unknown }
export interface ArcoGrafo { da: string; a: string; tipo?: string; [k: string]: unknown }
export interface Grafo { nodi: NodoGrafo[]; archi: ArcoGrafo[]; orfani?: unknown[]; nodi_senza_frontmatter?: unknown[] }
export function useGrafo(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.grafo(slug), queryFn: ({ signal }) => Api.grafo(slug, { signal }) as Promise<Grafo>, enabled: attivo })
}

export function useRunLog(slug: string, attivo = true) {
  return useQuery({
    queryKey: chiaviGara.runLog(slug),
    queryFn: ({ signal }) => Api.runLog(slug, { signal }) as Promise<{ runs?: RunGrezzo[] }>,
    select: (l): { runs: Run[]; grezzo: unknown } => ({ runs: normalizzaRuns(l.runs || []), grezzo: l }),
    enabled: attivo,
  })
}

export interface PropostaOperatore { id: number; criterio: string; gap_id: string | null; titolo: string; descrizione: string; creato_il: string; stato?: string; esito_audit?: string }
export function useProposteOperatore(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.proposteOperatore(slug), queryFn: ({ signal }) => Api.elencoProposteOperatore(slug, undefined, { signal }) as Promise<PropostaOperatore[]>, enabled: attivo })
}

export const ID_NODO_PROPOSTA = /^P-C\d+-\d+$/
export interface NodoProposta { frontmatter: Record<string, unknown> & { evidence_documents?: { doc?: string; sezione?: string; estratto?: string }[] }; corpo: string; fonte?: "output_criterio" }
/** Nodo del grafo dopo feedback-processor; prima, testo e prove dalla scheda del criterio (fonte "output_criterio"). */
export function useDettaglioProposta(slug: string, id: string | null) {
  return useQuery({
    queryKey: chiaviGara.proposta(slug, id || ""),
    enabled: !!id && ID_NODO_PROPOSTA.test(id),
    queryFn: ({ signal }) => Api.dettaglioProposta(slug, id!, { signal }) as Promise<NodoProposta>,
    retry: false,
  })
}

export interface Domanda {
  id: string
  origine: string
  categoria: string
  criterio: string | null
  testo: string
  perche: string
  fonte: string
  stato: "aperta" | "superata"
  superata_da: string | null
  motivo_superata: string
  creata_il: string
  risposta: string
  risposta_il: string | null
  inviata_il: string | null
}
export interface PrioritaCriterio { id: string; livello: string; indicazione: string }
export interface IndicazioniDomande { tono: string; priorita: PrioritaCriterio[]; vincoli: string[]; opportunita: string[]; note: string; aggiornate_il: string | null; inviate_il: string | null }
export interface RegistroDomande {
  versione: number
  domande: Domanda[]
  indicazioni: IndicazioniDomande
  invii: { inviato_il: string; run_id: string; domande: string[] }[]
  criteri: { id: string; etichetta: string }[]
  mancanti: string[]
  da_inviare: string[]
  etichette: { categorie: Record<string, string>; origini: Record<string, string> }
}
export function useDomande(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.domande(slug), queryFn: ({ signal }) => Api.domande(slug, { signal }) as Promise<RegistroDomande>, enabled: attivo })
}

export interface MessaggioChat { ruolo: string; testo: string; creato_il?: string }
export function useCronologiaAssistente(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.assistente(slug), queryFn: ({ signal }) => Api.cronologiaAssistente(slug, { signal }) as Promise<MessaggioChat[]>, enabled: attivo, retry: false })
}
export function useCronologiaInterventi(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.interventi(slug), queryFn: ({ signal }) => Api.cronologiaInterventi(slug, { signal }) as Promise<MessaggioChat[]>, enabled: attivo, retry: false })
}

export function useSistema(attivo = true) {
  const auth = useQuery({ queryKey: [...chiaviGara.sistema, "auth"], queryFn: ({ signal }) => Api.sistemaAuth({ signal }), enabled: attivo, staleTime: 60_000 })
  const pipeline = useQuery({ queryKey: [...chiaviGara.sistema, "pipeline"], queryFn: ({ signal }) => Api.sistemaPipeline({ signal }), enabled: attivo, staleTime: 5 * 60_000 })
  const prezzari = useQuery({ queryKey: ["sistema", "prezzari"], queryFn: ({ signal }) => Api.sistemaPrezzari({ signal }), enabled: attivo, staleTime: 60_000 })
  return { auth, pipeline, prezzari }
}

// ----------------------------------------------------------------- azioni

/** Dopo ogni azione sulla gara si rilegge tutto: un job accodato cambia
    fasi, run log e, a esecuzione finita, gli elaborati. */
export function useInvalidaGara(slug: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: chiaviGara.tutto(slug) })
}

export function useAzioniFase(slug: string) {
  const invalida = useInvalidaGara(slug)
  const esegui = useMutation({ mutationFn: (n: number) => Api.esegui(slug, n), onSettled: invalida })
  const riesegui = useMutation({ mutationFn: (n: number) => Api.riesegui(slug, n), onSettled: invalida })
  const approva = useMutation({ mutationFn: (n: number) => Api.approva(slug, n), onSettled: invalida })
  return { esegui, riesegui, approva }
}

export function useInterrompiJob(slug: string) {
  const invalida = useInvalidaGara(slug)
  return useMutation({ mutationFn: (jobId: number) => Api.interrompiJob(slug, jobId), onSettled: invalida })
}

export function useDeliverableAzioni(slug: string) {
  const invalida = useInvalidaGara(slug)
  const esegui = useMutation({ mutationFn: (id: string) => Api.eseguiDeliverable(slug, id), onSettled: invalida })
  const riesegui = useMutation({ mutationFn: (id: string) => Api.rieseguiDeliverable(slug, id), onSettled: invalida })
  const approva = useMutation({ mutationFn: (v: { id: string; stadio: string }) => Api.approvaStadio(slug, v.id, v.stadio), onSettled: invalida })
  const modifica = useMutation({ mutationFn: (v: { id: string; stadio: string; nota: string }) => Api.modificaStadio(slug, v.id, v.stadio, v.nota), onSettled: invalida })
  const salva = useMutation({ mutationFn: (v: { id: string; stadio: string; testo: string }) => Api.salvaStadio(slug, v.id, v.stadio, v.testo), onSettled: invalida })
  const rifai = useMutation({ mutationFn: (v: { id: string; stadio: string }) => Api.rifaiStadio(slug, v.id, v.stadio), onSettled: invalida })
  const esporta = useMutation({ mutationFn: (v: { id: string; formato: "docx" | "pdf" }) => Api.esportaDeliverable(slug, v.id, v.formato), onSettled: invalida })
  return { esegui, riesegui, approva, modifica, salva, rifai, esporta }
}

/** Decisioni della Fase 6 salvate nel database: sopravvivono al ricarico della pagina. */
export function useApprovazioni(slug: string, fase = 6) {
  return useQuery({ queryKey: chiaviGara.approvazioni(slug, fase), queryFn: ({ signal }) => Api.elencoApprovazioni(slug, fase, { signal }) })
}

export function useRegistraDecisione(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; decisione: Md.Decisione; nota?: string | null }) =>
      Api.registraApprovazione(slug, { fase: 6, tipo: "proposta", riferimento: v.id, decisione: v.decisione, nota: v.nota || null }),
    // Una decisione cambiata dopo la conferma riapre la Fase 6: anche lo stato delle fasi cambia.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaviGara.approvazioni(slug, 6) })
      void qc.invalidateQueries({ queryKey: chiaviGara.dettaglio(slug) })
    },
  })
}

export function useProposteProfessionista(slug: string, attivo = true) {
  return useQuery({ queryKey: chiaviGara.proposteProfessionista(slug), queryFn: ({ signal }) => Api.elencoProposteProfessionista(slug, { signal }), enabled: attivo })
}
export function useAzioniPropostaProfessionista(slug: string) {
  const qc = useQueryClient()
  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: chiaviGara.proposteProfessionista(slug) })
    void qc.invalidateQueries({ queryKey: chiaviGara.dettaglio(slug) })
  }
  const crea = useMutation({ mutationFn: (body: NuovaPropostaProfessionista) => Api.creaPropostaProfessionista(slug, body), onSuccess: aggiorna })
  const elimina = useMutation({ mutationFn: (id: string) => Api.eliminaPropostaProfessionista(slug, id), onSuccess: aggiorna })
  return { crea, elimina }
}

/** Salva la bozza (solo le risposte cambiate e le indicazioni): non invia. */
export function useSalvaDomande(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { risposte: Record<string, string>; indicazioni: Omit<IndicazioniDomande, "aggiornate_il" | "inviate_il"> }) =>
      Api.salvaDomande(slug, v.risposte, v.indicazioni) as Promise<RegistroDomande>,
    onSuccess: (d) => qc.setQueryData(chiaviGara.domande(slug), d),
  })
}
export function useAggiungiInformazione(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { titolo: string; testo: string; criterio: string | null }) => Api.aggiungiInformazione(slug, body) as Promise<RegistroDomande>,
    onSuccess: (d) => qc.setQueryData(chiaviGara.domande(slug), d),
  })
}
export function useEliminaInformazione(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => Api.eliminaInformazione(slug, id) as Promise<RegistroDomande>,
    onSuccess: (d) => qc.setQueryData(chiaviGara.domande(slug), d),
  })
}
/** Integra nel contesto un documento caricato dopo la Fase 2: un job, nessuna fase rieseguita. */
export function useIntegraDocumento(slug: string) {
  const invalida = useInvalidaGara(slug)
  return useMutation({ mutationFn: (percorso: string) => Api.integraDocumento(slug, percorso), onSettled: invalida })
}
export function useRiallineaBrief(slug: string) {
  const invalida = useInvalidaGara(slug)
  return useMutation({ mutationFn: () => Api.riallineaBrief(slug), onSettled: invalida })
}

export function useCreaPropostaOperatore(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { criterio: string; gap_id: string | null; titolo: string; descrizione: string }) => Api.creaPropostaOperatore(slug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: chiaviGara.proposteOperatore(slug) }),
  })
}

export function useIntervieni(slug: string) {
  const invalida = useInvalidaGara(slug)
  return useMutation({
    mutationFn: (messaggio: string) => Api.intervieni(slug, messaggio) as Promise<{ risposta: string }>,
    // Un intervento può aver toccato file e riaccodato job: si rilegge tutto.
    onSettled: invalida,
  })
}

export function useChiediAssistente(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (messaggio: string) => Api.chiediAssistente(slug, messaggio) as Promise<{ risposta: string }>,
    onSettled: () => qc.invalidateQueries({ queryKey: chiaviGara.assistente(slug) }),
  })
}

const CHIAVE_CARICA_PREZZARIO = ["carica-prezzario"] as const
type CaricaPrezzario = { regione: string; anno: number; file: File }
const stessaEdizione = (v: CaricaPrezzario | undefined, regione: string, anno: number) =>
  !!v && v.regione.trim().toLowerCase() === regione.trim().toLowerCase() && v.anno === anno

/** Prezzario da file PriMus (.dcf), in background: chi lo lancia (nuova
    gara, avviso della gara, menu) può chiudersi o cambiare pagina. Per
    questo le notifiche stanno qui, fra le opzioni della mutation, che
    TanStack esegue anche dopo lo smontaggio del componente; quelle passate
    a mutate() no. Il toast di attesa resta finché l'import non finisce. */
export function useCaricaPrezzario() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: CHIAVE_CARICA_PREZZARIO,
    mutationFn: (v: CaricaPrezzario) => Api.caricaPrezzario(v.regione, v.anno, v.file),
    onMutate: (v) => ({
      toast: toast.loading(`Importo il prezzario ${v.regione} ${v.anno}`, {
        description: "In background: intanto puoi continuare a lavorare. Ti avviso quando è pronto.",
      }),
    }),
    onSuccess: (_d, v, ctx) => {
      toast.success(`Prezzario ${v.regione} ${v.anno} disponibile`, {
        id: ctx?.toast, duration: 15_000,
        description: "Da ora le fasi includono le valutazioni economiche.",
      })
      void qc.invalidateQueries({ queryKey: ["sistema", "prezzari"] })
      void qc.invalidateQueries({ queryKey: ["gare"] })
      void qc.invalidateQueries({ queryKey: ["gara"] })
    },
    onError: (e, v, ctx) => {
      toast.error(`Prezzario ${v.regione} ${v.anno} non importato`, {
        id: ctx?.toast, duration: 30_000, description: comeApiError(e).message,
      })
    },
  })
}

/** Import da file in corso per questa edizione (lanciato da qualunque parte dell'app). */
export function useImportPrezzarioInCorso(regione: string, anno: number) {
  const inCorso = useMutationState({
    filters: { mutationKey: CHIAVE_CARICA_PREZZARIO, status: "pending" },
    select: (m) => m.state.variables as CaricaPrezzario | undefined,
  })
  return inCorso.some((v) => stessaEdizione(v, regione, anno))
}

export function useImportaPrezzario(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { regione: string; anno: number }) => Api.importaPrezzario(v.regione, v.anno),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sistema", "prezzari"] })
      void qc.invalidateQueries({ queryKey: chiaviGara.tutto(slug) })
    },
  })
}

/** Passi dal vivo di un'esecuzione: si interroga solo mentre gira. */
export function useAvanzamento(slug: string, q: { fase?: number; deliverable?: string }, attivo: boolean) {
  return useQuery({
    queryKey: chiaviGara.avanzamento(slug, q.deliverable || `fase-${q.fase}`),
    queryFn: ({ signal }) => Api.avanzamento(slug, q, { signal }),
    enabled: attivo,
    refetchInterval: attivo ? 3_000 : false,
    retry: false,
  })
}

// ------------------------------------------------- grafiche della relazione

/** Elenco delle figure: finché una preparazione o una generazione è in
    corso si rilegge ogni 3 secondi, poi si ferma. */
export function useGrafiche(slug: string, id: string, attivo = true) {
  return useQuery({
    queryKey: chiaviGara.grafiche(slug, id),
    queryFn: ({ signal }) => Api.grafiche(slug, id, { signal }),
    enabled: attivo,
    refetchInterval: (q) => (q.state.data?.grafiche.some((x) => x.operazione) ? 3_000 : false),
  })
}

export function useAzioniGrafiche(slug: string, id: string) {
  const qc = useQueryClient()
  const chiave = chiaviGara.grafiche(slug, id)
  const rileggi = () => qc.invalidateQueries({ queryKey: chiave })
  /** Segna subito l'operazione sulla card (UI ottimistica); l'elenco riletto la conferma o la toglie. */
  const segna = (gid: string, tipo: "prompt" | "immagine") => {
    const prima = qc.getQueryData<ElencoGrafiche>(chiave)
    qc.setQueryData<ElencoGrafiche>(chiave, (d) => d && {
      ...d, grafiche: d.grafiche.map((x) => x.id === gid ? { ...x, operazione: { tipo, avviata_il: new Date().toISOString() }, errore: null } : x),
    })
    return { prima }
  }
  const ripristina = (_e: unknown, _v: unknown, ctx?: { prima?: ElencoGrafiche }) => { if (ctx?.prima) qc.setQueryData(chiave, ctx.prima) }
  const crea = useMutation({ mutationFn: (b: { proposta_id: string; richiesta: string }) => Api.creaGrafica(slug, id, b), onSettled: rileggi })
  const aggiorna = useMutation({
    mutationFn: (v: { gid: string } & Partial<Pick<Grafica, "richiesta" | "prompt" | "didascalia">>) => {
      const { gid, ...campi } = v
      return Api.aggiornaGrafica(slug, id, gid, campi)
    },
    onSettled: rileggi,
  })
  const elimina = useMutation({ mutationFn: (gid: string) => Api.eliminaGrafica(slug, id, gid), onSettled: rileggi })
  const prompt = useMutation({
    mutationFn: (gid: string) => Api.preparaPromptGrafica(slug, id, gid),
    onMutate: (gid) => segna(gid, "prompt"), onError: ripristina, onSettled: rileggi,
  })
  const genera = useMutation({
    mutationFn: (gid: string) => Api.generaImmagineGrafica(slug, id, gid),
    onMutate: (gid) => segna(gid, "immagine"), onError: ripristina, onSettled: rileggi,
  })
  const carica = useMutation({
    mutationFn: (v: { gid: string; file: File; suProgresso?: (f: number) => void }) => Api.caricaImmagineGrafica(slug, id, v.gid, v.file, v.suProgresso),
    onSettled: rileggi,
  })
  return { crea, aggiorna, elimina, prompt, genera, carica }
}

// ------------------------------------------------- schede tecniche della relazione

/** Elenco delle schede: finché la proposta dell'elenco o una ricerca è in
    corso si rilegge ogni 3 secondi, poi si ferma. */
export function useSchede(slug: string, id: string, attivo = true) {
  return useQuery({
    queryKey: chiaviGara.schede(slug, id),
    queryFn: ({ signal }) => Api.schede(slug, id, { signal }),
    enabled: attivo,
    refetchInterval: (q) => (q.state.data && (q.state.data.operazione || q.state.data.schede.some((x) => x.operazione)) ? 3_000 : false),
  })
}

export function useAzioniSchede(slug: string, id: string) {
  const qc = useQueryClient()
  const chiave = chiaviGara.schede(slug, id)
  const rileggi = () => qc.invalidateQueries({ queryKey: chiave })
  const ottimista = (fn: (d: ElencoSchede) => ElencoSchede) => {
    const prima = qc.getQueryData<ElencoSchede>(chiave)
    qc.setQueryData<ElencoSchede>(chiave, (d) => d && fn(d))
    return { prima }
  }
  const ripristina = (_e: unknown, _v: unknown, ctx?: { prima?: ElencoSchede }) => { if (ctx?.prima) qc.setQueryData(chiave, ctx.prima) }
  const ora = () => new Date().toISOString()
  const proponi = useMutation({
    mutationFn: () => Api.proponiSchede(slug, id),
    onMutate: () => ottimista((d) => ({ ...d, operazione: { tipo: "proponi", avviata_il: ora() }, errore: null })),
    onError: ripristina, onSettled: rileggi,
  })
  const consegna = useMutation({
    mutationFn: (c: ConsegnaSchede) => Api.consegnaSchede(slug, id, c),
    onMutate: (c) => ottimista((d) => ({ ...d, consegna: c })), onError: ripristina, onSettled: rileggi,
  })
  const crea = useMutation({ mutationFn: (b: { proposta_id: string; oggetto: string; tipo: TipoScheda; documenta?: string }) => Api.creaScheda(slug, id, b), onSettled: rileggi })
  const aggiorna = useMutation({
    mutationFn: (v: { sid: string } & Partial<Pick<Scheda, "inclusa" | "oggetto" | "tipo" | "documenta" | "produttore" | "modello">>) => {
      const { sid, ...campi } = v
      return Api.aggiornaScheda(slug, id, sid, campi)
    },
    // L'inclusione cambia subito nella lista: è il gesto più frequente del pannello.
    onMutate: (v) => ottimista((d) => ({ ...d, schede: d.schede.map((x) => (x.id === v.sid ? { ...x, ...v } : x)) })),
    onError: ripristina, onSettled: rileggi,
  })
  const elimina = useMutation({ mutationFn: (sid: string) => Api.eliminaScheda(slug, id, sid), onSettled: rileggi })
  const cerca = useMutation({
    mutationFn: (sid: string) => Api.cercaScheda(slug, id, sid),
    onMutate: (sid) => ottimista((d) => ({ ...d, schede: d.schede.map((x) => (x.id === sid ? { ...x, operazione: { tipo: "cerca", avviata_il: ora() }, errore: null } : x)) })),
    onError: ripristina, onSettled: rileggi,
  })
  const usa = useMutation({ mutationFn: (v: { sid: string; indice: number }) => Api.usaCandidatoScheda(slug, id, v.sid, v.indice), onSettled: rileggi })
  const carica = useMutation({
    mutationFn: (v: { sid: string; file: File; suProgresso?: (f: number) => void }) => Api.caricaFileScheda(slug, id, v.sid, v.file, v.suProgresso),
    onSettled: rileggi,
  })
  return { proponi, consegna, crea, aggiorna, elimina, cerca, usa, carica }
}

export function useOpenAI(attivo = true) {
  return useQuery({ queryKey: [...chiaviGara.sistema, "openai"], queryFn: ({ signal }) => Api.statoOpenAI({ signal }), enabled: attivo, staleTime: 60_000 })
}

/** Dopo un cambio della chiave si rileggono lo stato e gli elenchi delle figure (modalità automatica o manuale). */
export function useAzioniOpenAI() {
  const qc = useQueryClient()
  const aggiorna = (d: unknown) => {
    qc.setQueryData([...chiaviGara.sistema, "openai"], d)
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "gara" && q.queryKey[2] === "grafiche" })
  }
  const salva = useMutation({ mutationFn: (b: { chiave?: string; modello?: string }) => Api.salvaOpenAI(b), onSuccess: aggiorna })
  const rimuovi = useMutation({ mutationFn: () => Api.rimuoviOpenAI(), onSuccess: aggiorna })
  const verifica = useMutation({ mutationFn: () => Api.verificaOpenAI() })
  return { salva, rimuovi, verifica }
}
