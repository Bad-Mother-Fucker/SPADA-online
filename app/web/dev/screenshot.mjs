#!/usr/bin/env node
// Screenshot con Chrome headless via DevTools Protocol, con la possibilità di
// eseguire JavaScript prima dello scatto (aprire pannelli, cliccare, scrivere).
// Nessuna dipendenza: Node 22+ ha fetch e WebSocket.
//
//   node dev/screenshot.mjs <url> <out.png> [--w 1440] [--h 900] [--wait 800]
//        [--eval "<js>"] [--after 600] [--dark] [--reduced] [--full]
//
// Stampa anche le eccezioni e i console.error incontrati: una pagina che
// "sembra a posto" ma logga errori non è a posto.

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const args = process.argv.slice(2)
const [url, out] = args
if (!url || !out) { console.error("uso: screenshot.mjs <url> <out.png> [opzioni]"); process.exit(2) }
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const flag = (n) => args.includes(`--${n}`)
const w = Number(opt("w", 1440)), h = Number(opt("h", 900))
const attesa = Number(opt("wait", 800)), dopo = Number(opt("after", 600))
const js = opt("eval", null)

// Porta scelta da Chrome (0): la legge dal file DevToolsActivePort del profilo,
// così più scatti in parallelo non si contendono la stessa porta.
let porta = 0
const profilo = mkdtempSync(join(tmpdir(), "spada-chrome-"))
// CHROME vince; altrimenti il primo Chrome/Chromium installato (macOS o Linux).
const CHROME = process.env.CHROME || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p))
if (!CHROME) { console.error("Chrome non trovato: indica il percorso con CHROME=..."); process.exit(2) }
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  "--remote-debugging-port=0", `--user-data-dir=${profilo}`, `--window-size=${w},${h}`, "about:blank",
], { stdio: "ignore" })

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

async function pagina() {
  for (let i = 0; i < 60; i++) {
    try {
      if (!porta) porta = Number(readFileSync(join(profilo, "DevToolsActivePort"), "utf8").split("\n")[0]) || 0
      if (!porta) throw new Error("porta non ancora scritta")
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json()
      const p = lista.find((t) => t.type === "page")
      if (p) return p
    } catch { /* Chrome non ancora pronto */ }
    await pausa(100)
  }
  throw new Error("Chrome non risponde sulla porta di debug")
}

try {
  const target = await pagina()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko })
  let n = 0
  const inAttesa = new Map()
  const eventi = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && inAttesa.has(d.id)) { inAttesa.get(d.id)(d); inAttesa.delete(d.id) }
    else if (d.method) eventi.push(d)
  }
  const invia = (method, params = {}) => new Promise((ok) => { const id = ++n; inAttesa.set(id, ok); ws.send(JSON.stringify({ id, method, params })) })
  const caricata = () => new Promise((ok) => { const t = setInterval(() => { if (eventi.some((e) => e.method === "Page.loadEventFired")) { clearInterval(t); ok() } }, 40) })

  await invia("Page.enable")
  await invia("Runtime.enable")
  await invia("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  const features = []
  if (flag("dark")) features.push({ name: "prefers-color-scheme", value: "dark" })
  if (flag("reduced")) features.push({ name: "prefers-reduced-motion", value: "reduce" })
  if (features.length) await invia("Emulation.setEmulatedMedia", { features })

  await invia("Page.navigate", { url })
  await caricata()
  await pausa(attesa)

  if (js) {
    // Avvolto in una funzione asincrona: così nel codice si può usare await.
    const r = await invia("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) console.error("eval fallita:", r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
    else if (r.result?.result?.value !== undefined) console.log("eval:", JSON.stringify(r.result.result.value))
    await pausa(dopo)
  }

  const scatto = { format: "png" }
  if (flag("full")) {
    const m = await invia("Page.getLayoutMetrics")
    const altezza = Math.ceil(m.result.cssContentSize.height)
    await invia("Emulation.setDeviceMetricsOverride", { width: w, height: altezza, deviceScaleFactor: 1, mobile: false })
    scatto.captureBeyondViewport = true
    await pausa(150)
  }
  const shot = await invia("Page.captureScreenshot", scatto)
  writeFileSync(out, Buffer.from(shot.result.data, "base64"))
  console.log(`screenshot: ${out}`)

  const eccezioni = eventi.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)
  const errori = eventi.filter((e) => e.method === "Runtime.consoleAPICalled" && e.params.type === "error").map((e) => e.params.args.map((a) => a.value ?? a.description).join(" "))
  if (eccezioni.length) console.log("eccezioni:", eccezioni.join("\n  "))
  if (errori.length) console.log("console.error:", errori.join("\n  "))
  ws.close()
} finally {
  // Il profilo si cancella solo dopo che Chrome è uscito davvero.
  const uscito = new Promise((ok) => { chrome.once("exit", ok); setTimeout(ok, 3000) })
  chrome.kill()
  await uscito
  try { rmSync(profilo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* profilo temporaneo: non importa */ }
}
