#!/usr/bin/env node
// Ricava dalle icone SVG tutte le versioni raster: favicon.ico, icone
// dell'app (apple-touch, 192, 512) e le .ico dei lanciatori Windows.
// Da rilanciare solo se cambia public/favicon.svg o windows/ferma.svg;
// i file generati sono nel repository, la build non ne ha bisogno.
//
//   npm i --no-save @resvg/resvg-js@2.6.2
//   node dev/icone.mjs

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Resvg } from "@resvg/resvg-js"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")
const WINDOWS = join(WEB, "..", "..", "windows")

const png = (svg, lato) => new Resvg(svg, { fitTo: { mode: "width", value: lato } }).render().asPng()

// ICO con dentro PNG (Windows Vista in poi): intestazione, una voce di
// 16 byte per dimensione, poi le immagini una dopo l'altra.
function ico(svg, lati) {
  const immagini = lati.map((l) => png(svg, l))
  const testa = Buffer.alloc(6 + 16 * lati.length)
  testa.writeUInt16LE(0, 0); testa.writeUInt16LE(1, 2); testa.writeUInt16LE(lati.length, 4)
  let offset = testa.length
  lati.forEach((l, i) => {
    const v = 6 + 16 * i
    testa.writeUInt8(l >= 256 ? 0 : l, v); testa.writeUInt8(l >= 256 ? 0 : l, v + 1)
    testa.writeUInt16LE(1, v + 4); testa.writeUInt16LE(32, v + 6)
    testa.writeUInt32LE(immagini[i].length, v + 8); testa.writeUInt32LE(offset, v + 12)
    offset += immagini[i].length
  })
  return Buffer.concat([testa, ...immagini])
}

const spada = readFileSync(join(WEB, "public", "favicon.svg"), "utf8")
const ferma = readFileSync(join(WINDOWS, "ferma.svg"), "utf8")

const uscite = {
  [join(WEB, "public", "favicon.ico")]: ico(spada, [16, 32, 48]),
  [join(WEB, "public", "apple-touch-icon.png")]: png(spada, 180),
  [join(WEB, "public", "icon-192.png")]: png(spada, 192),
  [join(WEB, "public", "icon-512.png")]: png(spada, 512),
  [join(WINDOWS, "avvia.ico")]: ico(spada, [16, 24, 32, 48, 256]),
  [join(WINDOWS, "ferma.ico")]: ico(ferma, [16, 24, 32, 48, 256]),
}
for (const [file, dati] of Object.entries(uscite)) {
  writeFileSync(file, dati)
  console.log(`✓ ${file}`)
}
