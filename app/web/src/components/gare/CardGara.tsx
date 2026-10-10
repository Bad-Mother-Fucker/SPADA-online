import { TrashIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { BadgeStato, Chip } from "./BadgeStato"
import { BinarioFasi } from "./BinarioFasi"
import { Link } from "react-router"
import { useArricchimento } from "@/hooks/useGare"
import type { Gara } from "@/lib/api"
import { plurale, quandoRelativo, scadenza as formattaScadenza } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { FASI, STATO_GARA, corpoFase, fase, faseCorrente, segmenti, statoFase, statoGara } from "@/dominio/fasi"

/** Ultimo momento in cui è successo qualcosa su questa gara. */
export function ultimoMovimento(g: Gara): string | null {
  let max: string | null = g.creato_il || null
  for (const corpo of Object.values(g.fasi || {})) {
    for (const campo of ["conclusa_il", "iniziata_il"] as const) {
      const v = corpo?.[campo]
      if (v && (!max || Date.parse(v) > Date.parse(max))) max = v
    }
  }
  return max
}

/** L'avviso in fondo alla card: cosa richiede attenzione, in una riga. */
export function avvisoGara(g: Gara, adesso = Date.now()): { testo: string; tono: "attn" | "crit" } | null {
  const fasi = g.fasi || {}
  for (let n = 1; n <= FASI.length; n++) {
    if (statoFase(fasi, n) === "errore") return { testo: `errore in Fase ${n}`, tono: "crit" }
  }
  for (let n = 1; n <= FASI.length; n++) {
    if (statoFase(fasi, n) === "interrotta") return { testo: `Fase ${n} interrotta, da riprendere`, tono: "attn" }
  }
  for (let n = 1; n <= FASI.length; n++) {
    if (statoFase(fasi, n) === "da_rivedere") {
      const da = corpoFase(fasi, n)?.conclusa_il
      const gg = da ? Math.floor((adesso - Date.parse(da)) / 86400000) : 0
      return { testo: gg >= 1 ? `checkpoint fermo da ${gg} g` : `checkpoint Fase ${n} in attesa`, tono: "attn" }
    }
  }
  return null
}

export const urlGara = (slug: string, n: number) => `/gara/${encodeURIComponent(slug)}/fase/${n}`

const TESTO_TONO = { attn: "text-status-attn", crit: "text-status-crit", neu: "" } as const

export function CardGara({ gara, onElimina, inEliminazione }: { gara: Gara; onElimina: (g: Gara) => void; inEliminazione?: boolean }) {
  const fasi = gara.fasi || {}
  const st = statoGara(fasi)
  const meta = STATO_GARA[st]
  const n = faseCorrente(fasi)
  const f = fase(n)
  const nome = gara.nome || gara.slug
  const avviso = avvisoGara(gara)
  const { elaborati, elaboratiInCaricamento, elaboratiIllegibili, scadenza, scadenzaInCaricamento } = useArricchimento(gara.slug, !inEliminazione)
  const sc = formattaScadenza(scadenza)

  return (
    <article
      aria-busy={inEliminazione || undefined}
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-lg border bg-card p-3.5 pb-3",
        "transition-[border-color,box-shadow,opacity] duration-(--d-base) ease-(--e-enter)",
        "hover:border-border-strong hover:shadow-pop focus-within:border-border-strong",
        inEliminazione && "pointer-events-none opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <BadgeStato tono={meta.tono} pulsa={st === "in_esecuzione"}>{meta.etichetta}</BadgeStato>
        <span className="min-w-0 truncate font-mono text-micro text-muted-foreground" title={gara.slug}>{gara.slug}</span>
      </div>

      <h3 className="text-[13.5px] font-semibold leading-[1.35]">
        {/* Link "steso" sull'intera card: lo pseudo-elemento copre la card, i
            controlli interni stanno sopra con z-index. Un solo tab stop. */}
        <Link
          to={urlGara(gara.slug, n)}
          aria-label={`${nome}, ${meta.etichetta}, fase ${n} ${f.titolo}`}
          className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
        >
          {nome}
        </Link>
      </h3>

      <div className="relative z-[1] flex flex-wrap gap-1.5">
        <Chip>{gara.regione} {gara.anno_prezzario}</Chip>
        {gara.prezzario_disponibile === false && (
          <Chip tono="attn" title={`Prezzario ${gara.regione} ${gara.anno_prezzario} non presente: niente valutazioni economiche finché non lo importi.`}>senza prezzario</Chip>
        )}
        <Chip mono>{gara.modello}</Chip>
        <Chip>effort {gara.effort}</Chip>
      </div>

      <BinarioFasi stati={segmenti(fasi)} />
      <div className="flex justify-between gap-3 text-xs text-foreground-2">
        <span><b className="font-semibold text-foreground">Fase {n}</b> {f.titolo}</span>
        <span className="shrink-0 text-muted-foreground">{quandoRelativo(ultimoMovimento(gara))}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
        <span className={cn(elaboratiInCaricamento && "animate-pulsa")}>
          {elaboratiIllegibili ? "elaborati non leggibili" : elaborati === undefined ? "elaborati…" : plurale(elaborati, "elaborato", "elaborati")}
        </span>
        <span className={cn(scadenzaInCaricamento && "animate-pulsa", sc.tono !== "neu" && cn("font-medium", TESTO_TONO[sc.tono]))}>
          {scadenzaInCaricamento ? "scadenza…" : sc.testo}
        </span>
        {avviso && <span className={cn("ml-auto font-semibold", TESTO_TONO[avviso.tono])}>{avviso.testo}</span>}
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Elimina gara ${nome}`}
        title="Elimina gara"
        onClick={() => onElimina(gara)}
        className={cn(
          "absolute right-2 top-2 z-[1] text-muted-foreground opacity-0 transition-opacity duration-(--d-fast)",
          "hover:bg-status-crit-soft hover:text-status-crit group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <TrashIcon aria-hidden="true" />
      </Button>
    </article>
  )
}
