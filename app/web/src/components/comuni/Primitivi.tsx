import type { ComponentProps, ReactNode } from "react"
import { InfoIcon, WarningIcon, WarningCircleIcon, CheckCircleIcon } from "@phosphor-icons/react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { Tono } from "@/dominio/fasi"

const BORDO: Record<Tono, string> = {
  run: "border-status-run/40", attn: "border-status-attn/50", ok: "border-status-ok/40", crit: "border-status-crit/40", neu: "",
}

/** Card: superficie piatta con bordo sottile, senza ombra (DESIGN.md §4). */
export function Card({ tono, className, children, ...props }: { tono?: Tono } & ComponentProps<"section">) {
  return <section className={cn("rounded-lg border bg-card p-4", tono && BORDO[tono], className)} {...props}>{children}</section>
}

export function TitoloSezione({ children, azioni, className }: { children: ReactNode; azioni?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h3 className="text-sm font-semibold">{children}</h3>
      {azioni}
    </div>
  )
}

const ICONA_NOTA: Record<Tono, ReactNode> = {
  run: <InfoIcon size={16} />, attn: <WarningIcon size={16} />, crit: <WarningCircleIcon size={16} />, ok: <CheckCircleIcon size={16} />, neu: <InfoIcon size={16} />,
}
const SFONDO_NOTA: Record<Tono, string> = {
  run: "border-status-run/30 bg-status-run-soft text-status-run",
  attn: "border-status-attn/40 bg-status-attn-soft text-status-attn",
  crit: "border-status-crit/40 bg-status-crit-soft text-status-crit",
  ok: "border-status-ok/40 bg-status-ok-soft text-status-ok",
  neu: "border-border bg-muted text-foreground-2",
}

/** Nota: un avviso in linea con icona, titolo facoltativo e azioni. */
export function Nota({ tono = "neu", titolo, children, azioni, className, role }: { tono?: Tono; titolo?: ReactNode; children?: ReactNode; azioni?: ReactNode; className?: string; role?: string }) {
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-xs", SFONDO_NOTA[tono], className)}>
      <span className="mt-px shrink-0" aria-hidden="true">{ICONA_NOTA[tono]}</span>
      <div className="min-w-0 flex-1 text-foreground">
        {titolo && <strong className="mb-0.5 block font-semibold">{titolo}</strong>}
        {children && <div className="text-foreground-2">{children}</div>}
        {azioni && <div className="mt-2 flex flex-wrap gap-2">{azioni}</div>}
      </div>
    </div>
  )
}

/** Coppie etichetta e valore, allineate. */
export function Kv({ voci, className }: { voci: ([string, ReactNode] | [string, ReactNode, boolean] | null | false)[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs", className)}>
      {voci.filter(Boolean).map((v) => {
        const [k, val, mono] = v as [string, ReactNode, boolean?]
        return (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("min-w-0 text-foreground-2", mono && "font-mono")}>{val ?? "non indicato"}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Vuoto interno a una vista: tratteggiato, meno enfatico del vuoto di pagina. */
export function VuotoInline({ titolo, testo, azione, className }: { titolo: string; testo?: ReactNode; azione?: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-apparizione rounded-lg border border-dashed px-5 py-8 text-center", className)}>
      <div className="text-sm font-semibold">{titolo}</div>
      {testo && <p className="mx-auto mt-1 max-w-[52ch] text-xs text-foreground-2">{testo}</p>}
      {azione && <div className="mt-4 flex justify-center gap-2">{azione}</div>}
    </div>
  )
}

export function Scheletro({ righe = 3, className }: { righe?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)} aria-busy="true">
      <Skeleton className="mb-3 h-5 w-32 rounded-sm" />
      {Array.from({ length: righe }, (_, i) => <Skeleton key={i} className="mb-2 h-3.5" style={{ width: `${88 - i * 14}%` }} />)}
    </div>
  )
}

/** Contenuto a sinistra e pannello a destra (DESIGN.md §5, viste di fase). */
export function Split({ children, aside, larga }: { children: ReactNode; aside?: ReactNode; larga?: boolean }) {
  return (
    <div className={cn("grid items-start gap-4", aside && (larga ? "lg:grid-cols-[1fr_380px]" : "lg:grid-cols-[1fr_320px]"))}>
      <div className="min-w-0 space-y-4">{children}</div>
      {aside && <aside className="min-w-0 space-y-4">{aside}</aside>}
    </div>
  )
}

/** Il pulsante di una scelta a più voci, in forma di scheda. */
export function BottoneScelta({ attivo, tono, className, children, ...props }: { attivo?: boolean; tono?: Tono } & ComponentProps<"button">) {
  const attivoClasse: Record<Tono, string> = {
    ok: "border-status-ok bg-status-ok-soft text-status-ok", attn: "border-status-attn bg-status-attn-soft text-status-attn",
    crit: "border-status-crit bg-status-crit-soft text-status-crit", run: "border-primary bg-primary-soft text-primary", neu: "border-foreground bg-muted text-foreground",
  }
  return (
    <button
      type="button"
      aria-pressed={attivo}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-(--d-fast)",
        attivo ? attivoClasse[tono || "neu"] : "border-border-strong bg-card text-foreground-2 hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
