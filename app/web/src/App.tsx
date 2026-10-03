import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ElencoGare } from "@/components/gare/ElencoGare"
import { useTema } from "@/hooks/useTema"
import { queryClient } from "@/lib/query"

function Notifiche() {
  const { effettivo } = useTema()
  return <Toaster theme={effettivo} position="bottom-left" closeButton duration={5000} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <a href="#contenuto" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-1.5 focus:shadow-pop">
          Salta all'elenco delle gare
        </a>
        <ElencoGare />
        <Notifiche />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
