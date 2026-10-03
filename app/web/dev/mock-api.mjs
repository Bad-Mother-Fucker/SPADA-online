#!/usr/bin/env node
// Backend finto per esercitare gli stati dell'interfaccia senza toccare
// quello vero. Nessuna dipendenza.
//
//   node dev/mock-api.mjs            # porta 8765
//   SPADA_API_URL=http://127.0.0.1:8765 npx vite --port 5174
//
// Scenari, cambiabili a caldo con GET /_scenario/<nome>:
//   normale   cinque gare con stati diversi, prezzari installati
//   vuoto     nessuna gara
//   errore    ogni richiesta risponde 503
//   lento     ogni risposta arriva dopo 4 secondi
//   timeout   le richieste non rispondono mai
//   rete      la connessione viene chiusa senza risposta
//   senza-prezzari   come normale, ma nessun prezzario installato

import http from "node:http"

const PORTA = Number(process.env.PORTA || 8765)
let scenario = process.env.SCENARIO || "normale"

const ora = Date.now()
const iso = (minutiFa) => new Date(ora - minutiFa * 60_000).toISOString()
const giorni = (n) => new Date(ora + n * 86_400_000).toISOString().slice(0, 10)

const fasi = (stati) => {
  const chiavi = ["1_acquisizione_documenti", "2_costruzione_grafo", "3_analisi_strategica", "4_elaborazione_criteri", "5_revisione_proposte", "6_stesura_offerta", "7_approvazione_finale"]
  const out = {}
  chiavi.forEach((k, i) => {
    const s = stati[i] || "da_eseguire"
    out[k] = s === "da_rivedere"
      ? { stato: "completato", richiede_approvazione: true, conclusa_il: iso(60 * 24 * 2 + 18) }
      : { stato: s, iniziata_il: s === "da_eseguire" ? null : iso(30 * (7 - i)), conclusa_il: s === "completato" ? iso(20 * (7 - i)) : null }
  })
  return out
}

let gare = [
  { slug: "manutenzione-elevatori-asl-na3", nome: "Servizio di manutenzione degli impianti elevatori, ASL Napoli 3 Sud", regione: "Campania", anno_prezzario: 2026, modello: "opus", effort: "high", creato_il: iso(60 * 24 * 9), stato: "creata", prezzario_disponibile: true,
    fasi: fasi(["completato", "completato", "completato", "completato", "da_rivedere"]), scadenza: giorni(14), elaborati: 12 },
  { slug: "riqualificazione-scuola-via-roma", nome: "Riqualificazione energetica della scuola primaria di via Roma, Comune di Potenza", regione: "Basilicata", anno_prezzario: 2025, modello: "opus", effort: "high", creato_il: iso(60 * 24 * 2), stato: "creata", prezzario_disponibile: true,
    fasi: fasi(["completato", "in_esecuzione"]), scadenza: giorni(40), elaborati: 4 },
  { slug: "adeguamento-sismico-palestra", nome: "Lavori di adeguamento sismico della palestra comunale, Comune di Cosenza", regione: "Calabria", anno_prezzario: 2024, modello: "sonnet", effort: "medium", creato_il: iso(60 * 24 * 5), stato: "creata", prezzario_disponibile: false,
    fasi: fasi(["completato", "completato", "errore"]), scadenza: giorni(6), elaborati: 6 },
  { slug: "verde-pubblico-rc-2026", nome: "Manutenzione del verde pubblico 2026, Comune di Reggio Calabria", regione: "Calabria", anno_prezzario: 2025, modello: "opus", effort: "medium", creato_il: iso(60 * 24 * 30), stato: "creata", prezzario_disponibile: true,
    fasi: fasi(["completato", "completato", "completato", "completato", "completato", "completato", "completato"]), scadenza: giorni(-2), elaborati: 14 },
  { slug: "arredi-scolastici-matera-istituto-comprensivo-lotto-2-annualita-2026", nome: "", regione: "Basilicata", anno_prezzario: 2025, modello: "sonnet", effort: "low", creato_il: iso(3), stato: "creata", prezzario_disponibile: true,
    fasi: {}, scadenza: null, elaborati: 0 },
]

const prezzari = [
  { regione: "Basilicata", anno: 2025, importato_il: iso(60 * 24), totale_voci: 17928 },
  { regione: "Calabria", anno: 2025, importato_il: iso(60 * 24), totale_voci: 11077 },
  { regione: "Campania", anno: 2026, importato_il: iso(60 * 24), totale_voci: 31755 },
]

const json = (res, codice, corpo) => {
  res.writeHead(codice, { "Content-Type": "application/json", "Cache-Control": "no-store" })
  res.end(corpo === undefined ? "" : JSON.stringify(corpo))
}
const leggiCorpo = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c }); req.on("end", () => ok(b ? JSON.parse(b) : {})) })

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const p = url.pathname
  console.log(new Date().toISOString().slice(11, 19), scenario.padEnd(14), req.method, p)

  if (p.startsWith("/_scenario/")) { scenario = p.slice("/_scenario/".length); return json(res, 200, { scenario }) }
  if (p === "/_scenario") return json(res, 200, { scenario })

  if (scenario === "timeout") return
  if (scenario === "rete") return req.socket.destroy()
  if (scenario === "lento") await new Promise((ok) => setTimeout(ok, 4000))
  if (scenario === "errore") return json(res, 503, { detail: "Database bloccato: riprova fra qualche secondo." })

  if (p === "/salute") return json(res, 200, { servizio: "SPADA API (finto)", stato: "attivo" })
  if (p === "/sistema/prezzari") return json(res, 200, scenario === "senza-prezzari" ? [] : prezzari)
  if (p === "/sistema/auth") return json(res, 200, { disponibile: true, stima_scadenza: null })

  if (p === "/gare" && req.method === "GET") {
    const lista = scenario === "vuoto" ? [] : gare
    return json(res, 200, lista.map(({ scadenza, elaborati, ...g }) => ({ ...g, fase_corrente: null })))
  }
  if (p === "/gare" && req.method === "POST") {
    const b = await leggiCorpo(req)
    if (gare.some((g) => g.slug === b.slug)) return json(res, 409, { detail: `Gara '${b.slug}' esiste già.` })
    if (b.slug === "fallisci-creazione") return json(res, 500, { detail: "new_gara.sh fallito: directory non scrivibile" })
    await new Promise((ok) => setTimeout(ok, 1500))
    gare.unshift({ ...b, creato_il: new Date().toISOString(), stato: "creata", fasi: {}, prezzario_disponibile: prezzari.some((x) => x.regione.toLowerCase() === String(b.regione).toLowerCase() && x.anno === b.anno_prezzario), scadenza: null, elaborati: 0 })
    return json(res, 201, { slug: b.slug, creato: true })
  }
  const m = p.match(/^\/gare\/([^/]+)(\/.*)?$/)
  if (m) {
    const g = gare.find((x) => x.slug === decodeURIComponent(m[1]))
    if (!g) return json(res, 404, { detail: "Gara non trovata." })
    const sotto = m[2] || ""
    if (req.method === "DELETE") {
      const inEsecuzione = Object.values(g.fasi).some((f) => f.stato === "in_esecuzione")
      if (inEsecuzione) return json(res, 409, { detail: "Una fase è in esecuzione su questa gara: attendi la conclusione prima di eliminarla." })
      gare = gare.filter((x) => x !== g)
      return json(res, 204)
    }
    if (sotto === "/output") return json(res, 200, Array.from({ length: g.elaborati }, (_, i) => `0${(i % 6) + 1}_cartella/elaborato_${i + 1}.md`).concat(["11_view/index.html"]))
    if (sotto === "") return json(res, 200, { manifest: { gara: { nome: g.nome, scadenza_offerta: g.scadenza } }, fasi: { fasi: g.fasi }, attivita: {}, prezzario: { regione: g.regione, anno: g.anno_prezzario, disponibile: g.prezzario_disponibile } })
  }
  json(res, 404, { detail: "Not Found" })
})

server.listen(PORTA, "127.0.0.1", () => console.log(`backend finto su http://127.0.0.1:${PORTA}  scenario=${scenario}`))
