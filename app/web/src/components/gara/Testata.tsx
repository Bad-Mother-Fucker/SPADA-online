import { NavLink, useLocation } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { Nota } from "@/components/comuni/Primitivi"
import { useGara } from "./GaraContext"
import { useEsegui } from "./AzioniFase"
import { useDeliverableAzioni, useImportaPrezzario } from "@/hooks/useGaraDati"
import { quandoRelativo, scadenza as formattaScadenza } from "@/lib/formato"
import { comeApiError } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import { FASI, STATO_GARA, consultabile, faseCorrente, inAvvio, motivoBlocco, statoFase, statoGara, type StatoFase } from "@/dominio/fasi"

/** La sintesi riassume la fase corrente, cioè ciò che la pipeline ha scritto in fasi.json. */
function sintesiGara(gara: ReturnType<typeof useGara>["gara"]) {
  const n = faseCorrente(gara.fasi)
  const corpo = gara.fasi[FASI[n - 1].chiave] as { sintesi?: string } | undefined
  if (corpo?.sintesi) return corpo.sintesi
  const completate = FASI.filter((f) => statoFase(gara.fasi, f.n) === "completata").length
  return `${completate} fasi su ${FASI.length} completate. La pipeline non ha ancora scritto una sintesi per la fase corrente.`
}

export function TestataGara() {
  const { slug, gara, stream, runs } = useGara()
  const st = statoGara(gara.fasi)
  const meta = STATO_GARA[st]
  const n = faseCorrente(gara.fasi)
  const m = gara.manifest
  const sc = m.gara?.scadenza_offerta ? formattaScadenza(m.gara.scadenza_offerta) : null
  const errori = (runs || []).filter((r) => r.esito !== "completato" && r.esito !== "in_corso").length
  const trasversali = [
    { a: "brief", etichetta: "Brief di gara" },
    { a: "grafo", etichetta: "Grafo" },
    { a: "attivita", etichetta: "Attività", conteggio: errori },
    { a: "impostazioni", etichetta: "Impostazioni" },
  ]
  return (
    <header className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <BadgeStato tono={meta.tono} pulsa={st === "in_esecuzione"}>{meta.etichetta}, Fase {n}</BadgeStato>
            <Chip mono>{slug}</Chip>
            <Chip>{m.prezzario?.regione || "regione non indicata"}, prezzario {m.prezzario?.anno || "n.d."}</Chip>
            <Chip mono>{m.esecuzione?.modello || "modello n.d."}, {m.esecuzione?.effort || "effort n.d."}</Chip>
            {sc && <Chip tono={sc.tono !== "neu" ? sc.tono : undefined}>{sc.testo}</Chip>}
          </div>
          <h1 className="text-lg font-semibold tracking-tight">{m.nome || slug}</h1>
          <p className="mt-1 max-w-[80ch] text-xs text-foreground-2">{sintesiGara(gara)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <nav aria-label="Viste trasversali" className="flex gap-1.5">
            {trasversali.map((t) => (
              <NavLink key={t.a} to={t.a} className={({ isActive }) => cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors duration-(--d-fast)", isActive ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}>
                {t.etichetta}
                {t.conteggio ? <span className="rounded-sm bg-status-crit-soft px-1 font-mono text-micro text-status-crit">{t.conteggio} err</span> : null}
              </NavLink>
            ))}
          </nav>
          <span className="text-micro text-muted-foreground">{stream.ultimoEvento ? `ultimo evento ${quandoRelativo(stream.ultimoEvento)}` : "nessun evento ricevuto"}</span>
        </div>
      </div>
    </header>
  )
}

const BARRA: Record<StatoFase, string> = {
  completata: "bg-foreground-2", da_rivedere: "bg-status-attn", in_esecuzione: "barra-in-corso", errore: "bg-status-crit", in_coda: "bg-border-strong",
}
const ETICHETTA_TONO: Partial<Record<StatoFase, string>> = { in_esecuzione: "text-status-run", errore: "text-status-crit", da_rivedere: "text-status-attn" }
const ICONA: Record<StatoFase, string> = { completata: "✓", da_rivedere: "◆", in_esecuzione: "", errore: "✕", in_coda: "" }

/** Lo stepper delle fasi: barra superiore colorata per stato, numero
    in mono e titolo sotto. Le fasi bloccate spiegano perché (DESIGN.md §5). */
export function Stepper() {
  const { gara } = useGara()
  const location = useLocation()
  return (
    <nav aria-label="Fasi della pipeline" className="mb-5 border-b pb-4">
      <ol className="grid grid-cols-8 gap-2">
        {FASI.map((f) => {
          const st = statoFase(gara.fasi, f.n)
          const blocco = consultabile(gara.fasi, f.n) ? null : motivoBlocco(gara.fasi, f.n)
          const attiva = new RegExp(`/fase/${f.n}(/|$)`).test(location.pathname)
          const corpo = (
            <>
              <span className={cn("mb-2 block h-[3px] rounded-[1px]", BARRA[st])} aria-hidden="true" />
              <span className={cn("block font-mono text-micro", attiva ? "text-foreground" : "text-muted-foreground")}>{ICONA[st] && <span aria-hidden="true">{ICONA[st]} </span>}{f.num}</span>
              <span className={cn("block text-xs leading-tight", attiva ? "font-semibold text-foreground" : blocco ? "text-muted-foreground" : "text-foreground-2")}>{f.titolo}</span>
              <span className={cn("block text-micro", !blocco && ETICHETTA_TONO[st] ? ETICHETTA_TONO[st] : "text-muted-foreground")}>
                {blocco ? "bloccata" : inAvvio(gara.fasi, f.n) ? "in avvio" : STATO_ETICHETTA[st]}
              </span>
            </>
          )
          return (
            <li key={f.n} className="min-w-0">
              {blocco ? (
                <span className="block cursor-not-allowed rounded-md p-1 opacity-70" aria-disabled="true" title={blocco}>{corpo}</span>
              ) : (
                <NavLink to={`fase/${f.n}`} aria-current={attiva ? "step" : undefined} className="block rounded-md p-1 outline-none transition-colors duration-(--d-fast) hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{corpo}</NavLink>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
const STATO_ETICHETTA: Record<StatoFase, string> = { completata: "completata", da_rivedere: "da rivedere", in_esecuzione: "in esecuzione", errore: "errore", in_coda: "in coda" }

/** Avviso in testa alla gara, visibile in ogni vista: prezzario mancante,
    oppure arrivato dopo elaborazioni fatte senza. */
export function AvvisoPrezzario() {
  const { slug, gara } = useGara()
  const p = gara.prezzario
  const importa = useImportaPrezzario(slug)
  const { riesegui } = useEsegui()
  const del = useDeliverableAzioni(slug)
  if (!p || (p.disponibile && !(p.da_rielaborare || []).length)) return null
  const nome = [p.regione, p.anno].filter(Boolean).join(" ") || "di riferimento"

  if (!p.disponibile) {
    return (
      <Nota tono="attn" role="status" className="mb-4" titolo={`Prezzario ${nome} non presente`}
        azioni={
          <>
            <Button size="sm" variant="outline" disabled={importa.isPending} onClick={() => importa.mutate({ regione: p.regione || "", anno: p.anno || 0 }, {
              onSuccess: () => toast.success(`Prezzario ${nome} importato`, { description: "Da ora le fasi includono le valutazioni economiche." }),
              onError: (e) => toast.error("Importazione non riuscita", { description: comeApiError(e).message }),
            })}>{importa.isPending ? "Importazione in corso" : "Importa ora"}</Button>
            <span className="self-center text-micro text-muted-foreground">Lo cerca sul Mac e fra le release pubblicate. Da file: <code className="font-mono">./spada importa-prezzario {p.regione || "Regione"} {p.anno || "anno"} cartella</code></span>
          </>
        }>
        La gara procede senza valutazioni economiche: l'analisi strategica non confronta i prezzi del computo con il prezzario né stima la capacità di investimento, e il computo metrico lascia da definire le voci nuove. Includilo il prima possibile, poi rielabora la Fase 3 e il computo metrico.
      </Nota>
    )
  }
  return (
    <Nota tono="run" role="status" className="mb-4" titolo={`Prezzario ${nome} ora disponibile`}
      azioni={(p.da_rielaborare || []).map((x) => (
        <Button key={x.etichetta} size="sm" variant="outline" onClick={() => x.tipo === "fase" && x.fase ? riesegui(x.fase) : x.id && del.riesegui.mutate(x.id)}>
          {x.tipo === "fase" ? `Riesegui la Fase ${x.fase}` : `Riesegui ${x.etichetta}`}
        </Button>
      ))}>
      Queste elaborazioni sono state fatte senza e non contengono le valutazioni economiche: {(p.da_rielaborare || []).map((x) => x.etichetta).join(", ")}. Rieseguile per includerle.
    </Nota>
  )
}
