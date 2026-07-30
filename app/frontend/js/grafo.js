// grafo.js — vista visuale del knowledge graph (Sprint 10.1).
// Force-directed layout con D3. I dati arrivano già strutturati da
// GET /gare/{slug}/grafo (backend/grafo.py) — qui solo disegno e interazione.

const params = new URLSearchParams(location.search);
const SLUG = params.get("slug");
if (!SLUG) {
  document.body.innerHTML = "<p>Slug gara mancante nell'URL (?slug=...).</p>";
  throw new Error("slug mancante");
}

const TIPI_LEGENDA = [
  { tipo: "document", label: "Documento" },
  { tipo: "criterion", label: "Criterio" },
  { tipo: "proposal", label: "Proposta" },
  { tipo: "scope", label: "Scope / cornice economica" },
  { tipo: "sconosciuto", label: "Riferito ma non censito" },
];

function renderLegenda() {
  const el = document.getElementById("g-legenda");
  el.innerHTML = TIPI_LEGENDA.map((t) => `
    <span class="voce"><span class="pallino tipo-${t.tipo}-bg"></span>${t.label}</span>
  `).join("");
}

function renderDettaglio(nodo, archi) {
  const el = document.getElementById("g-dettaglio");
  const collegati = archi.filter((a) => a.da === nodo.id || a.a === nodo.id);
  el.innerHTML = `
    <h3>${nodo.etichetta || nodo.id}</h3>
    <p><span class="k">ID</span><br>${nodo.id}</p>
    <p><span class="k">Tipo</span><br>${nodo.tipo}${nodo.sottotipo ? " / " + nodo.sottotipo : ""}</p>
    ${nodo.stato ? `<p><span class="k">Stato</span><br>${nodo.stato}</p>` : ""}
    <p><span class="k">Confidence</span><br>${nodo.confidence || "TBD"}</p>
    <p><span class="k">Archi collegati (${collegati.length})</span></p>
    ${collegati.map((a) => `
      <div class="arco-riga">
        ${a.da === nodo.id ? "→" : "←"} <strong>${a.da === nodo.id ? a.a : a.da}</strong>
        <br><span class="sub">${a.tipo}${a.motivo ? " — " + a.motivo : ""}</span>
      </div>
    `).join("") || "<p class='sub'>Nessuno — nodo orfano.</p>"}
  `;
}

async function avvia() {
  const statoEl = document.getElementById("g-stato");
  let dati;
  try {
    dati = await Api.grafo(SLUG);
  } catch (e) {
    statoEl.textContent = `Errore nel caricare il grafo: ${e.message}`;
    return;
  }

  const { nodi, archi, orfani } = dati;
  statoEl.textContent = `${nodi.length} nodi, ${archi.length} archi` +
    (orfani.length ? `, ${orfani.length} orfani (bordo tratteggiato arancione)` : "");

  if (nodi.length === 0) {
    statoEl.textContent = "Nessun dato nel grafo ancora — esegui la Fase 2 (costruzione grafo) prima.";
    return;
  }

  const svg = d3.select("#g-svg");
  const larghezza = svg.node().clientWidth || 800;
  const altezza = Math.max(500, window.innerHeight * 0.6);
  svg.attr("viewBox", [0, 0, larghezza, altezza]);

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", (ev) => g.attr("transform", ev.transform)));

  const orfaniSet = new Set(orfani);
  const nodiById = Object.fromEntries(nodi.map((n) => [n.id, n]));
  // d3.forceLink legge link.source/link.target (nomi non configurabili):
  // li aggiungiamo accanto a da/a, che restano le stringhe originali per
  // il pannello dettaglio anche dopo che d3 li muta in riferimenti nodo.
  const archiValidi = archi.filter((a) => nodiById[a.da] && nodiById[a.a])
    .map((a) => ({ ...a, source: a.da, target: a.a }));

  const sim = d3.forceSimulation(nodi)
    .force("link", d3.forceLink(archiValidi).id((d) => d.id).distance(90).strength(0.4))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(larghezza / 2, altezza / 2))
    .force("collide", d3.forceCollide(28));

  const linee = g.selectAll("line").data(archiValidi).join("line").attr("class", "arco-linea");

  const nodoG = g.selectAll("g.nodo").data(nodi).join("g").attr("class", "nodo")
    .call(d3.drag()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  nodoG.append("circle")
    .attr("class", (d) => `nodo-cerchio tipo-${d.tipo}` + (orfaniSet.has(d.id) ? " orfano" : ""))
    .attr("r", (d) => (d.tipo === "criterion" ? 14 : 9))
    .on("click", (ev, d) => {
      d3.selectAll(".nodo-cerchio").classed("selezionato", false);
      d3.select(ev.currentTarget).classed("selezionato", true);
      linee.classed("evidenziato", (a) => a.da === d.id || a.a === d.id);
      renderDettaglio(d, archiValidi.map((a) => ({
        da: typeof a.da === "object" ? a.da.id : a.da,
        a: typeof a.a === "object" ? a.a.id : a.a,
        tipo: a.tipo, motivo: a.motivo,
      })));
    });

  nodoG.append("text").attr("class", "nodo-etichetta").attr("dx", 12).attr("dy", 4)
    .text((d) => d.id.length > 28 ? d.id.slice(0, 26) + "…" : d.id);

  sim.on("tick", () => {
    linee.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
         .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    nodoG.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

renderLegenda();
avvia();
