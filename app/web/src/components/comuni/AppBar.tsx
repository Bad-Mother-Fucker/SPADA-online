import { ArrowSquareOutIcon, MonitorIcon, CheckIcon, SignInIcon, SignOutIcon, UserIcon } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { CHIAVE_LOGIN, DialogoLoginClaude, useLoginClaude } from "./LoginClaude"
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

/** Iniziali dell'account collegato: dal nome («Michele De Sena» → MD),
    altrimenti dalla parte locale dell'email («mario.rossi@…» → MR). */
export function iniziali(nome?: string | null, email?: string | null): string | null {
  const parole = (s: string) => s.split(/[\s._\-+]+/).map((p) => p.replace(/[^\p{L}]/gu, "")).filter(Boolean)
  const p = nome ? parole(nome) : email ? parole(email.split("@")[0]) : []
  if (!p.length) return null
  const lettere = p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]
  return lettere.toUpperCase()
}

function MenuAvatar() {
  const { tema, scegli } = useTema()
  const qc = useQueryClient()
  const { data: claude } = useLoginClaude()
  const [loginAperto, setLoginAperto] = useState(false)
  const collegato = !!claude?.disponibile
  const conToken = claude?.metodo === "oauth_token"
  const esci = () => Api.esciClaude()
    .then((d) => { qc.setQueryData(CHIAVE_LOGIN, d); void qc.invalidateQueries({ queryKey: ["sistema"] }); toast.success("Uscito da Claude", { description: "Le fasi non partono finché non accedi di nuovo." }) })
    .catch((e) => toast.error("Uscita non riuscita", { description: String(e?.message || e) }))
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={collegato ? `Menu dell'operatore${claude?.nome || claude?.account ? `: ${claude?.nome || claude?.account}` : ""}` : "Menu dell'operatore: Claude non collegato"}
        title={claude && !collegato ? "Claude non è collegato: le fasi non possono partire" : undefined}
        className="relative grid size-7 place-items-center rounded-md border bg-muted text-micro font-semibold text-foreground-2 transition-colors duration-(--d-fast) hover:border-border-strong"
      >
        {collegato && iniziali(claude?.nome, claude?.account) ? iniziali(claude?.nome, claude?.account) : <UserIcon size={14} aria-hidden="true" />}
        {claude && !collegato && <i className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-card bg-status-crit" aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>Claude per Prometheus - S.P.A.D.A.</DropdownMenuLabel>
        <p className="px-2 pb-1.5 text-xs text-muted-foreground">
          {!claude ? "Verifica in corso…"
            : collegato ? (claude.account ? `Collegato come ${claude.nome ? `${claude.nome}, ` : ""}${claude.account}${claude.abbonamento ? ` (${claude.abbonamento})` : ""}` : conToken ? "Collegato con token OAuth" : "Collegato")
            : "Non collegato: le fasi non possono partire."}
        </p>
        {!conToken && (collegato ? (
          <DropdownMenuItem onSelect={() => setLoginAperto(true)}>
            <SignInIcon aria-hidden="true" />Accedi con un altro account
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => setLoginAperto(true)} className="font-medium">
            <SignInIcon aria-hidden="true" />Accedi a Claude
          </DropdownMenuItem>
        ))}
        {collegato && !conToken && (
          <DropdownMenuItem onSelect={() => void esci()}>
            <SignOutIcon aria-hidden="true" />Esci da Claude
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
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
    <DialogoLoginClaude aperto={loginAperto} onChiudi={() => setLoginAperto(false)} />
    </>
  )
}

/** Marchio del prodotto: la spada di public/favicon.svg, a tinta unita
    (currentColor) per seguire testo e tema. */
function IconaSpada({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className={className}>
      <g transform="translate(32 32) scale(1.25) rotate(45) translate(-32 -32.6)">
        <path d="M32 3 L36.5 9.5 V40 H27.5 V9.5 Z" />
        <rect x="18" y="40" width="28" height="5" rx="2.5" />
        <rect x="29.3" y="45" width="5.4" height="10.5" rx="1.2" />
        <circle cx="32" cy="58.5" r="3.8" />
      </g>
    </svg>
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
          <IconaSpada className="size-5" />
          Prometheus - S.P.A.D.A.
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
