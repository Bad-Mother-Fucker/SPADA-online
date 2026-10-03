import { CheckIcon, CircleDashedIcon, WarningIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Card, Nota, Scheletro, Split, TitoloSezione, VuotoInline } from "@/components/comuni/Primitivi"
import { StatoErrore } from "@/components/stati/Stati"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { PannelloFase } from "../PannelloFase"
import { useGara } from "../GaraContext"
import { useEsegui } from "../AzioniFase"
import { fileDeliverable, useAudit, useDeliverables } from "@/hooks/useGaraDati"
import { scadenza as formattaScadenza } from "@/lib/formato"
import { risorsa } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import { statoFase } from "@/dominio/fasi"

export function Fase8() {
  const { slug, gara, output } = useGara()
  const audit = useAudit(slug)
  const del = useDeliverables(slug)
  const r = risorsa(audit, { vuoto: (d) => !d || d.length === 0, percorso: "06_registers/audit_summary.md" })
  const { approva, inCorso } = useEsegui()
  const lista = del.data || []
  const prodotti = lista.filter((d) => d.prodotto || fileDeliverable(output, d).length > 0).length
  const alCheckpoint = statoFase(gara.fasi, 8) === "da_rivedere"
  const approvata = statoFase(gara.fasi, 8) === "completata"
  const tuttiProdotti = lista.length > 0 && prodotti === lista.length
  const motivo = !alCheckpoint ? "L'audit della Fase 8 non si è ancora fermato su un checkpoint da approvare." : !tuttiProdotti ? "Tutti i deliverable devono essere prodotti prima dell'approvazione finale." : ""
  const sc = gara.manifest.gara?.scadenza_offerta

  return (
    <Split larga aside={
      <PannelloFase n={8} prima={
        <>
          {approvata ? (
            <Card tono="ok">
              <h3 className="mb-1 text-md font-semibold">Plico approvato</h3>
              <p className="text-sm text-foreground-2">L'approvazione finale è registrata: i deliverable sono congelati e il plico è pronto per la firma. Per cambiare qualcosa si riesegue la fase.</p>
            </Card>
          ) : (
            <Card tono="attn">
              <h3 className="mb-1 text-md font-semibold">Approvazione finale</h3>
              <p className="mb-3 text-sm text-foreground-2">{lista.length ? `${prodotti} deliverable su ${lista.length} risultano prodotti.` : "Nessun deliverable ancora prodotto dalla Fase 7."}</p>
              <Button className="w-full" disabled={!alCheckpoint || !tuttiProdotti || inCorso} title={motivo} onClick={() => approva(8)}>Approva e genera il plico</Button>
              <p className="mt-2 text-micro text-muted-foreground">L'approvazione finale congela i deliverable e produce il plico firmabile.</p>
            </Card>
          )}
          <Card>
            <h3 className="mb-1 text-xs font-semibold">Scadenza</h3>
            <p className="text-micro text-foreground-2">{sc ? <>Presentazione entro il <b className="font-medium text-foreground">{sc}</b>, {formattaScadenza(sc).testo}.</> : "Il manifesto della gara non riporta una scadenza di presentazione."}</p>
          </Card>
        </>
      } />
    }>
      <Nota tono="run" titolo="Questo audit non ricontrolla le prove.">La verifica documentale requisito per requisito è avvenuta in Fase 5 e 6. Qui si controlla solo che il plico sia completo, formalmente valido e consegnabile: presenza dei deliverable, limiti di pagine, firme, formati, marca da bollo.</Nota>
      {r.stato === "caricamento" && <Scheletro righe={5} />}
      {r.stato === "errore" && r.errore && <StatoErrore titolo="Audit di consegna non leggibile" errore={r.errore} percorso="06_registers/audit_summary.md" onRiprova={r.riprova} />}
      {r.stato === "vuoto" && <Card><VuotoInline titolo="Audit non ancora eseguito" testo="La checklist di consegna si popola quando la Fase 8 produce il riepilogo dell'audit. L'azione per questa fase è nel pannello a destra." /></Card>}
      {r.stato === "ok" && audit.data && (
        <Card>
          <TitoloSezione>Checklist di consegna</TitoloSezione>
          <div className="space-y-1.5">
            {audit.data.map((v, i) => (
              <div key={i} className={cn("grid grid-cols-[16px_1fr_auto] items-start gap-3 rounded-md border px-3 py-2", v.tono === "crit" && "border-status-crit/40", v.tono === "attn" && "border-status-attn/40")}>
                <span className={cn("mt-0.5", { ok: "text-status-ok", crit: "text-status-crit", attn: "text-status-attn", run: "text-status-run", neu: "text-muted-foreground" }[v.tono])} aria-hidden="true">
                  {v.tono === "ok" ? <CheckIcon size={14} weight="bold" /> : v.tono === "crit" ? <XIcon size={14} weight="bold" /> : v.tono === "neu" ? <CircleDashedIcon size={14} /> : <WarningIcon size={14} />}
                </span>
                <span className="min-w-0"><span className="block text-sm">{v.voce}</span>{v.dettaglio && <span className="block text-xs text-foreground-2">{v.dettaglio}</span>}</span>
                <BadgeStato tono={v.tono}>{v.esito}</BadgeStato>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Split>
  )
}
