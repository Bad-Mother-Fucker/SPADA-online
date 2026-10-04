import { StarFourIcon, ArrowSquareOutIcon, MonitorIcon, CheckIcon } from "@phosphor-icons/react"
import { Link } from "react-router"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useStatoBackend, type StatoBackend } from "@/hooks/useStatoBackend"
import { useTema } from "@/hooks/useTema"
import { Api } from "@/lib/api"
import { quandoRelativo } from "@/lib/formato"
import { cn } from "@/lib/utils"


const BADGE: Record<StatoBackend, { classe: string; punto: string; testo: string }> = {
  connesso: { classe: "text-foreground-2", punto: "bg-status-ok", testo: "Backend connesso" },
  irraggiungibile: { classe: "text-status-crit", punto: "bg-status-crit", testo: "Backend non raggiungibile" },
  verifica: { classe: "text-muted-foreground", punto: "bg-status-neu animate-pulsa", testo: "Verifica del backend" },
}

/** Riflette la raggiungibilità reale del backend. Cliccarlo ricontrolla subito. */
function BadgeBackend() {
  const { stato, ultimaRisposta, ricontrolla } = useStatoBackend()
  const b = BADGE[stato]
  return (
    <button
      type="button"
      onClick={ricontrolla}
      aria-live="polite"
      title={ultimaRisposta ? `Ultima risposta ${quandoRelativo(new Date(ultimaRisposta).toISOString())}. Clicca per ricontrollare.` : "Clicca per ricontrollare"}
      className={cn("inline-flex h-7 items-center gap-2 rounded-md px-2 text-xs transition-colors duration-(--d-fast) hover:bg-muted", b.classe)}
    >
      <i className={cn("size-1.5 rounded-full", b.punto)} aria-hidden="true" />
      {b.testo}
    </button>
  )
}

function ControlloTema() {
  const { tema, effettivo, scegli } = useTema()
  const voci = [["light", "Chiaro"], ["dark", "Scuro"]] as const
  return (
    <div role="group" aria-label="Tema" className="inline-flex overflow-hidden rounded-md border border-border-strong">
      {voci.map(([id, label]) => {
        const attivo = tema === id || (tema === "auto" && effettivo === id)
        return (
          <button
            key={id}
            type="button"
            aria-pressed={attivo}
            onClick={() => scegli(id)}
            className={cn(
              "px-2.5 py-1 text-xs transition-colors duration-(--d-fast)",
              attivo ? "bg-foreground text-background" : "text-foreground-2 hover:bg-muted",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function MenuAvatar() {
  const { tema, scegli } = useTema()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu dell'operatore"
        className="grid size-7 place-items-center rounded-md border bg-muted text-micro font-semibold text-foreground-2 transition-colors duration-(--d-fast) hover:border-border-strong"
      >
        GC
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => scegli("auto")}>
          <MonitorIcon aria-hidden="true" />
          Come il sistema
          {tema === "auto" && <CheckIcon className="ml-auto" aria-hidden="true" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`${Api.base()}/docs`} target="_blank" rel="noopener">Stato del servizio<ArrowSquareOutIcon className="ml-auto" aria-hidden="true" /></a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Barra applicativa persistente (DESIGN.md §5): marchio, sezione, stato
    del backend, tema, operatore. */
export interface Briciola { a?: string; etichetta: string; mono?: boolean }

export function AppBar({ sezione = "Gare", briciole, badge, larga }: { sezione?: string; briciole?: Briciola[]; badge?: React.ReactNode; larga?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className={cn("mx-auto flex h-12 items-center gap-3.5 px-6 max-md:px-4", larga ? "max-w-[1280px]" : "max-w-[1200px]")}>
        <Link to="/" className="flex shrink-0 items-center gap-1.5 rounded-sm font-semibold tracking-[0.01em]">
          <StarFourIcon size={14} weight="fill" aria-hidden="true" />
          SPADA
        </Link>
        {briciole ? (
          <nav aria-label="Percorso" className="flex min-w-0 items-center gap-2 text-muted-foreground">
            {briciole.map((b, i) => (
              <span key={i} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span aria-hidden="true">/</span>}
                {b.a ? <Link to={b.a} className="rounded-sm hover:text-foreground">{b.etichetta}</Link> : <span className={cn("truncate text-foreground", b.mono && "font-mono text-xs")}>{b.etichetta}</span>}
              </span>
            ))}
          </nav>
        ) : (
          <span className="text-muted-foreground">{sezione}</span>
        )}
        <span className="flex-1" />
        {badge ?? <BadgeBackend />}
        <ControlloTema />
        <MenuAvatar />
      </div>
    </header>
  )
}
