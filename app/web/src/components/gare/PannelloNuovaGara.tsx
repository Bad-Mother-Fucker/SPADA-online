import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { InfoIcon, WarningIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { urlGara } from "./CardGara"
import { Suggerimento } from "@/components/comuni/Primitivi"
import { NOTA_BACKGROUND } from "@/components/comuni/CaricaPrezzario"
import { useCaricaPrezzario, useImportPrezzarioInCorso } from "@/hooks/useGaraDati"
import { useCreaGara, usePrezzari } from "@/hooks/useGare"
import type { Prezzario } from "@/lib/api"
import { slugify } from "@/lib/formato"
import { comeApiError } from "@/lib/risorsa"
import { cn } from "@/lib/utils"
import { EFFORT, EFFORT_HINT, MODELLI, type Effort, type Modello } from "@/dominio/fasi"

const ALTRO = "__altro__"
const ANNO_CORRENTE = String(new Date().getFullYear())

interface Form {
  nome: string
  slug: string
  slugAuto: boolean
  regione: string
  anno: string
  altro: boolean   // regione e anno scritti a mano: prezzario non (ancora) presente
  modello: Modello
  effort: Effort
}

const FORM_VUOTO: Form = { nome: "", slug: "", slugAuto: true, regione: "", anno: ANNO_CORRENTE, altro: false, modello: MODELLI[0].id, effort: "high" }


/** Il pannello laterale "Nuova gara": l'elenco resta visibile dietro, con i
    nomi delle gare esistenti che aiutano a scegliere slug e nome. */
export function PannelloNuovaGara({ aperto, onApertoChange, slugPresi }: { aperto: boolean; onApertoChange: (v: boolean) => void; slugPresi: string[] }) {
  const id = useId()
  const [form, setForm] = useState<Form>(FORM_VUOTO)
  const [toccato, setToccato] = useState<{ nome?: boolean; slug?: boolean; invio?: boolean }>({})
  const [erroreServer, setErroreServer] = useState<{ messaggio: string; campo?: "slug" } | null>(null)
  const prezzari = usePrezzari(aperto)
  const crea = useCreaGara()
  const caricaPrezzario = useCaricaPrezzario()
  // File PriMus del prezzario mancante: si importa in background dopo la creazione.
  const [dcf, setDcf] = useState<File | null>(null)
  const refErrore = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // L'errore del server compare in fondo al modulo: va portato in vista.
  useEffect(() => {
    if (erroreServer && !erroreServer.campo) refErrore.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [erroreServer])

  // Ogni apertura è un modulo nuovo.
  useEffect(() => {
    if (aperto) { setForm(FORM_VUOTO); setToccato({}); setErroreServer(null); setDcf(null); crea.reset() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto])

  const elenco: Prezzario[] = useMemo(() => (Array.isArray(prezzari.data) ? prezzari.data : []), [prezzari.data])
  const conElenco = prezzari.isSuccess && elenco.length > 0
  const regioni = useMemo(() => [...new Set(elenco.map((p) => p.regione))].sort(), [elenco])

  const anniPer = (regione: string) => [...new Set(elenco.filter((p) => p.regione === regione).map((p) => p.anno))].sort((a, b) => b - a)
  const aggiorna = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setErroreServer(null) }

  // Nel modulo stanno solo le scelte esplicite; i predefiniti (prima regione
  // installata, anno più recente per quella regione) si derivano qui, così
  // valgono appena l'elenco arriva e non dipendono da un effetto.
  const daElenco = conElenco && !form.altro
  const regione = daElenco ? (form.regione && regioni.includes(form.regione) ? form.regione : regioni[0]) : form.regione
  const anno = (() => {
    if (!daElenco) return form.anno
    const anni = anniPer(regione)
    return anni.some((a) => String(a) === form.anno) ? form.anno : String(anni[0] ?? form.anno)
  })()

  const slugCorrente = form.slugAuto ? slugify(form.nome) : form.slug

  const AIUTO_NOME = "Come compare nell'oggetto del disciplinare. Viene riportato negli elaborati prodotti."
  const validazioneNome = (() => {
    const n = form.nome.trim()
    if (n.length === 0) return { ok: false, msg: "Il nome è obbligatorio." }
    if (n.length < 4) return { ok: false, msg: "Almeno 4 caratteri." }
    return { ok: true, msg: AIUTO_NOME }
  })()

  const validazioneSlug = (() => {
    const sl = slugCorrente
    if (erroreServer?.campo === "slug") return { ok: false, msg: erroreServer.messaggio, crit: true }
    if (!sl) return { ok: false, msg: "Si genera dal nome, oppure lo scrivi tu.", crit: false }
    if (sl.length < 6) return { ok: false, msg: "Almeno 6 caratteri: minuscolo, senza spazi.", crit: true }
    if (slugPresi.includes(sl)) return { ok: false, msg: "Slug già usato da un'altra gara: aggiungi un riferimento, per esempio anno o lotto.", crit: true }
    if (!/^[a-z0-9-]{1,64}$/.test(sl)) return { ok: false, msg: "Solo minuscole, cifre e trattini.", crit: true }
    return { ok: true, msg: form.slugAuto ? "Derivato dal nome. Modificabile finché la gara non è avviata." : "Modificabile finché la gara non è avviata.", crit: false }
  })()

  /* Il prezzario serve alle valutazioni economiche, non per registrare né
     per eseguire la gara: senza, le fasi girano lo stesso. Regione e anno
     restano obbligatori, perché dicono quale prezzario manca. */
  const importInCorso = useImportPrezzarioInCorso(regione, Number(anno))
  const validazionePrezzario = (() => {
    const r = regione.trim()
    const a = Number(anno)
    if (!r) return { ok: false, msg: "Indica la regione del prezzario di riferimento.", avviso: false, mancante: false }
    if (!Number.isInteger(a) || a < 2000 || a > 2100) return { ok: false, msg: "L'anno deve essere fra 2000 e 2100.", avviso: false, mancante: false }
    if (prezzari.isSuccess && !elenco.some((p) => p.regione.toLowerCase() === r.toLowerCase() && p.anno === a)) {
      if (importInCorso) return { ok: true, avviso: false, mancante: false, msg: `Il prezzario ${r} ${a} è in importazione: sarà disponibile fra poco, puoi creare la gara.` }
      return { mancante: true, ok: true, avviso: true, msg: `Il prezzario ${r} ${a} non è presente: la gara si crea e si esegue lo stesso, ma senza valutazioni economiche. Se hai il file .dcf della regione puoi caricarlo qui sotto.` }
    }
    const voci = elenco.find((p) => p.regione.toLowerCase() === r.toLowerCase() && p.anno === a)?.totale_voci
    return { ok: true, avviso: false, mancante: false, msg: voci ? `Prezzario ${r} ${a} presente, ${voci.toLocaleString("it-IT")} voci.` : "" }
  })()

  const valido = validazioneNome.ok && validazioneSlug.ok && validazionePrezzario.ok && !crea.isPending

  function invia(e: React.FormEvent) {
    e.preventDefault()
    setToccato({ nome: true, slug: true, invio: true })
    if (!valido) return
    const slug = slugCorrente
    crea.mutate(
      { slug, nome: form.nome.trim(), regione: regione.trim(), anno_prezzario: Number(anno), modello: form.modello, effort: form.effort },
      {
        onSuccess: () => {
          toast.success("Gara creata", { description: "Il prossimo passo è caricare i documenti." })
          // Dopo la creazione, non prima: un modulo da correggere non deve
          // lanciare due volte lo stesso import. Non si aspetta: va in
          // background e la notifica arriva da useCaricaPrezzario.
          if (dcf && validazionePrezzario.mancante) caricaPrezzario.mutate({ regione: regione.trim(), anno: Number(anno), file: dcf })
          onApertoChange(false)
          // Si atterra sulla Fase 1: la gara appena creata non ha altro da
          // mostrare che la zona di caricamento.
          navigate(urlGara(slug, 1))
        },
        onError: (e) => {
          const err = comeApiError(e, "/gare")
          if (err.stato === 409) setErroreServer({ messaggio: err.message, campo: "slug" })
          else setErroreServer({ messaggio: err.message })
        },
      },
    )
  }

  const chiudibile = !crea.isPending
  const mostraNome = toccato.nome || toccato.invio
  const mostraSlug = toccato.slug || toccato.invio || erroreServer?.campo === "slug"

  return (
    <Sheet open={aperto} onOpenChange={(v) => { if (v || chiudibile) onApertoChange(v) }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]"
        onEscapeKeyDown={(e) => { if (!chiudibile) e.preventDefault() }}
        onInteractOutside={(e) => { if (!chiudibile) e.preventDefault() }}
      >
        <form onSubmit={invia} className="flex min-h-0 flex-1 flex-col" noValidate>
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle className="text-md">Nuova gara</SheetTitle>
            <SheetDescription>La pipeline parte dopo il caricamento dei documenti. Qui definisci identificativi e parametri del modello.</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={`${id}-nome`}>Nome esteso della gara</Label>
                <span className="font-mono text-micro text-muted-foreground" aria-hidden="true">{form.nome.length} / 180</span>
              </div>
              <Input
                id={`${id}-nome`} value={form.nome} maxLength={180} autoFocus autoComplete="off"
                placeholder="Es. Servizio di manutenzione degli impianti elevatori, ASL Napoli 3 Sud"
                aria-invalid={mostraNome && !validazioneNome.ok ? true : undefined}
                aria-describedby={`${id}-nome-hint`}
                onChange={(e) => aggiorna({ nome: e.target.value })}
                onBlur={() => setToccato((t) => ({ ...t, nome: true }))}
              />
              <Suggerimento id={`${id}-nome-hint`} tono={mostraNome && !validazioneNome.ok ? "crit" : "neu"}>{mostraNome ? validazioneNome.msg : AIUTO_NOME}</Suggerimento>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-slug`}>Slug</Label>
              <div className={cn("flex items-center overflow-hidden rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", mostraSlug && !validazioneSlug.ok && validazioneSlug.crit && "border-destructive")}>
                <span className="pl-2.5 font-mono text-xs text-muted-foreground" aria-hidden="true">/gare/</span>
                <input
                  id={`${id}-slug`} value={slugCorrente} autoComplete="off" spellCheck={false}
                  className="h-8 min-w-0 flex-1 bg-transparent px-1 font-mono text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="manutenzione-elevatori-asl-na3"
                  aria-invalid={mostraSlug && !validazioneSlug.ok && validazioneSlug.crit ? true : undefined}
                  aria-describedby={`${id}-slug-hint`}
                  onChange={(e) => aggiorna({ slug: e.target.value, slugAuto: false })}
                  onBlur={() => setToccato((t) => ({ ...t, slug: true }))}
                />
                {form.slugAuto && slugCorrente && <span className="mr-2 rounded-sm bg-muted px-1.5 text-micro text-foreground-2">generato</span>}
              </div>
              <Suggerimento id={`${id}-slug-hint`} tono={mostraSlug && !validazioneSlug.ok && validazioneSlug.crit ? "crit" : "neu"}>{validazioneSlug.msg}</Suggerimento>
            </div>

            <div className="grid gap-1.5">
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-regione`}>Regione del prezzario</Label>
                  {conElenco ? (
                    <Select
                      value={form.altro ? ALTRO : regione}
                      onValueChange={(v) => {
                        if (v === ALTRO) aggiorna({ altro: true, regione: "", anno: ANNO_CORRENTE })
                        else aggiorna({ altro: false, regione: v, anno: String(anniPer(v)[0] ?? anno) })
                      }}
                    >
                      <SelectTrigger id={`${id}-regione`} className="w-full"><SelectValue placeholder="Scegli una regione" /></SelectTrigger>
                      <SelectContent>
                        {regioni.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        <SelectItem value={ALTRO}>Altra regione o anno</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`${id}-regione`} value={form.regione} placeholder={prezzari.isPending ? "Lettura dei prezzari…" : "Es. Puglia"} onChange={(e) => aggiorna({ regione: e.target.value, altro: true })} />
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-anno`}>Anno</Label>
                  {conElenco && !form.altro ? (
                    <Select value={anno} onValueChange={(v) => aggiorna({ anno: v })}>
                      <SelectTrigger id={`${id}-anno`} className="w-full font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>{anniPer(regione).map((a) => <SelectItem key={a} value={String(a)} className="font-mono">{a}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input id={`${id}-anno`} type="number" inputMode="numeric" min={2000} max={2100} value={form.anno} className="font-mono" onChange={(e) => aggiorna({ anno: e.target.value })} />
                  )}
                </div>
              </div>
              {conElenco && form.altro && (
                <Input aria-label="Regione del prezzario, scritta a mano" value={form.regione} placeholder="Es. Puglia" autoFocus onChange={(e) => aggiorna({ regione: e.target.value })} />
              )}
              {validazionePrezzario.msg && (validazionePrezzario.ok || toccato.invio) && (
                <Suggerimento tono={!validazionePrezzario.ok ? "crit" : validazionePrezzario.avviso ? "attn" : "neu"}>{validazionePrezzario.msg}</Suggerimento>
              )}
              {validazionePrezzario.mancante && (
                <div className="mt-1 grid gap-1.5">
                  <Label htmlFor={`${id}-dcf`}>File del prezzario (.dcf), facoltativo</Label>
                  <Input id={`${id}-dcf`} type="file" accept=".dcf,.DCF" onChange={(e) => setDcf(e.target.files?.[0] || null)} />
                  <Suggerimento>Il file PriMus pubblicato dalla regione. {NOTA_BACKGROUND} Intanto puoi caricare i documenti della gara.</Suggerimento>
                </div>
              )}
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Modello</legend>
              <RadioGroup value={form.modello} onValueChange={(v) => aggiorna({ modello: v as Modello })} className="grid grid-cols-2 gap-2">
                {MODELLI.map((m) => (
                  <Label key={m.id} htmlFor={`${id}-mod-${m.id}`} className={cn("flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-2.5 text-xs font-normal text-foreground-2 transition-colors duration-(--d-fast) hover:border-border-strong has-data-[state=checked]:border-foreground", form.modello === m.id && "border-foreground")}>
                    <span className="flex items-center gap-2 font-mono text-sm font-medium text-foreground"><RadioGroupItem id={`${id}-mod-${m.id}`} value={m.id} />{m.id}</span>
                    <span>{m.hint}</span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Effort</legend>
              <div role="radiogroup" aria-label="Effort" className="inline-flex w-max overflow-hidden rounded-lg border border-input">
                {EFFORT.map((e) => (
                  <button
                    key={e} type="button" role="radio" aria-checked={form.effort === e}
                    onClick={() => aggiorna({ effort: e })}
                    className={cn("px-3 py-1 font-mono text-xs transition-colors duration-(--d-fast)", form.effort === e ? "bg-foreground text-background" : "text-foreground-2 hover:bg-muted")}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <Suggerimento>{EFFORT_HINT[form.effort]}</Suggerimento>
            </fieldset>

            <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-foreground-2">
              <InfoIcon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Modello ed effort restano modificabili fino all'avvio della Fase 1 e per ogni riesecuzione successiva.
            </p>

            {erroreServer && !erroreServer.campo && (
              <div ref={refErrore} role="alert" className="animate-scossa flex gap-2 rounded-md border border-status-crit/40 bg-status-crit-soft px-3 py-2 text-xs">
                <WarningIcon size={14} className="mt-0.5 shrink-0 text-status-crit" aria-hidden="true" />
                <span><b className="font-medium">Creazione non riuscita.</b> {erroreServer.messaggio} I dati inseriti sono ancora qui: correggi se serve e riprova.</span>
              </div>
            )}
          </div>

          <SheetFooter className="flex-row items-center justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onApertoChange(false)} disabled={!chiudibile}>Annulla</Button>
            <Button type="submit" disabled={crea.isPending || (toccato.invio === true && !valido)}>
              {crea.isPending ? "Creazione in corso" : erroreServer && !erroreServer.campo ? "Riprova" : "Crea e carica documenti"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
