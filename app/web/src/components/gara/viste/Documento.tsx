// Gara brief e audit strategico per intero: una card per sezione di
// secondo livello, una scheda interna per ogni sottosezione, con tabelle,
// elenchi e avvisi resi dal renderer markdown.

import type { ReactNode } from "react"
import { toast } from "sonner"
import { ArrowSquareOutIcon, CopyIcon, DownloadSimpleIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Blocchi, Inline } from "@/components/comuni/Markdown"
import { Card } from "@/components/comuni/Primitivi"
import { BadgeStato } from "@/components/gare/BadgeStato"
import { useGara } from "../GaraContext"
import { Api } from "@/lib/api"
import { slugify } from "@/lib/formato"
import { testoSemplice, type Blocco, type Documento as DocumentoMd } from "@/lib/md"
import type { Tono } from "@/dominio/fasi"

export const idSezione = (t: string) => `sez-${slugify(t)}`

/** "**Classificazione:** ⚠️ BASSO" → { testo: "BASSO", tono: "attn" }. */
function classificazione(blocchi: Blocco[]): { testo: string; tono: Tono } | null {
  for (const b of blocchi) {
    const testo = b.tipo === "paragrafo" ? b.righe.join(" ") : b.tipo === "citazione" ? b.testo : ""
    const m = /\*\*Classificazione[^*]*\*\*\s*:?\s*(.+)$/i.exec(testo)
    if (!m) continue
    const grezzo = m[1]
    const valore = grezzo.replace(/^[^A-Za-zÀ-ÿ]+/, "").split(/\s[—–(]|\.\s/)[0].replace(/[*_]/g, "").trim()
    const tono: Tono = /🔴|❌/.test(grezzo) || /^CRITIC/i.test(valore) ? "crit"
      : /⚠/.test(grezzo) || /^(SFAV|LIMITAT|ASSENTE|BASSO)/i.test(valore) ? "attn"
      : /✅/.test(grezzo) || /^(OK|FAV|AMPIO)/i.test(valore) ? "ok"
      : /^(NON |N\.?D|N\.?C)/i.test(valore) ? "neu" : "run"
    return { testo: valore, tono }
  }
  return null
}

/** Riga di stato di una sezione del gara brief («> **Aggiornata:** Fase 2 ·
    03/10/2026 · …» o «> **Da completare:** in Fase 4…»): diventa un badge
    nella testata della sezione invece di una citazione nel testo. */
function statoSezione(blocchi: Blocco[]): { tono: Tono; testo: string; completo: string } | null {
  const b = blocchi[0]
  if (!b || b.tipo !== "citazione") return null
  const m = /^\*\*(Aggiornata|Da completare):?\*\*:?\s*(.*)$/i.exec(b.testo.trim())
  if (!m) return null
  const daCompletare = /^da completare/i.test(m[1])
  return {
    tono: daCompletare ? "neu" : "ok",
    testo: daCompletare ? `da completare ${m[2].replace(/[.:]\s*$/, "").split(",")[0]}` : m[2].split("·").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(", "),
    completo: m[2],
  }
}

export function DocumentoReso({ doc, kicker, percorsoHtml, percorsoMd, conClassificazione, conStatoSezione, sostituzioni = {} }: {
  doc: DocumentoMd; kicker: string; percorsoHtml: string; percorsoMd: string; conClassificazione?: boolean; conStatoSezione?: boolean
  /** Sezioni rese dalla vista al posto del loro testo, per prefisso del titolo in minuscolo. */
  sostituzioni?: Record<string, (id: string) => ReactNode>
}) {
  const { slug, output } = useGara()
  const titolo = doc.titolo.replace(/^(gara brief|audit strategico)\s*[—–-]\s*/i, "") || kicker
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <span className="text-micro text-muted-foreground">{kicker}</span>
          <div className="flex gap-2">
            {output.includes(percorsoHtml) && <Button size="sm" variant="outline" asChild><a href={Api.percorsoOutput(slug, percorsoHtml)} target="_blank" rel="noopener"><ArrowSquareOutIcon aria-hidden="true" />Versione da condividere</a></Button>}
            {output.includes(percorsoMd) && <Button size="sm" variant="ghost" asChild><a href={Api.percorsoOutput(slug, percorsoMd)} target="_blank" rel="noopener"><DownloadSimpleIcon aria-hidden="true" />Markdown</a></Button>}
          </div>
        </div>
        <h2 className="text-lg font-semibold tracking-tight"><Inline testo={titolo} /></h2>
        {doc.intro.length > 0 && <Blocchi blocchi={doc.intro} className="mt-2" />}
        {doc.sezioni.length > 3 && (
          <nav aria-label="Sezioni del documento" className="mt-3 flex flex-wrap gap-1.5">
            {doc.sezioni.map((s) => (
              <button key={s.titolo} type="button" onClick={() => document.getElementById(idSezione(s.titolo))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="rounded-md border bg-card px-2 py-0.5 text-micro text-foreground-2 transition-colors duration-(--d-fast) hover:border-border-strong hover:text-foreground">
                <Inline testo={s.titolo} />
              </button>
            ))}
          </nav>
        )}
      </Card>
      {doc.sezioni.map((s) => {
        const chiave = Object.keys(sostituzioni).find((k) => s.titolo.toLowerCase().startsWith(k))
        if (chiave) return <div key={s.titolo}>{sostituzioni[chiave](idSezione(s.titolo))}</div>
        const cl = conClassificazione ? classificazione(s.blocchi) : null
        const ss = conStatoSezione ? statoSezione(s.blocchi) : null
        const corpo = ss ? s.blocchi.slice(1) : s.blocchi
        return (
          <Card key={s.titolo} id={idSezione(s.titolo)} className="scroll-mt-16">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-md font-semibold"><Inline testo={s.titolo} /></h3>
              {cl && <BadgeStato tono={cl.tono}>{cl.testo}</BadgeStato>}
              {ss && <span title={testoSemplice(ss.completo)}><BadgeStato tono={ss.tono}>{testoSemplice(ss.testo)}</BadgeStato></span>}
            </div>
            {corpo.length > 0 && <Blocchi blocchi={corpo} />}
            {s.sottosezioni.map((sub) => (
              <article key={sub.titolo} className="mt-4 rounded-md border bg-background p-3">
                <h4 className="mb-1.5 text-sm font-semibold"><Inline testo={sub.titolo} /></h4>
                <Blocchi blocchi={sub.blocchi} />
              </article>
            ))}
          </Card>
        )
      })}
    </div>
  )
}

/** Copia negli appunti o scarica un testo: usato per le domande al
    professionista. `testo` è una funzione: si esporta ciò che è scritto in
    quel momento, anche se non ancora salvato. */
export function AzioniEsporta({ testo, nomeFile, conRisposte, onConRisposte, quante }: { testo: () => string; nomeFile: () => string; conRisposte: boolean; onConRisposte: (v: boolean) => void; quante: number }) {
  const copia = async () => {
    try { await navigator.clipboard.writeText(testo()) } catch {
      const t = document.createElement("textarea"); t.value = testo(); t.style.position = "fixed"; t.style.opacity = "0"
      document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove()
    }
    toast.success(`${quante} ${quante === 1 ? "domanda copiata" : "domande copiate"} negli appunti${conRisposte ? ", con le risposte" : ""}.`)
  }
  const scarica = () => {
    const url = URL.createObjectURL(new Blob([testo()], { type: "text/plain;charset=utf-8" }))
    const a = document.createElement("a"); a.href = url; a.download = nomeFile(); a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="mr-1 inline-flex items-center gap-1.5 text-foreground-2"><input type="checkbox" checked={conRisposte} onChange={(e) => onConRisposte(e.target.checked)} className="accent-primary" />con le risposte</label>
      <Button size="sm" variant="outline" onClick={copia}><CopyIcon aria-hidden="true" />Copia</Button>
      <Button size="sm" variant="outline" onClick={scarica}><DownloadSimpleIcon aria-hidden="true" />Scarica .txt</Button>
    </div>
  )
}
