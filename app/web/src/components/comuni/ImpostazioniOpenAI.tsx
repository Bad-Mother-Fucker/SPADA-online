// Chiave OpenAI per la generazione delle figure della relazione. Vale per
// tutta l'installazione; il backend la salva in _data/openai.env e la
// restituisce sempre mascherata. Senza chiave le figure si fanno a mano:
// prompt copiato in ChatGPT e immagine caricata.

import { useId, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Suggerimento } from "@/components/comuni/Primitivi"
import { DialogoConferma, type Conferma } from "@/components/gara/DialogoConferma"
import { useAzioniOpenAI } from "@/hooks/useGaraDati"
import type { StatoOpenAI } from "@/lib/api"
import { comeApiError } from "@/lib/risorsa"

export function DialogoChiaveOpenAI({ aperto, stato, onChiudi }: { aperto: boolean; stato?: StatoOpenAI; onChiudi: () => void }) {
  const id = useId()
  const az = useAzioniOpenAI()
  const [chiave, setChiave] = useState("")
  const [modello, setModello] = useState(stato?.modello || "gpt-image-1")
  const [errore, setErrore] = useState<string | null>(null)
  const daEnv = stato?.origine === "ambiente"
  const chiaveValida = chiave.trim().length === 0 ? !!stato?.configurata : /^\S{20,}$/.test(chiave.trim())
  const modelloValido = /^[A-Za-z0-9._-]+$/.test(modello.trim())

  const chiudi = () => { setChiave(""); setErrore(null); onChiudi() }
  const salva = () => {
    setErrore(null)
    const corpo: { chiave?: string; modello?: string } = { modello: modello.trim() }
    if (chiave.trim()) corpo.chiave = chiave.trim()
    az.salva.mutate(corpo, {
      onSuccess: () => {
        // Verifica subito: un errore di battitura si scopre qui, non alla prima figura.
        az.verifica.mutate(undefined, {
          onSuccess: (v) => {
            if (v.ok) { toast.success("Chiave OpenAI salvata e verificata."); chiudi() }
            else setErrore(`Salvata, ma la verifica non è riuscita: ${v.messaggio}`)
          },
          onError: (e) => setErrore(`Salvata, ma la verifica non è riuscita: ${comeApiError(e).message}`),
        })
      },
      onError: (e) => setErrore(comeApiError(e).message),
    })
  }
  const inCorso = az.salva.isPending || az.verifica.isPending

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) chiudi() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generazione immagini con OpenAI</DialogTitle>
          <DialogDescription>
            Con la chiave le figure della relazione si generano da SPADA. Senza, si copia il prompt in ChatGPT e si carica l'immagine.
            La chiave resta su questo computer e non viene più mostrata per intero.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (chiaveValida && modelloValido) salva() }}>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-chiave`}>Chiave API</Label>
            <Input id={`${id}-chiave`} type="password" autoComplete="off" spellCheck={false} className="font-mono" value={chiave}
              placeholder={stato?.configurata ? `Lascia vuoto per tenere ${stato.chiave}` : "sk-..."}
              disabled={daEnv} onChange={(e) => setChiave(e.target.value)} aria-describedby={`${id}-aiuto-chiave`} />
            <Suggerimento id={`${id}-aiuto-chiave`} tono={chiave && !chiaveValida ? "crit" : "neu"}>
              {daEnv ? "La chiave viene dalla variabile OPENAI_API_KEY dell'ambiente: si cambia da lì." : chiave && !chiaveValida ? "Non sembra una chiave OpenAI: copiala intera, senza spazi." : "La crei su platform.openai.com, alla voce API keys. La generazione ha un costo per immagine."}
            </Suggerimento>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-modello`}>Modello</Label>
            <Input id={`${id}-modello`} className="font-mono" value={modello} onChange={(e) => setModello(e.target.value)} />
            <Suggerimento tono={modelloValido ? "neu" : "crit"}>{modelloValido ? "Predefinito gpt-image-1. Cambialo solo se la tua chiave ne usa un altro." : "Solo lettere, cifre, punti e trattini."}</Suggerimento>
          </div>
          {errore && <p role="alert" className="text-xs text-status-crit">{errore}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={chiudi}>Annulla</Button>
            <Button type="submit" disabled={!chiaveValida || !modelloValido || inCorso}>{az.salva.isPending ? "Salvataggio" : az.verifica.isPending ? "Verifica" : "Salva e verifica"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Azioni della riga nelle impostazioni: inserisci o cambia, verifica, rimuovi. */
export function AzioniOpenAI({ stato, onApri }: { stato?: StatoOpenAI; onApri: () => void }) {
  const az = useAzioniOpenAI()
  const [conferma, setConferma] = useState<Conferma | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const verifica = () => {
    setEsito(null)
    az.verifica.mutate(undefined, {
      onSuccess: (v) => { if (v.ok) setEsito("Verificata"); else toast.error("Verifica non riuscita", { description: v.messaggio }) },
      onError: (e) => toast.error("Verifica non riuscita", { description: comeApiError(e).message }),
    })
  }
  const rimuovi = () => setConferma({
    titolo: "Rimuovere la chiave OpenAI?", etichetta: "Rimuovi", distruttiva: true,
    descrizione: "Le figure non si generano più da SPADA: si torna a copiare il prompt in ChatGPT e a caricare l'immagine. Le immagini già prodotte restano.",
    onConferma: () => az.rimuovi.mutate(undefined, { onSuccess: () => toast.success("Chiave rimossa."), onError: (e) => toast.error("Chiave non rimossa", { description: comeApiError(e).message }) }),
  })
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      {stato?.configurata ? (
        <>
          <Button size="sm" variant="outline" disabled={az.verifica.isPending} onClick={verifica}>{az.verifica.isPending ? "Verifica" : esito || "Verifica"}</Button>
          <Button size="sm" variant="outline" onClick={onApri}>Cambia</Button>
          {stato.origine === "impostazioni" && <Button size="sm" variant="ghost" disabled={az.rimuovi.isPending} onClick={rimuovi}>Rimuovi</Button>}
        </>
      ) : <Button size="sm" variant="outline" onClick={onApri}>Inserisci la chiave</Button>}
      <DialogoConferma conferma={conferma} onChiudi={() => setConferma(null)} />
    </div>
  )
}
