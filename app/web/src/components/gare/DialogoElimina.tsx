import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import type { Gara } from "@/lib/api"

/** Cancellazione non reversibile: nessun cestino, nessun ripristino. La
    conferma nomina esplicitamente la gara per evitare il click sbagliato
    su una card vicina in un elenco lungo. */
export function DialogoElimina({ gara, onChiudi, onConferma }: { gara: Gara | null; onChiudi: () => void; onConferma: (g: Gara) => void }) {
  const nome = gara?.nome || gara?.slug || ""
  return (
    <AlertDialog open={gara !== null} onOpenChange={(aperto) => { if (!aperto) onChiudi() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare definitivamente «{nome}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Documenti, elaborati, proposte e cronologia di questa gara andranno persi. L'operazione non si può annullare.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => { if (gara) onConferma(gara) }}>
            Elimina gara
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
