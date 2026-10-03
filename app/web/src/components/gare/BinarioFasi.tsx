import { cn } from "@/lib/utils"
import type { StatoFase } from "@/dominio/fasi"

const CLASSE: Record<StatoFase, string> = {
  completata: "bg-foreground-2",
  da_rivedere: "bg-status-attn",
  in_esecuzione: "bg-status-run animate-pulsa",
  errore: "bg-status-crit",
  in_coda: "bg-border-strong",
}

/** Il binario delle sette fasi: la firma visiva di SPADA (DESIGN.md §1).
    Puramente decorativo per lo screen reader: la legenda accanto dice
    fase e stato a parole. */
export function BinarioFasi({ stati, className }: { stati: StatoFase[]; className?: string }) {
  return (
    <div className={cn("flex h-1 gap-0.5", className)} aria-hidden="true">
      {stati.map((s, i) => (
        <i key={i} className={cn("flex-1 rounded-[1px]", CLASSE[s])} />
      ))}
    </div>
  )
}
