// Conversazione: usata dall'assistente (sola lettura) e da Claude Code
// (lettura e scrittura). Le risposte sono in markdown, ogni riga su una riga.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { PaperPlaneRightIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Blocchi } from "./Markdown"
import { Nota } from "./Primitivi"
import { blocchi } from "@/lib/md"
import { quandoBreve } from "@/lib/formato"
import { cn } from "@/lib/utils"

export interface Messaggio { mio: boolean; testo: string; quando?: string }

/** Risposta in arrivo: il testo ricevuto finora e, se c'è, cosa sta facendo
    l'assistente (uno strumento davvero in uso, non un ragionamento). */
export interface InScrittura {
  testo: string; stato?: string | null
  /** cambia quando l'assistente ricomincia un messaggio: la rivelazione riparte */
  messaggio?: number
  /** il testo è definitivo: a rivelazione finita si chiama onMostrata */
  completa?: boolean
}

const riduciMovimento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Rivela `testo` lettera per lettera, a una velocità proporzionale a quanto
    resta da mostrare: mentre arriva in streaming sembra scritto, un testo già
    completo si chiude in pochi fotogrammi. Nessun ritardo artificiale. */
function useTestoProgressivo(testo: string) {
  const [ridotto] = useState(riduciMovimento)
  const [mostrati, setMostrati] = useState(0)
  const visibili = ridotto ? testo.length : Math.min(mostrati, testo.length)
  useEffect(() => {
    if (visibili >= testo.length) return
    const id = requestAnimationFrame(() => setMostrati((m) => Math.min(testo.length, m + Math.max(1, Math.ceil((testo.length - m) / 8)))))
    return () => cancelAnimationFrame(id)
  }, [visibili, testo.length])
  return testo.slice(0, visibili)
}

function BollaInScrittura({ chi, inScrittura, onMostrata }: { chi: string; inScrittura: InScrittura; onMostrata?: () => void }) {
  const visibile = useTestoProgressivo(inScrittura.testo)
  const finita = !!inScrittura.completa && visibile.length === inScrittura.testo.length
  useEffect(() => { if (finita) onMostrata?.() }, [finita, onMostrata])
  return (
    <div className="max-w-[94%] self-start rounded-lg border bg-card px-3 py-2" aria-busy="true">
      <div className="mb-0.5 text-micro font-semibold text-muted-foreground">{chi}</div>
      {visibile ? (
        <Blocchi blocchi={blocchi(visibile)} aCapo className="[&>*+*]:mt-1.5" />
      ) : inScrittura.stato ? (
        <p className="flex items-center gap-2 text-xs text-foreground-2" role="status">
          <i className="size-1.5 shrink-0 rounded-full bg-status-run animate-pulsa" aria-hidden="true" />
          <span key={inScrittura.stato} className="animate-apparizione">{inScrittura.stato}</span>
        </p>
      ) : (
        <div className="flex gap-1 py-1" aria-label={`${chi} sta scrivendo`}>
          {[0, 1, 2].map((i) => <i key={i} className="size-1.5 rounded-full bg-muted-foreground animate-pulsa" style={{ animationDelay: `${i * 150}ms` }} />)}
        </div>
      )}
    </div>
  )
}

export function Messaggi({ messaggi, chi, pensa, inScrittura, onMostrata, errore, vuoto, className }: { messaggi: Messaggio[]; chi: string; pensa?: boolean; inScrittura?: InScrittura | null; onMostrata?: () => void; errore?: string | null; vuoto: ReactNode; className?: string }) {
  const fondo = useRef<HTMLDivElement>(null)
  useEffect(() => { fondo.current?.scrollIntoView({ block: "end" }) }, [messaggi.length, pensa, inScrittura?.testo.length, inScrittura?.stato])
  return (
    <div role="log" aria-live="polite" className={cn("flex flex-col gap-3", className)}>
      {messaggi.length === 0 && !pensa && !inScrittura && <div className="text-xs text-muted-foreground">{vuoto}</div>}
      {messaggi.map((m, i) => (
        <div key={i} className={cn("max-w-[94%] rounded-lg border px-3 py-2", m.mio ? "self-end border-primary/30 bg-primary-soft" : "self-start bg-card")}>
          <div className="mb-0.5 text-micro font-semibold text-muted-foreground">{m.mio ? "Tu" : chi}</div>
          {m.mio ? <div className="whitespace-pre-wrap text-sm">{m.testo}</div> : <Blocchi blocchi={blocchi(m.testo)} aCapo className="[&>*+*]:mt-1.5" />}
          {m.quando && <div className="mt-1 font-mono text-micro text-muted-foreground">{quandoBreve(m.quando)}</div>}
        </div>
      ))}
      {inScrittura && <BollaInScrittura key={inScrittura.messaggio ?? 0} chi={chi} inScrittura={inScrittura} onMostrata={onMostrata} />}
      {pensa && !inScrittura && (
        <div className="flex gap-1 self-start rounded-lg border bg-card px-3 py-2.5" aria-label={`${chi} sta scrivendo`}>
          {[0, 1, 2].map((i) => <i key={i} className="size-1.5 rounded-full bg-muted-foreground animate-pulsa" style={{ animationDelay: `${i * 150}ms` }} />)}
        </div>
      )}
      {errore && <Nota tono="crit" role="alert">{errore}</Nota>}
      <div ref={fondo} />
    </div>
  )
}

export function Composer({ onInvia, disabilitato, placeholder, etichetta, bozzaIniziale = "", mono, bottone = "Invia", className, suggerimenti }: {
  onInvia: (testo: string) => void; disabilitato?: boolean; placeholder: string; etichetta: string; bozzaIniziale?: string; mono?: boolean; bottone?: ReactNode; className?: string; suggerimenti?: string[]
}) {
  const [bozza, setBozza] = useState(bozzaIniziale)
  const invia = (t = bozza) => { const q = t.trim(); if (!q || disabilitato) return; onInvia(q); setBozza("") }
  return (
    <div className={cn("space-y-2", className)}>
      {suggerimenti && suggerimenti.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggerimenti.map((s) => (
            <button key={s} type="button" onClick={() => invia(s)} disabled={disabilitato}
              className="rounded-md border bg-card px-2 py-0.5 text-micro text-foreground-2 transition-colors duration-(--d-fast) hover:border-border-strong hover:text-foreground disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); invia() }}>
        <Input value={bozza} onChange={(e) => setBozza(e.target.value)} disabled={disabilitato} placeholder={placeholder} aria-label={etichetta} className={cn(mono && "font-mono text-xs")} />
        <Button type="submit" disabled={disabilitato || !bozza.trim()} aria-label={typeof bottone === "string" ? bottone : "Invia"}>
          {typeof bottone === "string" && bottone !== "Invia" ? bottone : <PaperPlaneRightIcon aria-hidden="true" />}
        </Button>
      </form>
    </div>
  )
}
