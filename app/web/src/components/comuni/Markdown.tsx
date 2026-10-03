// Rendering dei documenti e delle risposte markdown: blocchi e formattazione
// in linea, dal modello di lib/md.ts. Il testo arriva da documenti di gara e
// dagli agenti: mai HTML, sempre nodi React.

import { Fragment, type ReactNode } from "react"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { Nota } from "./Primitivi"
import { cn } from "@/lib/utils"
import { inline, tonoCitazione, type Blocco, type TokenInline } from "@/lib/md"

export function Inline({ tokens, testo }: { tokens?: TokenInline[]; testo?: string }) {
  const t = tokens ?? inline(testo)
  return (
    <>
      {t.map((tk, i) => {
        switch (tk.tipo) {
          case "testo": return <Fragment key={i}>{tk.testo}</Fragment>
          case "strong": return <strong key={i} className="font-semibold text-foreground"><Inline tokens={tk.figli} /></strong>
          case "em": return <em key={i}><Inline tokens={tk.figli} /></em>
          case "code": return <code key={i} className="rounded-sm bg-muted px-1 font-mono text-[0.92em] text-foreground">{tk.testo}</code>
          case "ref": return <span key={i} className="rounded-sm bg-primary-soft px-1 font-mono text-[0.92em] text-primary">{tk.testo}</span>
          case "link": return <a key={i} href={tk.href} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">{tk.testo}</a>
        }
      })}
    </>
  )
}

function Lista({ b, aCapo }: { b: Extract<Blocco, { tipo: "lista" }>; aCapo?: boolean }) {
  const Tag = b.ordinata ? "ol" : "ul"
  const radice: ReactNode[] = []
  let sotto: ReactNode[] = []
  const chiudiSotto = (k: string) => {
    if (sotto.length) {
      radice.push(<Tag key={`s${k}`} className={cn("mt-0.5 space-y-0.5 pl-5", b.ordinata ? "list-decimal" : "list-disc")}>{sotto}</Tag>)
      sotto = []
    }
  }
  b.voci.forEach((v, i) => {
    const li = <li key={i}><Inline testo={v.testo} /></li>
    if (v.livello === 1 && radice.length) sotto.push(li)
    else { chiudiSotto(String(i)); radice.push(li) }
  })
  chiudiSotto("fine")
  // Le sottoliste vanno dentro l'ultimo elemento: qui restano sorelle per
  // semplicità visiva, con lo stesso rientro.
  return <Tag className={cn("my-1.5 space-y-0.5 pl-5", b.ordinata ? "list-decimal" : "list-disc", aCapo && "my-1")}>{radice}</Tag>
}

/** Blocchi di un documento. `aCapo`: nelle risposte della chat ogni riga
    di un paragrafo resta una riga, invece di scorrere come prosa. */
export function Blocchi({ blocchi, aCapo, className }: { blocchi: Blocco[]; aCapo?: boolean; className?: string }) {
  return (
    <div className={cn("text-sm leading-[1.6] text-foreground-2 [&>*+*]:mt-2", className)}>
      {blocchi.map((b, i) => {
        switch (b.tipo) {
          case "titolo": {
            const Tag = b.livello <= 2 ? "h4" : "h5"
            return <Tag key={i} className={cn("font-semibold text-foreground", b.livello <= 2 ? "mt-3 text-sm" : "mt-2 text-xs")}><Inline testo={b.testo} /></Tag>
          }
          case "hr": return null
          case "tabella":
            return (
              <div key={i} className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-foreground-2">
                    <tr>{b.intestazioni.map((c, j) => <th key={j} className="px-2.5 py-1.5 text-left font-medium"><Inline testo={c} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.corpo.map((r, k) => (
                      <tr key={k} className="border-t">
                        {b.intestazioni.map((_, j) => <td key={j} className="px-2.5 py-1.5 align-top"><Inline testo={r[j] || ""} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case "citazione":
            return <Nota key={i} tono={tonoCitazione(b.testo)}><Blocchi blocchi={b.figli} aCapo={aCapo} className="text-xs" /></Nota>
          case "lista": return <Lista key={i} b={b} aCapo={aCapo} />
          case "paragrafo": {
            const statoAnalisi = /^\*\*Stato analisi:\*\*\s*(.*)$/i.exec(b.righe.join(" "))
            if (statoAnalisi) {
              const valore = statoAnalisi[1].trim()
              return (
                <p key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Stato analisi</span>
                  <BadgeStato tono={/non ancora|da analizzare|tbd/i.test(valore) ? "neu" : "ok"}><Inline testo={valore} /></BadgeStato>
                </p>
              )
            }
            // Righe «**Etichetta:** valore», una per riga, come nelle intestazioni dei documenti.
            const aRighe = aCapo || (b.righe.length > 1 && b.righe.every((r) => /^\*\*[^*]+:\*\*/.test(r)))
            return (
              <p key={i}>
                {b.righe.map((r, k) => (
                  <Fragment key={k}>{k > 0 && (aRighe ? <br /> : " ")}<Inline testo={r} /></Fragment>
                ))}
              </p>
            )
          }
        }
      })}
    </div>
  )
}
