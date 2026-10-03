import { QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ElencoGare } from "@/components/gare/ElencoGare"
import { GaraPage, RedirectFaseCorrente } from "@/components/gara/GaraPage"
import { VistaFase } from "@/components/gara/VistaFase"
import { Fase6Dettaglio } from "@/components/gara/viste/Fase6"
import { Fase7Workspace } from "@/components/gara/viste/Fase7"
import { Brief } from "@/components/gara/viste/Brief"
import { Grafo } from "@/components/gara/viste/Grafo"
import { Attivita } from "@/components/gara/viste/Attivita"
import { Impostazioni } from "@/components/gara/viste/Impostazioni"
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
        <BrowserRouter>
          <a href="#contenuto" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-1.5 focus:shadow-pop">
            Salta al contenuto
          </a>
          <Routes>
            <Route path="/" element={<ElencoGare />} />
            <Route path="/gara/:slug" element={<GaraPage />}>
              <Route index element={<RedirectFaseCorrente />} />
              <Route path="fase/6/proposta/:id" element={<Fase6Dettaglio />} />
              <Route path="fase/7/deliverable/:id" element={<Fase7Workspace />} />
              <Route path="fase/:n" element={<VistaFase />} />
              <Route path="brief" element={<Brief />} />
              <Route path="grafo" element={<Grafo />} />
              <Route path="attivita" element={<Attivita />} />
              <Route path="impostazioni" element={<Impostazioni />} />
              <Route path="*" element={<RedirectFaseCorrente />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Notifiche />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
