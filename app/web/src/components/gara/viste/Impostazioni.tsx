import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, Nota } from "@/components/comuni/Primitivi"
import { BadgeStato, Chip } from "@/components/gare/BadgeStato"
import { TestataVista } from "../TestataVista"
import { useGara } from "../GaraContext"
import { useSistema } from "@/hooks/useGaraDati"
import { useTema } from "@/hooks/useTema"
import { useState, type ReactNode } from "react"
import { DialogoCaricaPrezzario } from "@/components/comuni/CaricaPrezzario"
import type { Tono } from "@/dominio/fasi"

function Riga({ titolo, valore, tono, azione }: { titolo: string; valore: ReactNode; tono?: Tono; azione?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="min-w-0"><strong className="block text-xs font-semibold">{titolo}</strong><span className={`text-micro ${tono === "crit" ? "text-status-crit" : tono === "attn" ? "text-status-attn" : "text-foreground-2"}`}>{valore}</span></span>
      {azione}
    </div>
  )
}

function Campo({ etichetta, valore, mono }: { etichetta: string; valore?: string; mono?: boolean }) {
  return <div className="grid gap-1"><Label>{etichetta}</Label><Input readOnly value={valore || "non indicato"} className={mono ? "font-mono" : ""} /></div>
}

export function Impostazioni() {
  const { slug, gara } = useGara()
  const m = gara.manifest
  const { auth, pipeline, prezzari } = useSistema()
  const { tema, scegli } = useTema()
  const [caricaAperto, setCaricaAperto] = useState(false)
  return (
    <>
      <TestataVista kicker="Vista trasversale" titolo="Impostazioni" sottotitolo="Due ambiti separati: i parametri di questa gara e le impostazioni di sistema che valgono per l'intera installazione." badge={{ tono: "neu", etichetta: "Sempre disponibile" }} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_440px]">
        <Card tono="run" aria-labelledby="h-set-gara">
          <div className="mb-2"><Chip tono="run">Questa gara</Chip></div>
          <h3 id="h-set-gara" className="mb-4 font-mono text-md font-semibold">{slug}</h3>
          <div className="space-y-4">
            <Campo etichetta="Nome esteso" valore={m.nome} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etichetta="Modello" valore={m.esecuzione?.modello} mono />
              <Campo etichetta="Effort" valore={m.esecuzione?.effort} mono />
              <Campo etichetta="Prezzario" valore={`${m.prezzario?.regione || ""} ${m.prezzario?.anno || ""}`.trim()} />
            </div>
            <Nota tono="attn">I parametri della gara sono scritti nel manifesto dalla pipeline. Il backend non espone ancora una modifica: per cambiarli si interviene sul manifesto e si riesegue la fase interessata. I job già completati non vengono rigenerati.</Nota>
            <div className="rounded-md border border-status-crit/40 bg-status-crit-soft p-3">
              <strong className="block text-xs font-semibold">Archiviazione</strong>
              <p className="mb-2 text-micro text-foreground-2">La gara esce dall'elenco attivo e diventa in sola lettura. Elaborati, grafo e storico restano consultabili.</p>
              <div className="flex gap-2"><Button size="sm" variant="destructive" disabled title="Non ancora esposta dal backend">Archivia la gara</Button><Button size="sm" variant="outline" disabled title="Non ancora esposta dal backend">Duplica come nuova gara</Button></div>
            </div>
          </div>
        </Card>
        <Card className="border-dashed" aria-labelledby="h-set-sys">
          <div className="mb-2"><Chip>Sistema e account</Chip></div>
          <h3 id="h-set-sys" className="mb-1 text-md font-semibold">Vale per tutte le gare</h3>
          <p className="mb-4 text-xs text-muted-foreground">Sezione separata di proposito: qui una modifica ha effetto sull'intera installazione, non su questa gara.</p>
          <div className="space-y-2">
            {auth.isPending ? <Skeleton className="h-12" /> : <Riga titolo="Autenticazione Claude" tono={auth.data?.disponibile ? undefined : "crit"} valore={auth.data?.disponibile ? `Attiva${auth.data.stima_scadenza ? `, circa ${auth.data.stima_scadenza.giorni_alla_scadenza_stimata} giorni alla scadenza stimata` : ""}` : `Non disponibile: ${auth.data?.motivo || (auth.error ? "endpoint non raggiungibile" : "motivo non riportato")}`} />}
            {pipeline.isPending ? <Skeleton className="h-12" /> : <Riga titolo="Versione pipeline" valore={pipeline.data ? `spada-core ${pipeline.data.versione}, ${pipeline.data.git_ref}` : "non disponibile"} azione={pipeline.data && <BadgeStato tono="ok">installata</BadgeStato>} />}
            {prezzari.isPending ? <Skeleton className="h-12" /> : <Riga titolo="Prezzari installati" tono={prezzari.data?.length ? undefined : "attn"} valore={prezzari.data?.length ? `${new Set(prezzari.data.map((p) => p.regione)).size} regioni, ${prezzari.data.length} annualità` : "Nessun prezzario importato"} azione={<Button size="sm" variant="outline" onClick={() => setCaricaAperto(true)}>Aggiungi da file .dcf</Button>} />}
            <Riga titolo="Tema predefinito" valore={tema === "auto" ? "Segue il sistema operativo" : `Forzato su ${tema === "dark" ? "scuro" : "chiaro"}`} azione={tema !== "auto" && <Button size="sm" variant="outline" onClick={() => scegli("auto")}>Torna ad automatico</Button>} />
          </div>
        </Card>
      </div>
      <DialogoCaricaPrezzario aperto={caricaAperto} onChiudi={() => setCaricaAperto(false)} />
    </>
  )
}
