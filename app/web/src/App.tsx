// Foglio dei token: pagina provvisoria della Fase 1 per verificare il design
// system nei due temi. Viene sostituita dall'elenco gare nella Fase 2.
import { Button } from "@/components/ui/button"
import { applicaTema, leggiTema, type Tema } from "@/lib/tema"

const STATI = [
  ["status-run", "In esecuzione"],
  ["status-attn", "Richiede la tua decisione"],
  ["status-ok", "Completata"],
  ["status-crit", "Errore"],
  ["status-neu", "In coda"],
] as const

// Classi scritte per esteso: Tailwind genera solo ciò che legge nel sorgente.
const CLASSI_STATO: Record<string, string> = {
  "status-run": "bg-status-run-soft text-status-run",
  "status-attn": "bg-status-attn-soft text-status-attn",
  "status-ok": "bg-status-ok-soft text-status-ok",
  "status-crit": "bg-status-crit-soft text-status-crit",
  "status-neu": "bg-status-neu-soft text-status-neu",
}

function Badge({ tono, children }: { tono: string; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium ${CLASSI_STATO[tono]}`}>
      {tono === "status-run" && <i className="size-1.5 rounded-full bg-current animate-pulse" aria-hidden />}
      {children}
    </span>
  )
}

export default function App() {
  const tema = leggiTema()
  const scegli = (t: Tema) => () => applicaTema(t)
  return (
    <main className="mx-auto max-w-[1200px] px-6 py-8 space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Foglio dei token</h1>
          <p className="text-foreground-2">Fase 1 del redesign. Colori, tipografia, forma e stati nei due temi.</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-border-strong" role="group" aria-label="Tema">
          {(["light", "dark", "auto"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tema === t}
              onClick={scegli(t)}
              className="px-3 py-1 text-xs text-foreground-2 aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {t === "light" ? "Chiaro" : t === "dark" ? "Scuro" : "Sistema"}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-md font-semibold">Bottoni</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Crea e carica documenti</Button>
            <Button variant="secondary">Annulla</Button>
            <Button variant="outline">Riprova</Button>
            <Button variant="ghost">Apri il plico</Button>
            <Button variant="destructive">Elimina gara</Button>
            <Button disabled>Creazione in corso</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-md font-semibold">Stati</h2>
          <div className="flex flex-wrap gap-2">
            {STATI.map(([tono, testo]) => (
              <Badge key={tono} tono={tono}>{testo}</Badge>
            ))}
          </div>
          <div className="flex gap-0.5 h-1" aria-hidden>
            {["bg-foreground-2", "bg-foreground-2", "bg-foreground-2", "bg-foreground-2", "bg-status-attn", "bg-border-strong", "bg-border-strong"].map((c, i) => (
              <i key={i} className={`flex-1 rounded-[1px] ${c}`} />
            ))}
          </div>
          <p className="text-xs text-foreground-2"><b className="font-medium text-foreground">Fase 5</b> Revisione proposte <span className="font-mono text-muted-foreground ml-2">18 min fa</span></p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-md font-semibold">Tipografia</h2>
          <p className="text-xl font-semibold">Gare in lavorazione</p>
          <p className="text-lg font-semibold">Servizio di manutenzione degli impianti elevatori, ASL Napoli 3 Sud</p>
          <p className="text-base max-w-[65ch] text-foreground-2">Una gara nasce da tre documenti: disciplinare, elaborati tecnici e, se presenti, i PDF firmati P7M. Il resto lo produce la pipeline.</p>
          <p className="font-mono text-xs text-muted-foreground">manutenzione-elevatori-asl-na3 <span className="ml-3">CIG B2F1A9C0E7</span> <span className="ml-3">31.755 voci</span></p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-md font-semibold">Campo e chip</h2>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Slug</span>
            <input className="w-full rounded-md border border-border-strong bg-card px-2.5 py-1.5 font-mono text-sm" defaultValue="manutenzione-elevatori-asl-na3" />
            <span className="mt-1 block text-micro text-muted-foreground">Derivato dal nome. Modificabile finché la gara non è avviata.</span>
          </label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-sm bg-muted px-1.5 py-px text-foreground-2">Campania 2026</span>
            <span className="rounded-sm bg-muted px-1.5 py-px font-mono text-foreground-2">opus</span>
            <span className="rounded-sm bg-status-attn-soft px-1.5 py-px font-medium text-status-attn">senza prezzario</span>
          </div>
        </div>
      </section>
    </main>
  )
}
