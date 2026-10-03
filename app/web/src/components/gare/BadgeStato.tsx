import { cn } from "@/lib/utils"
import type { Tono } from "@/dominio/fasi"

// Classi scritte per esteso: Tailwind genera solo ciò che legge nel sorgente.
const CLASSE: Record<Tono, string> = {
  run: "bg-status-run-soft text-status-run",
  attn: "bg-status-attn-soft text-status-attn",
  ok: "bg-status-ok-soft text-status-ok",
  crit: "bg-status-crit-soft text-status-crit",
  neu: "bg-status-neu-soft text-status-neu",
}

/** Badge di stato: rettangolo 4px, testo in forma di frase. Il pallino
    compare solo quando pulsa, cioè solo in "in esecuzione" (DESIGN.md §5). */
export function BadgeStato({ tono, pulsa, className, children }: { tono: Tono; pulsa?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium", CLASSE[tono], className)}>
      {pulsa && <i className="size-1.5 rounded-full bg-current animate-pulsa" aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Chip neutro per metadati (regione e anno, modello, effort). */
export function Chip({ mono, tono, className, children, title }: { mono?: boolean; tono?: Tono; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-sm px-1.5 py-px text-xs",
        tono ? cn(CLASSE[tono], "font-medium") : "bg-muted text-foreground-2",
        mono && "font-mono",
        className,
      )}
    >
      {children}
    </span>
  )
}
