// Accesso a Claude per SPADA dal menu del profilo, al posto di
// `./spada login` nel terminale. Il backend avvia `claude auth login`
// sulla configurazione dedicata: il browser del Mac si apre da sé sulla
// pagina di Anthropic. Se il ritorno automatico non riesce, quella pagina
// mostra un codice che si incolla qui.

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Api, type StatoLoginClaude } from "@/lib/api"
import { comeApiError } from "@/lib/risorsa"

export const CHIAVE_LOGIN = ["sistema", "login-claude"] as const

/** Stato dell'accesso: interroga spesso solo mentre un login è in corso. */
export function useLoginClaude() {
  return useQuery({
    queryKey: CHIAVE_LOGIN,
    queryFn: ({ signal }) => Api.loginClaude({ signal, timeoutMs: 40_000 }),
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.login.fase === "in_attesa" ? 2_000 : 60_000),
  })
}

export function DialogoLoginClaude({ aperto, onChiudi }: { aperto: boolean; onChiudi: () => void }) {
  const qc = useQueryClient()
  const { data } = useLoginClaude()
  const [codice, setCodice] = useState("")
  const [invio, setInvio] = useState<"avvio" | "codice" | null>(null)
  const giaCollegato = useRef(false)

  const aggiorna = (d: StatoLoginClaude) => qc.setQueryData(CHIAVE_LOGIN, d)

  // All'apertura si avvia il login (che apre il browser), una volta sola.
  useEffect(() => {
    if (!aperto) return
    giaCollegato.current = !!data?.disponibile
    setCodice("")
    setInvio("avvio")
    Api.avviaLoginClaude()
      .then(aggiorna)
      .catch((e) => toast.error("Accesso non avviato", { description: comeApiError(e).message }))
      .finally(() => setInvio(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto])

  // Collegato: si chiude da solo e lo si dice.
  useEffect(() => {
    if (!aperto || !data) return
    if (data.disponibile && data.login.fase !== "in_attesa" && invio === null && (data.login.fase === "concluso" || !giaCollegato.current)) {
      toast.success("Claude collegato", { description: data.account ? `Account ${data.account}. Le fasi ora possono partire.` : "Le fasi ora possono partire." })
      void qc.invalidateQueries({ queryKey: ["sistema"] })
      onChiudi()
    }
  }, [aperto, data, invio, onChiudi, qc])

  const inviaCodice = () => {
    setInvio("codice")
    Api.codiceLoginClaude(codice)
      .then((d) => {
        aggiorna(d)
        if (!d.disponibile) toast.error("Codice non accettato", { description: d.login.messaggio || "Riprova: il codice vale pochi minuti." })
      })
      .catch((e) => toast.error("Codice non inviato", { description: comeApiError(e).message }))
      .finally(() => setInvio(null))
  }

  const chiudi = () => {
    if (data?.login.fase === "in_attesa") void Api.annullaLoginClaude().then(aggiorna).catch(() => undefined)
    onChiudi()
  }

  const fase = data?.login.fase
  const url = data?.login.url
  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) chiudi() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Accedi a Claude per SPADA</DialogTitle>
          <DialogDescription>
            Le fasi della pipeline girano con questo account. È una configurazione dedicata: il Claude Code che usi nel terminale non cambia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p role="status" className="flex items-center gap-2 text-foreground-2">
            <i className="size-1.5 rounded-full bg-status-run animate-pulsa" aria-hidden="true" />
            {invio === "avvio" ? "Apro la pagina di accesso…" : invio === "codice" ? "Verifico il codice…"
              : fase === "fallito" ? "L'accesso non è riuscito: chiudi e riprova."
              : "Completa l'accesso nella scheda del browser che si è aperta. Questa finestra si chiude da sola."}
          </p>
          {url && (
            <p className="text-micro text-muted-foreground">
              Il browser non si è aperto?{" "}
              <a href={url} target="_blank" rel="noopener" className="text-primary underline-offset-4 hover:underline">Apri la pagina di accesso</a>.
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="codice-login" className="text-xs font-medium">Se la pagina ti mostra un codice, incollalo qui</label>
            <div className="flex gap-2">
              <Input id="codice-login" value={codice} autoComplete="off" spellCheck={false}
                onChange={(e) => setCodice(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && codice.trim() && !invio) inviaCodice() }} />
              <Button variant="outline" disabled={!codice.trim() || !!invio || fase !== "in_attesa"} onClick={inviaCodice}>Invia</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={chiudi}>Annulla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
