import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import type { ReactNode } from "react"

export interface Conferma { titolo: string; descrizione: ReactNode; etichetta: string; distruttiva?: boolean; onConferma: () => void }

/** Conferma solo per ciò che non si annulla: riesecuzioni, rigenerazioni.
    Sostituisce confirm(), che interrompe e non si può leggere accanto a
    ciò che sta per cambiare. */
export function DialogoConferma({ conferma, onChiudi }: { conferma: Conferma | null; onChiudi: () => void }) {
  return (
    <AlertDialog open={conferma !== null} onOpenChange={(v) => { if (!v) onChiudi() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{conferma?.titolo}</AlertDialogTitle>
          <AlertDialogDescription>{conferma?.descrizione}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: conferma?.distruttiva ? "destructive" : "default" })} onClick={() => { conferma?.onConferma(); onChiudi() }}>
            {conferma?.etichetta}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
