import type { ReactNode } from "react"
import { Link } from "react-router"
import { CaretLeftIcon } from "@phosphor-icons/react"
import { BadgeStato } from "@/components/gare/BadgeStato"
import type { Tono } from "@/dominio/fasi"

/** Intestazione di una vista: contesto, titolo, cosa si vede qui, stato. */
export function TestataVista({ kicker, titolo, sottotitolo, badge, indietro }: { kicker: string; titolo: ReactNode; sottotitolo?: ReactNode; badge?: { tono: Tono; etichetta: string; pulsa?: boolean }; indietro?: { a: string; etichetta: string } }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-center gap-3 text-micro text-muted-foreground">
          {indietro && <Link to={indietro.a} className="inline-flex items-center gap-1 rounded-sm text-foreground-2 hover:text-foreground"><CaretLeftIcon aria-hidden="true" />{indietro.etichetta}</Link>}
          <span>{kicker}</span>
        </div>
        <h2 className="mt-0.5 text-md font-semibold">{titolo}</h2>
        {sottotitolo && <p className="mt-0.5 max-w-[80ch] text-xs text-foreground-2">{sottotitolo}</p>}
      </div>
      {badge && <BadgeStato tono={badge.tono} pulsa={badge.pulsa}>{badge.etichetta}</BadgeStato>}
    </div>
  )
}
