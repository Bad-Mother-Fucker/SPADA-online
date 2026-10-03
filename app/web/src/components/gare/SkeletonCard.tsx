import { Skeleton } from "@/components/ui/skeleton"

/** Scheletro con la stessa forma e altezza della card reale: l'arrivo dei
    dati non sposta nulla in pagina (DESIGN.md §5). */
export function SkeletonCard({ variante = 0 }: { variante?: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5 pb-3" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-[22px] w-28 rounded-sm" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-4" style={{ width: variante % 2 ? "74%" : "88%" }} />
      <Skeleton className="h-4" style={{ width: variante % 2 ? "40%" : "56%" }} />
      <div className="flex gap-1.5">
        <Skeleton className="h-[18px] w-24 rounded-sm" />
        <Skeleton className="h-[18px] w-12 rounded-sm" />
        <Skeleton className="h-[18px] w-16 rounded-sm" />
      </div>
      <div className="flex h-1 gap-0.5">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-1 flex-1 rounded-[1px]" />)}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="flex gap-3 border-t pt-2.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

export function SkeletonGriglia({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]" aria-busy="true" aria-label="Caricamento dell'elenco delle gare">
      {Array.from({ length: n }, (_, i) => <SkeletonCard key={i} variante={i} />)}
    </div>
  )
}
