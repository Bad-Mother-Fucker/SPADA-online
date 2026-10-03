// Vocabolario condiviso: le 8 fasi, gli stati, le categorie. Porting di
// app/frontend/js/dominio.js. Le viste non devono mai conoscere le chiavi
// della pipeline: la mappa sta qui, in un posto solo.

export type StatoFase = "completata" | "da_rivedere" | "in_esecuzione" | "errore" | "in_coda"
export type StatoGara = StatoFase

export interface CorpoFase {
  stato?: string
  richiede_approvazione?: boolean
  iniziata_il?: string | null
  conclusa_il?: string | null
  [k: string]: unknown
}
export type Fasi = Record<string, CorpoFase>

export interface Fase {
  n: number
  num: string
  chiave: string
  titolo: string
  kicker: string
  testata: string
  sottotitolo: string
}

export const FASI: readonly Fase[] = [
  { n: 1, num: "01", chiave: "1_acquisizione_documenti", titolo: "Acquisizione documenti", kicker: "Fase 1, acquisizione", testata: "Documenti di gara",
    sottotitolo: "Categorie separate perché la pipeline le tratta in modo diverso: il disciplinare guida i requisiti, gli elaborati l'analisi tecnica, i P7M richiedono verifica di firma." },
  { n: 2, num: "02", chiave: "2_costruzione_grafo", titolo: "Analisi elaborati", kicker: "Fase 2, elaborati", testata: "Criteri ed elaborati",
    sottotitolo: "Gli elaborati letti e collegati nel grafo ai criteri del disciplinare. Da qui l'assistente conversazionale è attivo." },
  { n: 3, num: "03", chiave: "3_analisi_strategica", titolo: "Analisi strategica", kicker: "Fase 3, audit strategico", testata: "Audit strategico",
    sottotitolo: "Quattro analisi sui dati della gara: budget sicurezza, prezzi rispetto al prezzario, viabilità del cantiere, margine per le migliorie." },
  { n: 4, num: "04", chiave: "4_domande_professionista", titolo: "Domande al professionista", kicker: "Fase 4, gate", testata: "Domande e indicazioni del professionista",
    sottotitolo: "Tutte le domande in un posto. Quando esegui la fase, risposte e indicazioni entrano nel contesto della gara." },
  { n: 5, num: "05", chiave: "5_elaborazione_criteri", titolo: "Ricerca soluzioni", kicker: "Fase 5, gap e prove", testata: "Gap rilevati",
    sottotitolo: "Distanza fra ciò che la gara richiede e ciò che l'offerta dimostra oggi. Ogni gap è ancorato alle prove documentali raccolte." },
  { n: 6, num: "06", chiave: "6_revisione_proposte", titolo: "Revisione proposte", kicker: "Fase 6, checkpoint umano", testata: "Revisione delle proposte tecniche",
    sottotitolo: "Decisione proposta per proposta: approvate entrano nei deliverable, rimandate tornano agli agenti con la tua nota, scartate restano nello storico." },
  { n: 7, num: "07", chiave: "7_stesura_offerta", titolo: "Deliverables", kicker: "Fase 7, deliverables", testata: "Deliverable richiesti",
    sottotitolo: "Elenco ricavato dal disciplinare di questa gara, non un modello fisso. Ogni deliverable ha agente e skill propri e può girare in parallelo." },
  { n: 8, num: "08", chiave: "8_approvazione_finale", titolo: "Audit e consegna", kicker: "Fase 8, audit di consegna", testata: "Audit formale del plico",
    sottotitolo: "Verifica di completezza e consegnabilità, non una seconda verifica delle prove, già svolta in Fase 5 e 6." },
]

/** Checkpoint senza agente: si chiudono approvando. La Fase 4 (domande al
    professionista) si chiude eseguendola, cioè inviando le risposte. */
export const GATE_UMANO: ReadonlySet<number> = new Set([6, 8])

/** tono = token di colore di stato (DESIGN.md §2); etichetta = come si legge. */
export type Tono = "run" | "attn" | "ok" | "crit" | "neu"

export const STATO: Record<StatoFase, { tono: Tono; etichetta: string; breve: string }> = {
  completata:    { tono: "ok",   etichetta: "Completata",               breve: "completata" },
  da_rivedere:   { tono: "attn", etichetta: "Richiede la tua decisione", breve: "da rivedere" },
  in_esecuzione: { tono: "run",  etichetta: "In esecuzione",            breve: "in esecuzione" },
  errore:        { tono: "crit", etichetta: "Errore",                   breve: "errore" },
  in_coda:       { tono: "neu",  etichetta: "Non ancora eseguita",      breve: "in coda" },
}

/** Stati della gara nell'elenco, con l'etichetta usata nei filtri. */
export const STATO_GARA: Record<StatoGara, { tono: Tono; etichetta: string }> = {
  da_rivedere:   { tono: "attn", etichetta: "Da rivedere" },
  in_esecuzione: { tono: "run",  etichetta: "In esecuzione" },
  completata:    { tono: "ok",   etichetta: "Completata" },
  errore:        { tono: "crit", etichetta: "Errore" },
  in_coda:       { tono: "neu",  etichetta: "In coda" },
}

export const fase = (n: number): Fase => FASI.find((f) => f.n === n) ?? FASI[0]

/** La pipeline scrive "da_eseguire"; il design lo chiama "in coda". */
export function normalizzaStato(st?: string | null): StatoFase {
  if (!st) return "in_coda"
  if (st === "da_eseguire") return "in_coda"
  if (st === "completato") return "completata"
  return (st in STATO ? st : "in_coda") as StatoFase
}

/** Corpo della fase n dentro fasi.json, indipendente dal suffisso della chiave. */
export function corpoFase(fasi: Fasi | null | undefined, n: number): CorpoFase | null {
  if (!fasi) return null
  const attesa = fase(n)
  if (fasi[attesa.chiave]) return fasi[attesa.chiave]
  const k = Object.keys(fasi).find((x) => x.startsWith(`${n}_`))
  return k ? fasi[k] : null
}

export function statoFase(fasi: Fasi | null | undefined, n: number): StatoFase {
  const c = corpoFase(fasi, n)
  if (!c) return "in_coda"
  // Una fase che attende un'approvazione non è "completata": chiede una
  // decisione, e l'interfaccia deve dirlo con il colore dell'attenzione.
  if (c.richiede_approvazione) return "da_rivedere"
  return normalizzaStato(c.stato)
}

/** Ogni fase sblocca la successiva. Stesso vincolo applicato dal backend. */
export function sbloccata(fasi: Fasi | null | undefined, n: number): boolean {
  if (n <= 1) return true
  if (statoFase(fasi, n) !== "in_coda") return true
  return statoFase(fasi, n - 1) === "completata"
}

/** Si può aprire la vista della fase n? Come `sbloccata`, tranne la Fase 4:
    le domande arrivano già dalla Fase 1 (sopralluogo, quesiti con scadenza)
    e il professionista deve poter rispondere in bozza prima che l'analisi
    strategica sia finita. Eseguirla resta legato a `sbloccata`. */
export function consultabile(fasi: Fasi | null | undefined, n: number): boolean {
  if (sbloccata(fasi, n)) return true
  return n === 4 && statoFase(fasi, 1) === "completata"
}

/** Perché la fase n è chiusa, in una frase: null se è aperta. */
export function motivoBlocco(fasi: Fasi | null | undefined, n: number): string | null {
  if (sbloccata(fasi, n)) return null
  const prec = fase(n - 1)
  return statoFase(fasi, n - 1) === "da_rivedere"
    ? `Si sblocca quando approvi il checkpoint della Fase ${n - 1} (${prec.titolo}).`
    : `Si sblocca al completamento della Fase ${n - 1} (${prec.titolo}).`
}

/** Prima fase non completata: è quella su cui si apre la pagina gara. */
export function faseCorrente(fasi: Fasi | null | undefined): number {
  for (const f of FASI) if (statoFase(fasi, f.n) !== "completata") return f.n
  return FASI.length
}

/** Stato complessivo della gara. L'ordine di precedenza è deliberato: un
    errore va visto prima di una richiesta di revisione, che va vista prima
    di un'esecuzione. */
export function statoGara(fasi: Fasi | null | undefined): StatoGara {
  const stati: StatoFase[] = []
  for (const f of FASI) stati.push(statoFase(fasi, f.n))
  if (stati.includes("errore")) return "errore"
  if (stati.includes("da_rivedere")) return "da_rivedere"
  if (stati.includes("in_esecuzione")) return "in_esecuzione"
  if (stati.every((s) => s === "completata")) return "completata"
  return "in_coda"
}

/** Stato di ciascuna fase, per il binario nella card. */
export function segmenti(fasi: Fasi | null | undefined): StatoFase[] {
  const out: StatoFase[] = []
  for (const f of FASI) out.push(statoFase(fasi, f.n))
  return out
}

/** Le categorie di documento accettate dal backend (vedi routers/gare.py). */
export const CATEGORIE = [
  { id: "disciplinare", tag: "DISC", label: "Disciplinare", hint: "Guida l'estrazione dei requisiti" },
  { id: "elaborati",    tag: "ELAB", label: "Elaborati",    hint: "Capitolato, allegati, planimetrie" },
  { id: "p7m",          tag: "P7M",  label: "PDF firmati",  hint: "Verifica automatica della firma" },
] as const
export type Categoria = (typeof CATEGORIE)[number]["id"]

export const ESTENSIONI_AMMESSE = [".pdf", ".p7m", ".xlsx", ".docx", ".xls", ".doc"]

/** Categoria indovinata dal nome del file: correggibile, mai imposta. */
export function categoriaProbabile(nome: string): Categoria {
  const n = String(nome || "").toLowerCase()
  if (n.endsWith(".p7m")) return "p7m"
  if (/disciplinar/.test(n)) return "disciplinare"
  return "elaborati"
}

/** Perché un file è stato rifiutato, o null se va bene. */
export function motivoRifiuto(file: { name?: string }): string | null {
  const nome = String(file.name || "").toLowerCase()
  return ESTENSIONI_AMMESSE.some((e) => nome.endsWith(e)) ? null : "formato non supportato"
}

export const EFFORT = ["low", "medium", "high", "xhigh", "max"] as const
export type Effort = (typeof EFFORT)[number]
export const EFFORT_HINT: Record<Effort, string> = {
  low: "Passata rapida: utile per una prima ricognizione del disciplinare.",
  medium: "Equilibrio fra tempi e profondità, adatto a gare sotto soglia.",
  high: "Predefinito per gare complesse: analisi requisito per requisito.",
  xhigh: "Ragionamento esteso su capitolato e quadro economico. Tempi doppi o tripli.",
  max: "Massima profondità, da riservare a gare strategiche o contenziose.",
}
export const MODELLI = [
  // Alias della CLI Claude Code: puntano sempre all'ultima versione del
  // modello disponibile con la subscription.
  { id: "sonnet", hint: "Predefinito. Buon compromesso su gare fino a circa 200 pagine di documentazione." },
  { id: "opus", hint: "Per capitolati stratificati o quadri economici con molte varianti." },
] as const
export type Modello = (typeof MODELLI)[number]["id"]
