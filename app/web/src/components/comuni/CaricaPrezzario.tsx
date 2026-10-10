/** Prezzario da file PriMus (.dcf), quello che le regioni pubblicano sul
    proprio sito: lo converte e lo importa il server, senza terminale né
    release in prometeus-prezzari. Due ingressi: dall'avviso della gara
    (regione e anno già noti) e dalle impostazioni di sistema. */
import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Suggerimento } from "@/components/comuni/Primitivi"
import { useCaricaPrezzario } from "@/hooks/useGaraDati"

/** Chi carica un .dcf non resta ad aspettare: l'import va in background e la
    notifica arriva a fine lavoro (useCaricaPrezzario). */
export const NOTA_BACKGROUND = "L'import continua in background, anche se cambi pagina: ti avviso quando il prezzario è disponibile."

/** Pulsante per la gara: regione e anno sono quelli del suo manifesto. */
export function PulsanteCaricaDcf({ regione, anno }: { regione: string; anno: number }) {
  const input = useRef<HTMLInputElement>(null)
  const carica = useCaricaPrezzario()

  function scelto(file: File | undefined) {
    if (file) carica.mutate({ regione, anno, file })
  }

  return (
    <>
      <input ref={input} type="file" accept=".dcf,.DCF" hidden onChange={(e) => { scelto(e.target.files?.[0]); e.target.value = "" }} />
      <Button size="sm" variant="outline" disabled={carica.isPending} onClick={() => input.current?.click()}>
        {carica.isPending ? "Importazione in corso" : "Carica file .dcf"}
      </Button>
    </>
  )
}

/** Dialogo delle impostazioni: un prezzario qualsiasi, regione e anno a mano. */
export function DialogoCaricaPrezzario({ aperto, onChiudi }: { aperto: boolean; onChiudi: () => void }) {
  const id = useId()
  const carica = useCaricaPrezzario()
  const [regione, setRegione] = useState("")
  const [anno, setAnno] = useState(String(new Date().getFullYear()))
  const [file, setFile] = useState<File | null>(null)

  const annoNum = Number(anno)
  const valido = regione.trim().length >= 2 && Number.isInteger(annoNum) && annoNum >= 2000 && annoNum <= 2100 && !!file

  function chiudi() {
    setFile(null)
    onChiudi()
  }

  function invia() {
    if (!valido || !file) return
    carica.mutate({ regione: regione.trim(), anno: annoNum, file })
    setRegione("")
    chiudi()
  }

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) chiudi() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aggiungi un prezzario da file</DialogTitle>
          <DialogDescription>
            Il file PriMus (.dcf) che la regione pubblica sul proprio sito. Regione e anno devono essere quelli
            dell'edizione: se il file dichiara un anno diverso viene rifiutato e non cambia nulla.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); invia() }}>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-regione`}>Regione</Label>
              <Input id={`${id}-regione`} value={regione} placeholder="Es. Basilicata" onChange={(e) => setRegione(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-anno`}>Anno</Label>
              <Input id={`${id}-anno`} inputMode="numeric" value={anno} onChange={(e) => setAnno(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-file`}>File del prezzario</Label>
            <Input id={`${id}-file`} type="file" accept=".dcf,.DCF" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <Suggerimento>{NOTA_BACKGROUND}</Suggerimento>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={chiudi}>Annulla</Button>
            <Button type="submit" disabled={!valido}>Importa</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
