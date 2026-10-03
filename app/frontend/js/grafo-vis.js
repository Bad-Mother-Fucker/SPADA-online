// grafo-vis.js — il knowledge graph della gara come rete interattiva
// (nodi e archi a forze, vis-network da vendor/: nessuna CDN, funziona
// anche offline).
//
// La rete sopravvive ai ridisegni della pagina: lo stream SSE ridisegna
// la vista a ogni evento, e ricrearla ogni volta farebbe ripartire il
// layout e perdere zoom e selezione. Si ricostruisce solo quando cambiano
// nodi, archi o tema; il filtro per tipo si applica in posto.

const GrafoVis = (() => {
  const { h } = UI;

  let rete = null;
  let dsNodi = null;
  let dsArchi = null;
  let radice = null;
  let pannello = null;
  let firma = "";
  let callbacks = { apri: () => {} };
  let indice = new Map();

  const valore = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

  /** Colore di un token in rgba: i token sono in oklch(), che vis-network
      non sa interpretare quando ne deriva le varianti. Lo converte il
      browser stesso, dipingendolo su un canvas da un pixel. */
  const tela1 = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  function token(nome) {
    const v = valore(nome);
    if (!v) return "";
    tela1.clearRect(0, 0, 1, 1);
    tela1.fillStyle = "#000";
    tela1.fillStyle = v;
    tela1.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = tela1.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
  }

  /** Colore e forma per tipo di nodo: gli stessi toni della legenda. */
  const STILE = {
    documento:   { tono: "--ink-3",  forma: "square" },
    requisito:   { tono: "--info",   forma: "dot" },
    gap:         { tono: "--crit",   forma: "triangle" },
    proposta:    { tono: "--accent", forma: "dot" },
    deliverable: { tono: "--ok",     forma: "diamond" },
    altro:       { tono: "--neu",    forma: "dot" },
  };

  const tronca = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  function costruisci(dati) {
    const grado = new Map();
    for (const a of dati.archi) {
      grado.set(a.da, (grado.get(a.da) || 0) + 1);
      grado.set(a.a, (grado.get(a.a) || 0) + 1);
    }
    const inchiostro = token("--ink-1");
    const sfondoEtichetta = token("--bg-base") || "transparent";
    // Archi tenui: con centinaia di legami la rete deve restare leggibile,
    // il colore pieno arriva su hover e selezione.
    const filo = (token("--ink-4") || "rgba(150, 150, 150, 1)").replace(/[\d.]+\)$/, "0.35)");

    indice = new Map(dati.nodi.map((n) => [n.id, n]));
    dsNodi = new vis.DataSet(dati.nodi.map((n) => {
      const st = STILE[n.gruppo] || STILE.altro;
      const colore = token(st.tono) || "#888";
      const g = grado.get(n.id) || 0;
      // Etichette brevi: per i documenti il solo codice (G-07-ESEC-01), per
      // i criteri id e titolo; il nome completo è nel tooltip e nel pannello.
      const etichetta = n.gruppo === "documento" ? n.id.split("_")[0]
        : n.gruppo === "requisito" && n.etichetta && n.etichetta !== n.id ? `${n.id} · ${tronca(n.etichetta, 24)}`
        : tronca(n.id, 24);
      return {
        id: n.id, gruppo: n.gruppo, label: etichetta, shape: st.forma,
        value: g + 1,
        color: {
          background: colore, border: colore,
          highlight: { background: colore, border: inchiostro },
          hover: { background: colore, border: inchiostro },
        },
        font: { color: inchiostro, face: valore("--font-ui") || "system-ui", strokeWidth: 3, strokeColor: sfondoEtichetta },
        title: `${n.id}${n.etichetta && n.etichetta !== n.id ? ` — ${n.etichetta}` : ""}\n${n.tipoLeggibile}${n.confidence && n.confidence !== "TBD" ? ` · confidence ${n.confidence}` : ""}\n${g} collegamenti`,
      };
    }));
    dsArchi = new vis.DataSet(dati.archi.map((a, i) => ({
      id: `e${i}`, from: a.da, to: a.a, title: a.tipo || "",
      arrows: { to: { enabled: true, scaleFactor: 0.35 } },
      color: { color: filo, highlight: token("--accent"), hover: token("--accent") },
      width: 0.8, hoverWidth: 1.2, selectionWidth: 1.6,
      smooth: { type: "continuous" },
    })));

    const tela = h("div", { class: "graphvis__tela" });
    pannello = h("aside", { class: "graphvis__pannello", hidden: true });
    radice = h("div", { class: "graphvis" }, tela, pannello);

    rete = new vis.Network(tela, { nodes: dsNodi, edges: dsArchi }, {
      autoResize: true,
      layout: { improvedLayout: dati.nodi.length < 150 },
      physics: {
        solver: "forceAtlas2Based",
        forceAtlas2Based: { gravitationalConstant: -120, centralGravity: 0.012, springLength: 170, springConstant: 0.05, avoidOverlap: 0.7 },
        stabilization: { iterations: 250, fit: true },
        maxVelocity: 40,
      },
      interaction: { hover: true, tooltipDelay: 160, hideEdgesOnDrag: dati.archi.length > 400, multiselect: false, navigationButtons: false },
      // Dimensione dal numero di collegamenti; le etichette dei nodi minori
      // compaiono avvicinando lo zoom (drawThreshold), come in graphify.
      nodes: {
        borderWidth: 1.5, shadow: false,
        scaling: { min: 6, max: 30, label: { enabled: true, min: 12, max: 18, maxVisible: 24, drawThreshold: 4 } },
      },
      edges: { selectionWidth: 2 },
    });
    // A layout assestato la fisica si ferma: la rete resta dove l'hai
    // lasciata (trascinare un nodo la riattiva solo per lui).
    rete.once("stabilizationIterationsDone", () => rete.setOptions({ physics: { enabled: false } }));
    rete.on("click", (e) => mostraPannello(e.nodes[0] || null));
    rete.on("doubleClick", (e) => {
      const n = indice.get(e.nodes[0]);
      if (n && n.destinazione) callbacks.apri(n.destinazione);
    });
  }

  function vicini(id) {
    const out = [];
    for (const a of dsArchi.get()) {
      if (a.from === id && indice.has(a.to)) out.push({ id: a.to, tipo: a.title, verso: "→" });
      if (a.to === id && indice.has(a.from)) out.push({ id: a.from, tipo: a.title, verso: "←" });
    }
    return out;
  }

  function mostraPannello(id) {
    const n = id ? indice.get(id) : null;
    if (!n) { pannello.hidden = true; pannello.replaceChildren(); return; }
    const collegati = vicini(id);
    pannello.hidden = false;
    UI.set(pannello,
      h("div", { class: "row row--between row--top" },
        h("div", null,
          h("div", { class: "kicker" }, n.tipoLeggibile),
          h("strong", { class: "graphvis__titolo" }, n.id)),
        h("button", { type: "button", class: "icon-btn", "aria-label": "Chiudi", onClick: () => { rete.unselectAll(); mostraPannello(null); } }, UI.I.chiudi(10))),
      n.etichetta && n.etichetta !== n.id ? h("p", { class: "graphvis__testo" }, n.etichetta) : null,
      n.confidence && n.confidence !== "TBD" ? h("p", { class: "graphvis__meta" }, `confidence: ${n.confidence}`) : null,
      h("div", { class: "graphvis__sezione" }, collegati.length ? `${collegati.length} collegamenti` : "Nessun collegamento"),
      collegati.length
        ? h("ul", { class: "graphvis__vicini" }, collegati.slice(0, 14).map((v) =>
            h("li", null, h("button", {
              type: "button", class: "graphvis__vicino",
              onClick: () => { rete.selectNodes([v.id]); rete.focus(v.id, { scale: 1.1, animation: { duration: 400 } }); mostraPannello(v.id); },
            }, h("span", { class: "mono" }, `${v.verso} ${v.id}`), v.tipo ? h("span", { class: "faint" }, ` · ${v.tipo}`) : null))))
        : null,
      n.destinazione
        ? h("button", { type: "button", class: "btn btn--sm btn--block", style: { marginTop: "var(--s-3)" }, onClick: () => callbacks.apri(n.destinazione) }, "Apri nella sua fase")
        : null);
  }

  function applicaFiltro(filtro) {
    const aggiornamenti = dsNodi.get().map((n) => ({ id: n.id, hidden: filtro !== "tutti" && n.gruppo !== filtro }));
    dsNodi.update(aggiornamenti);
  }

  /** L'elemento della rete, pronto da inserire nella vista.
      dati: { nodi: [{id, etichetta, gruppo, tipoLeggibile, confidence, destinazione}], archi: [{da, a, tipo}] } */
  function vista(dati, { filtro = "tutti", apri } = {}) {
    callbacks.apri = apri || callbacks.apri;
    const tema = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const nuova = JSON.stringify([tema, dati.nodi.map((n) => [n.id, n.gruppo, n.etichetta]), dati.archi.map((a) => [a.da, a.a, a.tipo])]);
    const primaVolta = nuova !== firma || !rete;
    if (primaVolta) {
      if (rete) rete.destroy();
      firma = nuova;
      costruisci(dati);
    }
    applicaFiltro(filtro);
    // La tela misura sé stessa solo una volta nel documento.
    requestAnimationFrame(() => {
      if (!radice.isConnected) return;
      rete.redraw();
      if (primaVolta) rete.fit({ animation: false });
    });
    return radice;
  }

  function centra() {
    if (rete) rete.fit({ animation: { duration: 400 } });
  }

  return { vista, centra, disponibile: () => typeof vis !== "undefined" };
})();
