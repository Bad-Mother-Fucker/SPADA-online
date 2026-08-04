// viste.js — i renderer delle viste della pagina gara.
//
// Ogni funzione riceve lo stato e restituisce nodi DOM; non fa fetch e non
// naviga da sé: chiama Gara.* per le azioni. Così la vista resta
// ricostruibile in qualunque momento a partire dallo stato, che è la
// condizione perché SSE possa ridisegnare senza effetti collaterali.

const Viste = (() => {
  const { h, s, I, punto } = UI;

  // -------------------------------------------------------------------
  // Blocchi ricorrenti
  // -------------------------------------------------------------------

  /** Un registro può essere: in caricamento, assente, illeggibile, pronto.
      Sono quattro cose diverse e l'operatore deve poterle distinguere. */
  function risorsa(res, { vuoto, render }) {
    if (!res || res.stato === "caricamento") return scheletroBlocco();
    if (res.stato === "assente") return backendVecchio(res.percorso);
    if (res.stato === "errore") return erroreBlocco(res.errore, res.percorso);
    if (res.stato === "vuoto") return vuoto();
    return render(res.dati);
  }

  /** Il backend in esecuzione non espone questo endpoint: è più vecchio del
      frontend. Va detto per quello che è — non c'è nulla da riparare nella
      gara, e riprovare non serve. */
  function backendVecchio(percorso) {
    return h("div", { class: "card card--dashed" },
      h("div", { class: "row row--tight", style: { marginBottom: "var(--s-2)" } },
        span(I.avviso(15), "warn"),
        h("strong", { style: { fontSize: "var(--fs-sm)", color: "var(--ink-1)" } },
          "Questa vista richiede un backend più recente")),
      h("p", { style: { margin: 0, fontSize: "var(--fs-sm)", color: "var(--ink-2)" } },
        "Il servizio non espone ", h("code", { class: "mono" }, percorso || "questo endpoint"),
        ": l'API in esecuzione è precedente a questa versione dell'interfaccia. I dati della gara sono intatti — manca solo l'aggiornamento del backend sulla VM."));
  }

  function scheletroBlocco(righe = 3) {
    return h("div", { class: "card", "aria-busy": "true" },
      h("div", { class: "stack stack--3" },
        h("div", { class: "sk sk--pill" }),
        ...Array.from({ length: righe }, (_, i) =>
          h("div", { class: "sk", style: { width: `${88 - i * 14}%` } }))));
  }

  function erroreBlocco(err, percorso) {
    return h("div", { class: "card card--crit" },
      h("div", { class: "row row--tight", style: { marginBottom: "var(--s-2)" } },
        span(I.triangolo(15), "crit"),
        h("strong", { style: { fontSize: "var(--fs-sm)", color: "var(--ink-1)" } },
          "Elaborato non leggibile")),
      h("p", { style: { margin: "0 0 var(--s-3)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" } },
        "Il servizio ha risposto ",
        h("code", { class: "mono" }, err && err.stato ? String(err.stato) : "nessuna risposta"),
        " per ", h("code", { class: "mono" }, percorso || "l'elaborato di questa fase"),
        ". I dati della gara non sono stati modificati."),
      h("button", { type: "button", class: "btn btn--sm", onClick: () => Gara.ricarica() }, "Riprova"));
  }

  const span = (nodo, tono) => {
    const w = h("span", { style: { display: "inline-flex", color: `var(--${tono})`, flex: "none" } }, nodo);
    return w;
  };

  function vuotoInline(titolo, testo, azione) {
    return h("div", { class: "empty-inline" },
      h("div", { class: "empty-inline__title" }, titolo),
      h("p", null, testo),
      azione || null);
  }

  const badge = (tono, ...contenuto) => h("span", { class: `badge badge--${tono}` }, ...contenuto);
  const chip = (testo, mono) => h("span", { class: `chip chip--sq${mono ? " chip--mono" : ""}` }, testo);
  const secTitle = (t) => h("h3", { class: "sec-title" }, t);

  const TONO_SEV = { alta: "crit", media: "warn", bassa: "ok" };
  const ETICHETTA_SEV = { alta: "Severità alta", media: "Severità media", bassa: "Severità bassa" };

  /** Le azioni disponibili su una fase, derivate dal suo stato reale.
      Sono le stesse in tutte le viste di fase: l'operatore non deve
      chiedersi dove sia finito il bottone di avvio. */
  function azioniFase(stato, n, blocco = null) {
    const st = Dominio.statoFase(stato.fasi, n);
    const fase = Dominio.fase(n);
    const azioni = [];

    if (st === "in_coda") {
      // Se il pannello ha appena elencato cosa manca, il bottone non deve
      // invitare al clic: sarebbe una contraddizione nello stesso riquadro.
      azioni.push(h("button", {
        type: "button", class: "btn btn--primary btn--block",
        disabled: !!blocco, title: blocco || "",
        onClick: () => Gara.eseguiFase(n),
      }, `Avvia Fase ${n} — ${fase.titolo.toLowerCase()}`));
    } else if (st === "da_rivedere") {
      azioni.push(h("button", {
        type: "button", class: "btn btn--primary btn--block",
        onClick: () => Gara.approvaFase(n),
      }, "Approva il checkpoint e prosegui"));
      azioni.push(h("button", {
        type: "button", class: "btn btn--block",
        onClick: () => Gara.rieseguiFase(n),
      }, "Riesegui la fase"));
    } else if (st === "errore") {
      azioni.push(h("button", {
        type: "button", class: "btn btn--primary btn--block",
        onClick: () => Gara.rieseguiFase(n),
      }, "Riesegui la fase"));
    } else if (st === "completata") {
      azioni.push(h("button", {
        type: "button", class: "btn btn--block",
        onClick: () => Gara.rieseguiFase(n),
      }, "Riesegui la fase"));
    } else if (st === "in_esecuzione") {
      azioni.push(h("div", { class: "row row--tight", style: { justifyContent: "center" } },
        punto(true), h("span", { style: { fontSize: "var(--fs-sm)", color: "var(--info)" } },
          "Esecuzione in corso")));
    }
    return azioni;
  }

  /** Pannello laterale con lo stato della fase, le sue azioni e i suoi
      elaborati: presente in ogni vista di fase, sempre nello stesso posto.
      `prima` accoglie le card specifiche della fase, che vanno in cima. */
  function asideFase(stato, n, prima = [], classe = "") {
    const st = Dominio.statoFase(stato.fasi, n);
    const meta = Dominio.STATO[st];
    const corpo = Dominio.corpoFase(stato.fasi, n) || {};
    const elaborati = elaboratiDiFase(stato, n);

    return h("aside", { class: `split__aside ${classe}`.trim() },
      prima,
      h("div", { class: `card card--tight card--${meta.tono}` },
        h("h3", { style: { margin: "0 0 var(--s-3)", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } },
          `Fase ${n} · ${meta.etichetta.toLowerCase()}`),
        corpo.sintesi
          ? h("p", { style: { margin: "0 0 var(--s-4)", fontSize: "var(--fs-xs)", color: "var(--ink-2)" } }, corpo.sintesi)
          : null,
        h("dl", { class: "dl dl--kv", style: { marginBottom: "var(--s-4)" } },
          corpo.iniziata_il ? [h("dt", null, "Avviata"), h("dd", null, UI.quandoBreve(corpo.iniziata_il))] : [],
          corpo.conclusa_il ? [h("dt", null, "Conclusa"), h("dd", null, UI.quandoBreve(corpo.conclusa_il))] : [],
          [h("dt", null, "Modello"), h("dd", { class: "mono" }, stato.manifest?.esecuzione?.modello || "—")],
          [h("dt", null, "Effort"), h("dd", { class: "mono" }, stato.manifest?.esecuzione?.effort || "—")]),
        h("div", { class: "stack" }, azioniFase(stato, n))),

      elaborati.length
        ? h("div", { class: "card card--tight" },
            secTitle("Elaborati di questa fase"),
            h("div", { class: "stack" }, elaborati.map((f) =>
              h("a", {
                class: "linkrow", href: Api.percorsoOutput(stato.slug, f.href),
                target: "_blank", rel: "noopener",
              }, h("span", null, f.nome), h("span", null, f.ext)))))
        : null);
  }

  /** Elaborati prodotti da una fase: la pipeline li scrive in cartelle
      numerate, e il numero della cartella non coincide con quello della
      fase — la mappa sta qui e non nei singoli renderer. */
  const CARTELLE_FASE = {
    1: ["01_extracted/"],
    2: ["02_graph/"],
    3: ["03_criteria/", "04_doc_summaries/"],
    4: ["05_criteria_outputs/", "06_registers/gap_register"],
    5: ["06_registers/proposal_register", "06_registers/score_forecast"],
    6: ["10_offer/"],
    7: ["06_registers/audit_summary", "07_questions/"],
  };

  function elaboratiDiFase(stato, n) {
    const prefissi = CARTELLE_FASE[n] || [];
    const tutti = stato.output || [];
    return tutti
      .filter((p) => prefissi.some((pre) => p.startsWith(pre)) && !p.startsWith("11_view/"))
      .map((p) => {
        const gemello = `11_view/${p.replace(/\.md$/, ".html")}`;
        const haGemello = p.endsWith(".md") && tutti.includes(gemello);
        return {
          nome: p.split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/[_-]/g, " "),
          href: haGemello ? gemello : p,
          ext: `.${(haGemello ? gemello : p).split(".").pop()}`,
        };
      })
      .slice(0, 12);
  }

  // ===================================================================
  // FASE 1 · Acquisizione documenti
  // ===================================================================

  function fase1(stato) {
    const docs = stato.documenti;
    const perCategoria = (id) =>
      (docs.stato === "ok" ? docs.dati : []).filter((d) => d.categoria === id);

    const dropcats = Dominio.CATEGORIE.map((c) => {
      const n = perCategoria(c.id).length;
      return h("button", {
        type: "button", class: "dropcat", "data-categoria": c.id,
        onClick: () => Gara.scegliFile(c.id),
        onDragover: (e) => { e.preventDefault(); e.currentTarget.dataset.over = "true"; },
        onDragleave: (e) => { e.currentTarget.dataset.over = "false"; },
        onDrop: (e) => {
          e.preventDefault();
          e.currentTarget.dataset.over = "false";
          Gara.caricaFile([...e.dataTransfer.files], c.id);
        },
      },
        h("div", { class: "dropcat__tag" }, c.tag),
        h("div", { class: "dropcat__label" }, c.label),
        h("div", { class: "dropcat__hint" }, c.hint),
        h("div", { class: "dropcat__count", dataset: { has: String(n > 0) } },
          n ? UI.plurale(n, "file caricato", "file caricati") : "nessun file"));
    });

    const rifiutati = stato.upload.rifiutati;
    const dropzone = h("div", {
      class: `dropzone${rifiutati.length ? " dropzone--rejected" : ""}`,
      onDragover: (e) => { e.preventDefault(); e.currentTarget.dataset.over = "true"; },
      onDragleave: (e) => { e.currentTarget.dataset.over = "false"; },
      onDrop: (e) => {
        e.preventDefault();
        e.currentTarget.dataset.over = "false";
        Gara.caricaFile([...e.dataTransfer.files], null);
      },
    },
      rifiutati.length
        ? [
            h("div", { class: "dropzone__title" },
              `${UI.plurale(rifiutati.length, "file non caricato", "file non caricati")}`),
            h("div", { class: "dropzone__hint" }, "Rilascia di nuovo qui i file corretti — i validi restano caricati."),
          ]
        : [
            I.carica(22),
            h("div", { class: "dropzone__title" }, "Trascina qui i file, o rilasciali sulla categoria giusta"),
            h("div", { class: "dropzone__hint" },
              "PDF, PDF.P7M, XLSX, DOCX · max 40 MB per file. La categoria viene indovinata dal nome ed è correggibile."),
          ]);

    // I rifiuti restano visibili accanto ai file buoni: si vede subito
    // quali sono passati e quali no, senza rifare l'upload alla cieca.
    const righeRifiuto = rifiutati.map((r) =>
      h("div", { class: "filerow filerow--crit" },
        h("span", { class: "filerow__cat" }, "—"),
        h("span", { class: "filerow__name" }, r.nome),
        h("span", { class: "filerow__size" }, UI.byte(r.dimensione)),
        h("span", { class: "badge badge--sm badge--crit" }, I.croce(11), r.motivo),
        h("button", {
          type: "button", class: "icon-btn icon-btn--danger", "aria-label": `Togli ${r.nome} dall'elenco`,
          onClick: () => Gara.scartaRifiuto(r.nome),
        }, I.chiudi(10))));

    const righeCaricamento = stato.upload.inCorso.map((nome) =>
      h("div", { class: "filerow" },
        h("span", { class: "filerow__cat" }, "…"),
        h("span", { class: "filerow__name" }, nome),
        h("span", { class: "filerow__size" }, ""),
        h("span", { class: "badge badge--sm badge--info" }, punto(true), "caricamento")));

    const elencoFile = risorsa(docs, {
      vuoto: () => vuotoInline("Nessun documento caricato",
        "La Fase 1 non può partire senza almeno il disciplinare: è il documento da cui la pipeline ricava i requisiti."),
      render: (lista) => h("div", { class: "stack" }, lista.map((d) => {
        // `presente` è opzionale: se il backend non lo riporta, l'assenza
        // del campo non è un'assenza del file.
        const mancante = d.presente === false;
        return h("div", { class: `filerow${mancante ? " filerow--warn" : " filerow--ok"}` },
          h("span", { class: "filerow__cat" },
            (Dominio.CATEGORIE.find((c) => c.id === d.categoria) || {}).tag || d.categoria),
          h("span", { class: "filerow__name", title: d.nome_file }, d.nome_file),
          h("span", { class: "filerow__size" }, Number.isFinite(d.dimensione) ? UI.byte(d.dimensione) : ""),
          h("span", { class: `badge badge--sm badge--${mancante ? "warn" : "ok"}` },
            mancante ? I.avviso(11) : I.spunta(11),
            mancante ? "file non più presente su disco" : `caricato ${UI.quandoRelativo(d.caricato_il)}`));
      })),
    });

    // La prontezza all'avvio si misura sui documenti, non su una spunta
    // manuale: qui si dice esattamente cosa manca.
    const lista = docs.stato === "ok" ? docs.dati : [];
    const c_e = (d) => d.presente !== false;
    const haDisciplinare = lista.some((d) => d.categoria === "disciplinare" && c_e(d));
    const nElaborati = lista.filter((d) => d.categoria === "elaborati" && c_e(d)).length;
    const nP7m = lista.filter((d) => d.categoria === "p7m" && c_e(d)).length;
    const orfani = lista.filter((d) => d.presente === false).length;

    const voce = (tono, testo) => h("li", null,
      (tono === "ok" ? I.spunta(12) : tono === "warn" ? I.avviso(12) : I.croce(12)),
      h("span", null, testo));
    const conTono = (nodo, tono) => { nodo.querySelector("svg")?.setAttribute("data-tone", tono); return nodo; };

    const prontezza = h("ul", { class: "checklist" },
      conTono(voce(haDisciplinare ? "ok" : "crit",
        haDisciplinare ? "Disciplinare presente" : "Disciplinare mancante: la Fase 1 non può partire"),
        haDisciplinare ? "ok" : "crit"),
      conTono(voce(nElaborati ? "ok" : "warn",
        nElaborati ? `${UI.plurale(nElaborati, "elaborato tecnico", "elaborati tecnici")} caricati` : "Nessun elaborato tecnico: l'analisi si baserà sul solo disciplinare"),
        nElaborati ? "ok" : "warn"),
      conTono(voce(nP7m ? "ok" : "warn",
        nP7m ? `${UI.plurale(nP7m, "PDF firmato", "PDF firmati")} da verificare in fase di estrazione` : "Nessun P7M: nulla da verificare come firma"),
        nP7m ? "ok" : "warn"),
      orfani
        ? conTono(voce("warn", `${orfani} riga di documento senza file su disco: verifica input/`), "warn")
        : null);

    return h("div", { class: "split" },
      h("section", { class: "card split__main split__main--wide" },
        h("div", { class: "dropcats" }, dropcats),
        dropzone,
        h("h3", { class: "sec-title", style: { margin: "var(--s-5) 0 var(--s-3)" } }, "File caricati"),
        h("div", { class: "stack" }, righeCaricamento, righeRifiuto),
        (righeCaricamento.length || righeRifiuto.length) ? h("div", { style: { height: "var(--s-2)" } }) : null,
        elencoFile),

      h("aside", { class: "split__aside" },
        h("div", { class: `card card--tight card--${haDisciplinare ? "ok" : "warn"}` },
          h("h3", { style: { margin: "0 0 var(--s-3)", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } },
            haDisciplinare ? "Pronto per l'avvio" : "Non ancora avviabile"),
          prontezza,
          h("div", { class: "stack" }, azioniFase(stato, 1,
            haDisciplinare ? null : "Carica il disciplinare: senza, la Fase 1 non ha da cosa ricavare i requisiti."))),
        h("p", { style: { margin: 0, fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
          "Dopo l'avvio l'upload resta accessibile da questa vista, ma aggiungere documenti richiede la riesecuzione dalla Fase 1: la conferma lo dice esplicitamente.")));
  }

  // ===================================================================
  // FASE 2 · Estrazione requisiti
  // ===================================================================

  function fase2(stato) {
    const res = stato.registri.criteri;

    const contenuto = risorsa(res, {
      vuoto: () => vuotoInline("Nessun requisito estratto",
        "La matrice dei criteri non è ancora stata prodotta. Si popola al termine della Fase 2.",

        h("p", { class: "faint", style: { margin: 0, fontSize: "var(--fs-micro)" } },
          "L'azione per questa fase è nel pannello a destra.")),
      render: (righe) => {
        const mostrate = stato.espansi.requisiti ? righe : righe.slice(0, 6);
        const conteggi = {
          totale: righe.length,
          vincolanti: righe.filter((r) => r.tipo === "vincolante").length,
          premianti: righe.filter((r) => r.tipo === "premiante").length,
          scoperti: righe.filter((r) => r.copertura !== "coperto").length,
        };
        return h("section", { class: "card split__main" },
          h("div", { class: "row row--between", style: { marginBottom: "var(--s-4)" } },
            h("div", { class: "filterbar__group" },
              h("span", { class: "badge badge--lg badge--plain" }, `Tutti ${conteggi.totale}`),
              h("span", { class: "badge badge--lg" }, `Vincolanti ${conteggi.vincolanti}`),
              h("span", { class: "badge badge--lg" }, `Premianti ${conteggi.premianti}`),
              conteggi.scoperti
                ? h("span", { class: "badge badge--lg badge--crit" }, `Senza copertura ${conteggi.scoperti}`)
                : h("span", { class: "badge badge--lg badge--ok" }, "Tutti coperti")),
            h("button", {
              type: "button", class: "btn btn--sm btn--accent",
              onClick: () => Gara.vai({ tipo: "grafo", filtro: "requisito" }),
            }, I.grafo(11), "Apri nel Grafo, filtrato su «requisito»")),

          h("div", { class: "stack" }, mostrate.map(rigaRequisito)),

          righe.length > 6
            ? h("button", {
                type: "button", class: "btn btn--sm", style: { marginTop: "var(--s-4)" },
                onClick: () => Gara.espandi("requisiti"),
              }, stato.espansi.requisiti
                ? "Mostra solo i primi 6"
                : righe.length - 6 === 1
                  ? "Mostra l'altro requisito"
                  : `Mostra gli altri ${righe.length - 6} requisiti`)
            : null);
      },
    });

    const provenienza = res.stato === "ok" ? contaProvenienza(res.dati) : [];

    const cardProvenienza = h("div", { class: "card card--tight" },
      secTitle("Provenienza"),
      provenienza.length
        ? h("dl", { class: "dl" }, provenienza.map(([fonte, n]) =>
            [h("dt", { title: fonte }, fonte), h("dd", null, String(n))]))
        : h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
            "La provenienza compare quando i requisiti riportano il documento di origine."),
      h("p", { style: { margin: "var(--s-4) 0 0", paddingTop: "var(--s-3)", borderTop: "1px solid var(--hairline)", fontSize: "var(--fs-micro)", color: "var(--ink-3)" } },
        "Ogni requisito conserva il riferimento puntuale (documento, articolo, pagina): è il vincolo che rende verificabile tutto ciò che la pipeline produce dopo."));

    return h("div", { class: "split" },
      contenuto,
      asideFase(stato, 2, [cardProvenienza], "split__aside--narrow"));
  }

  function contaProvenienza(righe) {
    const m = new Map();
    for (const r of righe) {
      const f = (r.fonte || "").split("·")[0].trim() || "non indicata";
      m.set(f, (m.get(f) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }

  function rigaRequisito(r) {
    const tonoCop = r.copertura === "coperto" ? "ok" : r.copertura === "criticita" ? "crit" : "warn";
    const etichettaCop = { coperto: "Coperto", criticita: "Con criticità", scoperto: "Senza copertura" }[r.copertura] || "Copertura non indicata";
    const classe = r.copertura === "criticita" ? " req--criticita" : r.copertura === "scoperto" ? " req--scoperto" : "";
    return h("article", { class: `req${classe}` },
      h("span", { class: "req__id" }, r.id || "—"),
      h("div", { class: "req__body" },
        h("div", { class: "req__text" }, r.testo || "(testo non riportato nel registro)"),
        r.fonte
          ? h("div", { class: "req__prov" },
              h("span", { class: "req__source" }, I.pagina(9), r.fonte))
          : null),
      h("div", { class: "req__badges" },
        r.tipo ? h("span", {
          class: `badge badge--sm${r.tipo === "premiante" ? " badge--info" : " badge--plain"}`,
        }, r.tipo) : null,
        h("span", { class: `badge badge--sm badge--${tonoCop}` }, etichettaCop)));
  }

  // ===================================================================
  // FASE 3 · Analisi capitolato
  // ===================================================================

  function fase3(stato) {
    const res = stato.registri.analisi;

    const contenuto = risorsa(res, {
      vuoto: () => vuotoInline("Analisi non ancora prodotta",
        "La sintesi e le sezioni annotate compaiono al termine della Fase 3.",

        h("p", { class: "faint", style: { margin: 0, fontSize: "var(--fs-micro)" } },
          "L'azione per questa fase è nel pannello a destra.")),
      render: (dati) => h("section", { class: "split__main" },
        h("div", { class: "card" },
          secTitle("Sintesi dell'analisi"),
          dati.sintesi.length
            ? dati.sintesi.map((p) => h("p", { class: "lead" }, p))
            : h("p", { class: "lead muted" }, "Il documento non contiene una sintesi in prosa."),
          h("div", { class: "row row--tight" },
            dati.conteggi.alta ? h("span", { class: "badge badge--lg badge--crit" }, I.triangolo(11), `${dati.conteggi.alta} criticità alte`) : null,
            dati.conteggi.media ? h("span", { class: "badge badge--lg badge--warn" }, `${dati.conteggi.media} medie`) : null,
            dati.conteggi.bassa ? h("span", { class: "badge badge--lg badge--ok" }, `${dati.conteggi.bassa} sezioni conformi`) : null,
            !dati.sezioni.length ? h("span", { class: "badge badge--lg" }, "nessuna sezione annotata") : null)),

        dati.sezioni.length
          ? h("div", { class: "card" },
              h("h3", { class: "sec-title", style: { marginBottom: "var(--s-4)" } }, "Sezioni annotate"),
              h("div", { class: "stack stack--3" },
                dati.sezioni.map((sez) => h("article", { class: `sezione sezione--${sez.severita || "media"}` },
                  h("div", { class: "sezione__head" },
                    h("div", { class: "row row--tight", style: { alignItems: "baseline" } },
                      sez.ref ? h("span", { class: "mono", style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } }, sez.ref) : null,
                      h("h4", null, sez.titolo)),
                    h("span", { class: `badge badge--sm badge--${TONO_SEV[sez.severita] || "neu"}` },
                      sez.badge || ETICHETTA_SEV[sez.severita] || "da presidiare")),
                  sez.nota ? h("p", { class: "sezione__note" }, sez.nota) : null,
                  sez.citazione ? h("blockquote", { class: "quote" }, `«${sez.citazione}»`) : null))))
          : null),
    });

    const corpo3 = Dominio.corpoFase(stato.fasi, 3) || {};
    const approvata = Dominio.statoFase(stato.fasi, 3) === "completata" && corpo3.conclusa_il;

    const cardCheckpoint = approvata
      ? h("div", { class: "card card--tight card--accent", style: { background: "var(--accent-soft)" } },
          h("div", { class: "row row--tight", style: { marginBottom: "var(--s-2)" } },
            span(I.scintilla(13), "accent"),
            h("strong", { style: { fontSize: "var(--fs-sm)", color: "var(--ink-1)" } }, "Checkpoint superato")),
          h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-2)" } },
            `Fase conclusa il ${UI.quandoBreve(corpo3.conclusa_il)}.`))
      : null;

    return h("div", { class: "split" },
      contenuto,
      asideFase(stato, 3, [cardCheckpoint], "split__aside--wide"));
  }

  // ===================================================================
  // GARA BRIEF · vista trasversale
  //
  // Il documento di sintesi prodotto da disciplinare-analyst in Fase 1
  // (output/03_criteria/gara_brief.md): risponde a "cosa dobbiamo
  // produrre per vincere questa gara". Prima di questa vista era solo
  // una fonte di fallback per il parsing della Fase 3 — qui è invece
  // l'intero documento, in prosa, consultabile per intero e in
  // qualunque momento come Grafo e Attività.
  // ===================================================================

  function brief(stato) {
    const res = stato.garaBrief;
    const haMd = (stato.output || []).includes("03_criteria/gara_brief.md");
    const haHtml = (stato.output || []).includes("11_view/03_criteria/gara_brief.html");

    const azioni = (haMd || haHtml)
      ? h("div", { class: "row row--tight", style: { justifyContent: "flex-end" } },
          haHtml ? h("a", {
            class: "btn btn--sm btn--accent",
            href: Api.percorsoOutput(stato.slug, "11_view/03_criteria/gara_brief.html"),
            target: "_blank", rel: "noopener",
          }, I.scarica(11), "Versione da condividere") : null,
          haMd ? h("a", {
            class: "btn btn--sm",
            href: Api.percorsoOutput(stato.slug, "03_criteria/gara_brief.md"),
            target: "_blank", rel: "noopener",
          }, I.scarica(11), "Markdown") : null)
      : null;

    const contenuto = risorsa(res, {
      vuoto: () => vuotoInline("Gara brief non ancora prodotto",
        "Il documento di sintesi si scrive in Fase 1, subito dopo l'estrazione dei criteri dal disciplinare: nome gara, stazione appaltante, cosa serve per vincere.",
        h("button", { type: "button", class: "btn btn--primary", onClick: () => Gara.vai({ tipo: "fase", n: 1 }) }, "Vai alla Fase 1")),
      render: (dati) => h("div", { class: "stack stack--4" },
        dati.sintesi.length
          ? h("div", { class: "card" },
              secTitle("Sintesi"),
              dati.sintesi.map((p) => h("p", { class: "lead" }, p)))
          : null,
        dati.sezioni.map((sez) => h("div", { class: "card" },
          h("h3", { class: "sec-title" }, sez.titolo),
          h("div", { class: "prose prose--boxed" },
            sez.paragrafi.length
              ? sez.paragrafi.map((p) => h("p", null, p))
              : h("p", { class: "muted" }, "Sezione senza prosa (tabella o elenco non anteprimato)."))))),
    });

    return h("div", { class: "split" },
      h("section", { class: "split__main" }, azioni, contenuto));
  }

  // ===================================================================
  // FASE 4 · Ricerca soluzioni (gap e prove)
  // ===================================================================

  function fase4(stato) {
    const res = stato.registri.gap;

    const elenco = risorsa(res, {
      vuoto: () => h("section", { class: "card" },
        vuotoInline("Nessun gap registrato",
          "Il registro dei gap si popola in Fase 4. Un gap è un requisito che l'offerta non copre ancora in modo dimostrabile.",
          h("div", { class: "stack", style: { maxWidth: "320px", margin: "0 auto" } }, azioniFase(stato, 4)))),
      render: (righe) => h("section", { class: "card" },
        h("div", { class: "row row--between", style: { marginBottom: "var(--s-4)" } },
          h("p", { style: { margin: 0, maxWidth: "70ch", fontSize: "var(--fs-sm)", color: "var(--ink-2)" } },
            "Un ", h("strong", { class: "strong" }, "gap"),
            " è un requisito che l'offerta non copre ancora in modo dimostrabile. Espandi per vedere le prove documentali raccolte dagli agenti."),
          h("button", {
            type: "button", class: "btn btn--sm btn--accent", style: { flex: "none" },
            onClick: () => Gara.vai({ tipo: "grafo", filtro: "gap" }),
          }, "Grafo · gap e prove collegate")),

        h("div", { class: "stack stack--3" },
          righe.map((g) => cardGap(stato, g)))),
    });

    return h("div", { class: "stack stack--4" }, elenco, proposteOperatore(stato));
  }

  /** Proposte del professionista (Sprint 10.2): suggerite a mano, ancorate
      a un criterio e opzionalmente a un gap. Vengono valutate dal sistema
      insieme a quelle degli agenti alla prossima analisi del criterio —
      non entrano in offerta per il solo fatto di essere state scritte. */
  function proposteOperatore(stato) {
    const res = stato.proposteOperatore;
    const f = stato.formProposta;

    const elenco = risorsa(res, {
      vuoto: () => h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
        "Nessuna proposta suggerita finora."),
      render: (lista) => h("div", { class: "stack" }, lista.map((p) => {
        const valutata = p.stato === "valutata";
        const tono = !valutata ? "info" : p.esito_audit === "scartata" ? "crit" : "ok";
        return h("div", { class: "req" },
          h("span", { class: "req__id" }, p.criterio),
          h("div", { class: "req__body" },
            h("div", { class: "req__text" }, p.titolo),
            p.descrizione
              ? h("div", { style: { fontSize: "var(--fs-xs)", color: "var(--ink-2)" } }, p.descrizione)
              : null,
            h("div", { class: "req__prov" },
              p.gap_id ? h("span", { class: "req__source" }, I.pagina(9), p.gap_id) : null,
              p.creato_il ? h("span", { class: "faint", style: { fontSize: "var(--fs-micro)" } }, UI.quandoRelativo(p.creato_il)) : null)),
          h("div", { class: "req__badges" },
            h("span", { class: `badge badge--sm badge--${tono}` },
              valutata ? (p.esito_audit || "valutata") : "in attesa di analisi")));
      })),
    });

    return h("section", { class: "card" },
      h("div", { class: "row row--between", style: { marginBottom: "var(--s-3)" } },
        h("h3", { class: "sec-title", style: { margin: 0 } }, "Suggerisci una proposta"),
        h("span", { class: "badge badge--sm" }, "professionista")),
      h("p", { style: { margin: "0 0 var(--s-4)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
        "Valutata dal sistema insieme a quelle generate dagli agenti alla prossima analisi del criterio: entra nel gioco, non scavalca l'audit delle prove."),

      h("div", { class: "grid-auto grid-auto--sm", style: { marginBottom: "var(--s-3)" } },
        h("label", { class: "field" },
          h("span", { class: "field__label" }, "Criterio"),
          h("input", {
            type: "text", class: "input", value: f.criterio, placeholder: "es. C1",
            onInput: (e) => { stato.formProposta.criterio = e.target.value; Gara.aggiornaFormProposta(); },
          }),
          h("span", { class: "field__hint" }, "Formato Cn — es. C1, C2.")),
        h("label", { class: "field" },
          h("span", { class: "field__label" }, "Gap collegato (opzionale)"),
          h("input", {
            type: "text", class: "input", value: f.gap_id, placeholder: "es. G-C1-002",
            onInput: (e) => { stato.formProposta.gap_id = e.target.value; Gara.aggiornaFormProposta(); },
          }))),
      h("label", { class: "field", style: { marginBottom: "var(--s-3)" } },
        h("span", { class: "field__label" }, "Titolo"),
        h("input", {
          type: "text", class: "input", value: f.titolo,
          onInput: (e) => { stato.formProposta.titolo = e.target.value; Gara.aggiornaFormProposta(); },
        })),
      h("label", { class: "field", style: { marginBottom: "var(--s-3)" } },
        h("span", { class: "field__label" }, "Descrizione"),
        h("textarea", {
          class: "textarea", rows: "3", value: f.descrizione,
          onInput: (e) => { stato.formProposta.descrizione = e.target.value; Gara.aggiornaFormProposta(); },
        })),
      h("button", {
        type: "button", class: "btn btn--primary", id: "btn-proposta-operatore",
        disabled: !formPropostaValido(f) || f.invio,
        title: formPropostaValido(f) ? "" : "Servono criterio (Cn), titolo e descrizione.",
        onClick: () => Gara.creaPropostaOperatore(),
      }, f.invio ? "Invio…" : "Invia proposta"),

      h("h3", { class: "sec-title", style: { margin: "var(--s-5) 0 var(--s-3)" } }, "Proposte suggerite"),
      elenco);
  }

  /** Stessi vincoli del backend (ProposaOperatoreRequest): meglio dirlo
      qui che far tornare un 422 dopo aver scritto tutto. */
  function formPropostaValido(f) {
    if (!/^C[0-9]+$/.test((f.criterio || "").trim())) return false;
    if (f.gap_id && !/^G-C[0-9]+-[0-9]+$/.test(f.gap_id.trim())) return false;
    return !!(f.titolo || "").trim() && !!(f.descrizione || "").trim();
  }

  function cardGap(stato, g) {
    const aperto = stato.gapAperto === g.id;
    const tono = TONO_SEV[g.severita] || "neu";
    return h("article", { class: "gap", dataset: { open: String(aperto) } },
      h("div", { class: "gap__head" },
        h("button", {
          type: "button", class: "gap__toggle", "aria-expanded": String(aperto),
          onClick: () => Gara.apriGap(aperto ? null : g.id),
        },
          h("span", { class: "gap__caret" }, I.freccia(10)),
          h("span", { style: { minWidth: 0 } },
            h("span", { class: "gap__meta" },
              h("span", { class: "mono", style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } }, g.id || "GAP"),
              g.severita ? h("span", { class: `badge badge--sm badge--${tono}` }, ETICHETTA_SEV[g.severita]) : null,
              g.requisito ? h("span", { class: "mono faint", style: { fontSize: "var(--fs-micro)" } }, `copre ${g.requisito}`) : null),
            h("span", { class: "gap__title" }, g.titolo || "(gap senza titolo)"),
            g.sintesi ? h("span", { class: "gap__summary" }, g.sintesi) : null)),
        h("div", { class: "gap__actions" },
          h("span", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } },
            UI.plurale(g.prove.length, "prova", "prove")),
          g.proposta
            ? h("button", {
                type: "button", class: "btn btn--sm",
                onClick: () => Gara.vai({ tipo: "fase", n: 5, sub: g.proposta }),
              }, `Proposta ${g.proposta}`)
            : h("button", {
                type: "button", class: "btn btn--sm btn--accent",
                onClick: () => Gara.vai({ tipo: "fase", n: 5 }),
              }, "Vai alle proposte")),
      ),
      aperto
        ? h("div", { class: "gap__body" },
            h("h4", { class: "sec-title" }, "Prove documentali collegate"),
            g.prove.length
              ? h("div", { class: "stack" }, g.prove.map((p) =>
                  h("div", { class: "evidence" },
                    h("span", { class: "evidence__source" }, p.fonte || "fonte non indicata"),
                    h("span", { class: "evidence__quote" }, p.testo),
                    h("span", { class: `badge badge--sm badge--${p.contraria ? "crit" : "ok"}` },
                      p.contraria ? "contraria" : "a favore"))))
              : h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
                  "Il registro non riporta prove collegate a questo gap: è un'assenza dichiarata, non un errore di lettura."),
            g.nota
              ? h("p", { style: { margin: "var(--s-3) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-4)" } }, g.nota)
              : null)
        : null);
  }

  // ===================================================================
  // FASE 5 · Revisione proposte (elenco + dettaglio)
  // ===================================================================

  function fase5Elenco(stato) {
    const res = stato.registri.proposte;

    return risorsa(res, {
      vuoto: () => h("section", { class: "card" },
        vuotoInline("Nessuna proposta da rivedere",
          "Il registro delle proposte si popola in Fase 5, a partire dai gap trattati in Fase 4.",
          h("div", { class: "stack", style: { maxWidth: "320px", margin: "0 auto" } }, azioniFase(stato, 5)))),
      render: (righe) => {
        const decise = righe.filter((p) => decisioneDi(stato, p)).length;
        const totale = righe.length;
        const tutteDecise = totale > 0 && decise === totale;
        const pct = totale ? Math.round((decise / totale) * 100) : 0;
        const mostrate = stato.espansi.proposte ? righe : righe.slice(0, 4);

        return h("section", { class: "card" },
          h("div", { class: "row", style: { gap: "var(--s-4)", marginBottom: "var(--s-4)" } },
            h("div", { style: { flex: "1 1 260px", minWidth: "200px" } },
              h("div", { class: "progress-label" },
                h("span", null, "Proposte decise"),
                h("span", { class: "num strong" }, `${decise} / ${totale}`)),
              h("div", { class: "progress" },
                h("div", { class: "progress__fill", style: { width: `${pct}%` } }))),
            h("button", {
              type: "button", class: "btn btn--primary",
              disabled: !tutteDecise,
              title: tutteDecise ? "" : "Ogni proposta deve avere una decisione prima di procedere",
              onClick: () => Gara.approvaFase(5),
            }, "Conferma revisione e avvia Fase 6")),

          h("p", { style: { margin: "0 0 var(--s-4)", fontSize: "var(--fs-xs)", color: "var(--ink-4)" } },
            "Le azioni per riga servono ai casi ovvi; per leggere il contenuto completo, i gap di origine e lo storico delle note, apri il dettaglio."),

          h("div", { class: "stack stack--3" },
            mostrate.map((p) => rigaProposta(stato, p))),

          righe.length > 4
            ? h("button", {
                type: "button", class: "btn btn--sm", style: { marginTop: "var(--s-4)" },
                onClick: () => Gara.espandi("proposte"),
              }, stato.espansi.proposte
                ? "Mostra solo le prime 4"
                : righe.length - 4 === 1
                  ? "Mostra l'altra proposta"
                  : `Mostra le altre ${righe.length - 4} proposte`)
            : null);
      },
    });
  }

  /** Decisione corrente: quella presa in questa sessione ha la precedenza
      sul registro, che il worker riscrive solo alla prossima esecuzione. */
  function decisioneDi(stato, p) {
    return stato.decisioni[p.id] || p.decisione || null;
  }

  const DEC = {
    approvata: { tono: "ok", etichetta: "Approvata" },
    da_modificare: { tono: "warn", etichetta: "Da modificare" },
    scartata: { tono: "crit", etichetta: "Scartata" },
  };

  function rigaProposta(stato, p) {
    const d = decisioneDi(stato, p);
    const tonoSev = TONO_SEV[p.severita];
    const bottone = (etichetta, valore, tono, icona) => h("button", {
      type: "button", class: `btn btn--sm btn--${tono}`,
      dataset: { on: String(d === valore) },
      "aria-pressed": String(d === valore),
      onClick: () => Gara.decidi(p.id, valore),
    }, icona || null, etichetta);

    return h("article", { class: "proposal", dataset: d ? { decided: d } : {} },
      h("div", { class: "proposal__grid" },
        h("button", {
          type: "button", class: "proposal__open",
          onClick: () => Gara.vai({ tipo: "fase", n: 5, sub: p.id }),
        },
          h("span", { class: "proposal__meta" },
            h("span", { class: "mono", style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } }, p.id),
            tonoSev ? h("span", { class: `badge badge--sm badge--${tonoSev}` }, ETICHETTA_SEV[p.severita]) : null,
            d ? h("span", { class: `badge badge--sm badge--${DEC[d].tono}` }, DEC[d].etichetta) : null,
            p.riferimento ? h("span", { class: "mono faint", style: { fontSize: "var(--fs-micro)" } }, `da ${p.riferimento}`) : null),
          h("span", { class: "proposal__title" }, p.titolo || "(proposta senza titolo)"),
          p.sintesi ? h("span", { class: "proposal__summary" }, p.sintesi) : null),
        h("div", { class: "proposal__actions", role: "group", "aria-label": `Decisione su ${p.id}` },
          bottone("Approva", "approvata", "ok", I.spunta(10)),
          bottone("Da modificare", "da_modificare", "warn"),
          bottone("Scarta", "scartata", "crit"),
          h("button", {
            type: "button", class: "btn btn--sm",
            onClick: () => Gara.vai({ tipo: "fase", n: 5, sub: p.id }),
          }, "Dettaglio"))));
  }

  function fase5Dettaglio(stato) {
    const res = stato.registri.proposte;
    if (res.stato !== "ok") {
      return risorsa(res, { vuoto: () => vuotoInline("Proposta non trovata", "Il registro delle proposte non è disponibile."), render: () => null });
    }
    // Il registro e il grafo possono non essere allineati: una proposta
    // già diventata nodo può non essere ancora nel registro (o viceversa).
    // Basta una delle due fonti per aprire il dettaglio.
    let p = res.dati.find((x) => x.id === stato.vista.sub);
    if (!p && stato.dettaglioProposta.stato === "ok") {
      const fm = stato.dettaglioProposta.dati.frontmatter || {};
      p = {
        id: stato.vista.sub, titolo: fm.titolo || stato.vista.sub,
        criterio: fm.criterio || "", riferimento: fm.sottocriterio || "",
        sintesi: "", severita: null, punteggio: fm.punteggio_stimato,
        agente: "", decisione: null,
      };
    }
    if (!p) {
      if (stato.dettaglioProposta.stato === "caricamento") return scheletroBlocco(4);
      return h("div", { class: "pageerror" }, h("div", null,
        h("h3", null, "Proposta non trovata"),
        h("p", null, `Nessuna proposta con identificativo ${stato.vista.sub}, né nel registro né fra i nodi del grafo.`),
        h("button", { type: "button", class: "btn", onClick: () => Gara.vai({ tipo: "fase", n: 5 }) }, "Torna a tutte le proposte")));
    }

    const d = decisioneDi(stato, p);
    const gap = (stato.registri.gap.dati || []).find((g) => g.id === p.riferimento || g.proposta === p.id);

    const bottoneDecisione = (etichetta, valore, tono) => h("button", {
      type: "button", class: `btn btn--${tono}`,
      style: { justifyContent: "flex-start", textAlign: "left" },
      dataset: { on: String(d === valore) },
      "aria-pressed": String(d === valore),
      onClick: () => Gara.decidi(p.id, valore, notaCorrente()),
    }, valore === "approvata" ? I.spunta(12) : null, etichetta);

    const nota = h("textarea", {
      class: "textarea", rows: "3", id: "nota-decisione",
      placeholder: d === "da_modificare"
        ? "Cosa deve cambiare? (obbligatorio per il rimando)"
        : "Nota per lo storico (opzionale)",
    });
    const notaCorrente = () => (document.getElementById("nota-decisione") || {}).value || null;

    return h("div", { class: "split" },
      h("section", { class: "split__main" },
        cardContenutoProposta(stato, p),

        gap
          ? h("div", { class: "card card--crit" },
              h("div", { class: "row row--tight", style: { marginBottom: "var(--s-3)" } },
                h("h3", { class: "sec-title", style: { margin: 0 } }, "Gap di origine e prove"),
                h("span", { class: "badge badge--sm badge--crit mono" }, gap.id),
                h("button", {
                  type: "button", class: "btn btn--xs", style: { marginLeft: "auto" },
                  onClick: () => Gara.vai({ tipo: "grafo", filtro: "gap" }),
                }, "Vedi nel Grafo")),
              gap.sintesi ? h("p", { style: { margin: "0 0 var(--s-3)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" } }, gap.sintesi) : null,
              gap.prove.length
                ? h("div", { class: "stack" }, gap.prove.map((pr) =>
                    h("div", { class: "evidence" },
                      h("span", { class: "evidence__source" }, pr.fonte || "fonte non indicata"),
                      h("span", { class: "evidence__quote" }, pr.testo),
                      h("span", { class: `badge badge--sm badge--${pr.contraria ? "crit" : "ok"}` },
                        pr.contraria ? "contraria" : "a favore"))))
                : h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
                    "Nessuna prova collegata nel registro dei gap."))
          : null),

      h("aside", { class: "split__aside split__aside--wide" },
        h("div", { class: "card card--tight card--accent", style: { boxShadow: "var(--el-3)" } },
          h("h3", { style: { margin: "0 0 var(--s-3)", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } }, "Decisione"),
          h("div", { class: "stack", style: { marginBottom: "var(--s-3)" } },
            bottoneDecisione("Approva così com'è", "approvata", "ok"),
            bottoneDecisione("Rimanda con richiesta di modifica", "da_modificare", "warn"),
            bottoneDecisione("Scarta la proposta", "scartata", "crit")),
          nota,
          h("p", { style: { margin: "var(--s-2) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
            "La nota viene passata all'agente in caso di rimando ed entra nello storico in ogni caso.")),

        h("div", { class: "card card--tight" },
          secTitle("Storico decisioni"),
          storicoProposta(stato, p))));
  }

  /** Contenuto della proposta. Il nodo del grafo (`GET /proposte/{id}`)
      è la fonte migliore — frontmatter + corpo integrale — ma esiste solo
      dopo che feedback-processor l'ha elaborata: prima di allora si mostra
      ciò che il registro riporta, dicendo che è una sintesi. */
  function cardContenutoProposta(stato, p) {
    const nodo = stato.dettaglioProposta;

    if (nodo.stato === "caricamento") return scheletroBlocco(4);

    if (nodo.stato === "ok") {
      const fm = nodo.dati.frontmatter || {};
      const prove = fm.evidence_documents || [];
      return h("div", { class: "card" },
        secTitle("Contenuto della proposta"),
        h("div", { class: "prose" },
          Md.paragrafi(nodo.dati.corpo, 8).map((par) => h("p", null, par))),
        h("div", { class: "row row--tight", style: { marginTop: "var(--s-4)", paddingTop: "var(--s-4)", borderTop: "1px solid var(--hairline)" } },
          fm.criterio ? chip(`criterio ${fm.criterio}`) : null,
          fm.sottocriterio ? chip(fm.sottocriterio) : null,
          fm.punteggio_stimato !== undefined ? chip(`${fm.punteggio_stimato} punti stimati`) : null,
          fm.confidence ? chip(`confidence: ${fm.confidence}`, true) : null,
          fm.stato ? h("span", { class: "badge badge--sm badge--ok" }, fm.stato) : null),
        prove.length
          ? h("div", { style: { marginTop: "var(--s-4)" } },
              h("h4", { class: "sec-title" }, "Prove documentali del nodo"),
              h("div", { class: "stack" }, prove.map((e) =>
                h("div", { class: "evidence" },
                  h("span", { class: "evidence__source" }, `${e.doc || "documento"}${e.sezione ? " · " + e.sezione : ""}`),
                  h("span", { class: "evidence__quote" }, e.estratto || "")))))
          : null);
    }

    // 404 = proposta non ancora elaborata da feedback-processor: è uno
    // stato previsto del processo, non un guasto.
    return h("div", { class: "card" },
      secTitle("Contenuto della proposta"),
      h("div", { class: "prose" },
        h("p", null, p.sintesi || "Il registro riporta questa proposta senza un contenuto esteso.")),
      h("p", { style: { margin: "var(--s-3) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
        "Questa è la sintesi del registro. Il testo integrale e le prove collegate compaiono quando la proposta diventa un nodo del grafo, cioè dopo l'elaborazione del feedback."),
      h("div", { class: "row row--tight", style: { marginTop: "var(--s-4)", paddingTop: "var(--s-4)", borderTop: "1px solid var(--hairline)" } },
        p.criterio ? chip(`criterio ${p.criterio}`) : null,
        p.punteggio ? chip(`${p.punteggio} punti`) : null,
        p.agente ? chip(p.agente, true) : null));
  }

  /** Storico di una proposta: quello che il run-log e le decisioni di
      sessione dicono davvero, senza inventare passaggi intermedi. */
  function storicoProposta(stato, p) {
    const voci = [];
    const corpo5 = Dominio.corpoFase(stato.fasi, 5) || {};
    if (corpo5.conclusa_il) {
      voci.push({ cosa: "Proposta generata", chi: "pipeline · Fase 5", quando: UI.quandoBreve(corpo5.conclusa_il), tono: "info" });
    }
    for (const d of stato.storicoDecisioni.filter((x) => x.riferimento === p.id)) {
      voci.push({
        cosa: DEC[d.decisione] ? DEC[d.decisione].etichetta : d.decisione,
        chi: "operatore", quando: UI.quandoBreve(d.quando), nota: d.nota,
        tono: DEC[d.decisione] ? DEC[d.decisione].tono : "neu",
      });
    }
    if (!voci.length) {
      return h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
        "Nessuna decisione registrata su questa proposta in questa sessione. Le decisioni precedenti restano nel registro di gara.");
    }
    return h("ol", { class: "timeline" }, voci.map((v) =>
      h("li", null,
        h("span", { class: `timeline__dot timeline__dot--${v.tono}` }),
        h("span", { style: { minWidth: 0 } },
          h("span", { class: "timeline__what" }, v.cosa),
          h("span", { class: "timeline__who" }, `${v.chi} · ${v.quando}`),
          v.nota ? h("span", { class: "timeline__note" }, v.nota) : null))));
  }

  // ===================================================================
  // FASE 6 · Deliverables (elenco + workspace)
  // ===================================================================

  /* Stato di un deliverable: lo scrive il worker in _state/deliverables.json.
     "da_eseguire" è il default per un deliverable appena ricavato dal
     disciplinare — non è un errore, è "non ancora toccato". */
  const STATO_DELIVERABLE = {
    da_eseguire:   { tono: "neu",    etichetta: "Da eseguire",   azione: "Avvia" },
    in_esecuzione: { tono: "info",   etichetta: "In esecuzione",  azione: "Apri workspace" },
    completata:    { tono: "ok",     etichetta: "Completato",     azione: "Apri documento" },
    da_rivedere:   { tono: "accent", etichetta: "Da approvare",   azione: "Rivedi" },
    errore:        { tono: "crit",   etichetta: "Errore",         azione: "Diagnostica" },
  };
  const statoDeliverable = (d) => STATO_DELIVERABLE[d.stato] || STATO_DELIVERABLE.da_eseguire;

  const TIPI_TABELLARI = new Set(["computo_metrico", "elenco_prezzi", "cronoprogramma", "quadro_economico"]);
  const tabellare = (d) => TIPI_TABELLARI.has(d.tipo);

  /** File prodotti per un deliverable. `relazione_tecnica` conserva il
      percorso storico output/10_offer/; gli altri tipi hanno una cartella
      per id (vedi deliverables.percorso_output nel backend). */
  function fileDeliverable(stato, d) {
    const cartella = d.tipo === "relazione_tecnica" ? "10_offer/" : `10_offer/${d.id}/`;
    return (stato.output || []).filter((p) =>
      p.startsWith(cartella) && !p.slice(cartella.length).includes("/") && !p.startsWith("11_view/"));
  }

  function fase6Elenco(stato) {
    const res = stato.registri.deliverable;

    return risorsa(res, {
      vuoto: () => h("section", { class: "card" },
        vuotoInline("Nessun deliverable richiesto",
          "L'elenco è ricavato da manifest.json → deliverables, che disciplinare-analyst compila in Fase 3. Non è un modello fisso: dipende da cosa chiede questo disciplinare.",
          h("div", { class: "stack", style: { maxWidth: "320px", margin: "0 auto" } }, azioniFase(stato, 6)))),
      render: (lista) => {
        const pronti = lista.filter((d) => d.stato === "da_eseguire");
        return h("section", { class: "stack stack--4" },
          h("div", { class: "card card--tight" },
            h("div", { class: "row row--between" },
              h("p", { style: { margin: 0, flex: "1 1 420px", minWidth: 0, fontSize: "var(--fs-sm)", color: "var(--ink-2)" } },
                "L'elenco è ricavato dal disciplinare di questa gara, non è un modello fisso: sono richiesti ",
                h("strong", { class: "strong" }, UI.plurale(lista.length, "deliverable", "deliverable")),
                ". Ognuno ha agente e skill propri e può essere avviato per conto suo."),
              h("div", { class: "row row--tight" },
                pronti.length
                  ? h("button", {
                      type: "button", class: "btn btn--primary",
                      onClick: () => Gara.avviaDeliverable(pronti.map((d) => d.id)),
                    }, `Avvia i ${pronti.length} pronti`)
                  : null,
                ...azioniFase(stato, 6)))),

          h("div", { class: "deliverables" }, lista.map((d) => cardDeliverable(stato, d))));
      },
    });
  }

  function cardDeliverable(stato, d) {
    const st = statoDeliverable(d);
    const file = fileDeliverable(stato, d);
    const prodotto = file.length > 0;
    const tab = tabellare(d);

    return h("article", { class: `deliverable deliverable--${st.tono}` },
      h("span", { class: `rail rail--${st.tono}`, "aria-hidden": "true" }),
      h("div", { class: "row row--between row--tight", style: { marginBottom: "var(--s-3)" } },
        h("span", { class: `badge badge--sm badge--${st.tono}` },
          punto(d.stato === "in_esecuzione"), st.etichetta),
        h("span", { class: "mono faint", style: { fontSize: "var(--fs-micro)" } }, d.id)),

      h("button", {
        type: "button", class: "deliverable__open",
        onClick: () => Gara.vai({ tipo: "fase", n: 6, sub: d.id }),
      },
        h("span", { class: "deliverable__name" }, d.nome || d.id),
        h("span", { class: "deliverable__req" }, d.fonte || `criterio ${d.criterio}`)),

      h("div", { class: "row row--tight", style: { marginBottom: "var(--s-3)" } },
        chip(d.agente, true),
        chip(d.tipo.replace(/_/g, " ")),
        d.vincolo_formato ? chip(d.vincolo_formato) : null),

      h("div", { class: "deliverable__foot" },
        h("span", { class: "deliverable__dep" },
          prodotto
            ? `${UI.plurale(file.length, "file prodotto", "file prodotti")} in output/`
            : "Nessun file ancora prodotto per questo deliverable"),
        tab
          ? h("span", { class: `badge badge--sm badge--${prodotto ? "ok" : "neu"}` },
              prodotto ? I.spunta(11) : I.tratteggio(11),
              prodotto ? "Presente" : "Non prodotto")
          : null,
        d.stato === "da_eseguire"
          ? h("button", {
              type: "button", class: "btn btn--sm btn--accent", style: { flex: "none" },
              onClick: () => Gara.avviaDeliverable([d.id]),
            }, "Avvia")
          : h("button", {
              type: "button", class: "btn btn--sm", style: { flex: "none" },
              onClick: () => Gara.rieseguiDeliverable(d.id),
            }, "Riesegui"),
        h("button", {
          type: "button", class: "btn btn--sm", style: { flex: "none" },
          onClick: () => Gara.vai({ tipo: "fase", n: 6, sub: d.id }),
        }, st.azione)));
  }

  function fase6Workspace(stato) {
    const res = stato.registri.deliverable;
    if (res.stato !== "ok") {
      return risorsa(res, { vuoto: () => vuotoInline("Deliverable non disponibile", "L'elenco dei deliverable non è ancora stato prodotto."), render: () => null });
    }
    const d = res.dati.find((x) => x.id === stato.vista.sub);
    if (!d) {
      return h("div", { class: "pageerror" }, h("div", null,
        h("h3", null, "Deliverable non trovato"),
        h("p", null, `Nessun deliverable con id ${stato.vista.sub} in manifest.json → deliverables.`),
        h("button", { type: "button", class: "btn", onClick: () => Gara.vai({ tipo: "fase", n: 6 }) }, "Torna a tutti i deliverable")));
    }

    const st = statoDeliverable(d);
    const file = fileDeliverable(stato, d);
    const prodotto = file.length > 0;
    const tab = tabellare(d);
    const contenuto = stato.contenutoDeliverable;

    const pannello = tab
      ? h("div", { class: `tabular${prodotto ? " tabular--present" : ""}` },
          h("span", { class: "tabular__icon" }, I.tabella(18)),
          h("div", { class: "tabular__body" },
            h("strong", null, prodotto ? "Presente" : "Non ancora prodotto"),
            h("span", null, "Contenuto tabellare: non viene anteprimato in pagina. Si verifica la presenza; il merito si controlla sul file, e in Fase 7 se ne verifica solo la consegnabilità.")),
          h("dl", null,
            h("dt", null, "Tipo"), h("dd", null, d.tipo.replace(/_/g, " ")),
            h("dt", null, "File"), h("dd", null, String(file.length))))
      : risorsa(contenuto, {
          vuoto: () => vuotoInline(
            prodotto ? "Documento senza contenuto leggibile" : "Documento non ancora scritto",
            prodotto
              ? "Il file esiste ma non contiene prosa che si possa anteprimare."
              : "Il file compare quando questo deliverable viene eseguito."),
          render: (par) => h("div", { class: "prose prose--boxed" },
            par.map((p) => p.titolo ? h("h4", null, p.titolo) : h("p", null, p.testo))),
        });

    return h("div", { class: "split" },
      h("section", { class: "split__main" },
        h("div", { class: `card card--${st.tono}` },
          h("div", { class: "row row--between", style: { marginBottom: "var(--s-3)" } },
            h("h3", { class: "sec-title", style: { margin: 0 } },
              prodotto ? "Output prodotto" : "Output · non ancora prodotto"),
            h("div", { class: "row row--tight" },
              d.stato === "da_eseguire"
                ? h("button", { type: "button", class: "btn btn--sm btn--accent", onClick: () => Gara.avviaDeliverable([d.id]) }, "Avvia")
                : h("button", { type: "button", class: "btn btn--sm", onClick: () => Gara.rieseguiDeliverable(d.id) }, "Riesegui"),
              ...file.slice(0, 3).map((p) => h("a", {
                class: "btn btn--sm btn--accent",
                href: Api.percorsoOutput(stato.slug, p), target: "_blank", rel: "noopener",
              }, I.scarica(11), `.${p.split(".").pop()}`)))),
          pannello),

        contenuto.stato === "ok" && contenuto.sezioni && contenuto.sezioni.length
          ? h("div", { class: "card" },
              h("h3", { class: "sec-title", style: { marginBottom: "var(--s-4)" } }, "Struttura del documento"),
              h("div", { class: "stack" }, contenuto.sezioni.map((sez) =>
                h("div", { class: "docsection docsection--ok" },
                  h("span", { class: "docsection__icon" }, I.spunta(12)),
                  h("span", { class: "docsection__title" }, sez.titolo),
                  h("span", { class: "docsection__source" }, `${sez.parole} parole`),
                  h("span", { class: "docsection__status" }, "presente")))))
          : null),

      h("aside", { class: "split__aside" },
        h("div", { class: "card card--tight" },
          secTitle("Assegnazione"),
          h("dl", { class: "dl dl--kv" },
            h("dt", null, "Agente"), h("dd", { class: "mono" }, d.agente),
            h("dt", null, "Tipo"), h("dd", null, d.tipo.replace(/_/g, " ")),
            h("dt", null, "Criterio"), h("dd", { class: "mono" }, d.criterio),
            h("dt", null, "Fonte"), h("dd", null, d.fonte || "—"),
            h("dt", null, "Vincolo"), h("dd", null, d.vincolo_formato || "nessuno dichiarato"),
            h("dt", null, "Modello"), h("dd", { class: "mono" }, stato.manifest?.esecuzione?.modello || "—")),
          h("button", {
            type: "button", class: "btn btn--sm btn--block", style: { marginTop: "var(--s-4)" },
            onClick: () => Gara.vai({ tipo: "impostazioni" }),
          }, "Cambia modello o effort")),

        h("div", { class: `card card--tight card--${prodotto ? "ok" : "warn"}` },
          h("strong", { style: { display: "block", fontSize: "var(--fs-xs)", color: "var(--ink-1)", marginBottom: "4px" } },
            prodotto ? "Entra nel plico" : "Manca al plico"),
          h("p", { style: { margin: 0, fontSize: "var(--fs-micro)", color: "var(--ink-2)" } },
            prodotto
              ? "Il documento è prodotto: entra nel plico così com'è, salvo riesecuzione esplicita."
              : "Finché questo deliverable non produce un file, la Fase 7 resta incompleta."))));
  }

  // ===================================================================
  // FASE 7 · Audit e consegna
  // ===================================================================

  function fase7(stato) {
    const res = stato.registri.audit;
    const del = stato.registri.deliverable;
    const prodotti = del.stato === "ok" ? del.dati.filter((d) => d.prodotto).length : 0;
    const totaleDel = del.stato === "ok" ? del.dati.length : 0;

    const checklist = risorsa(res, {
      vuoto: () => vuotoInline("Audit non ancora eseguito",
        "La checklist di consegna si popola quando la Fase 7 produce audit_summary.md.",

        h("p", { class: "faint", style: { margin: 0, fontSize: "var(--fs-micro)" } },
          "L'azione per questa fase è nel pannello a destra.")),
      render: (voci) => h("div", { class: "card" },
        h("h3", { class: "sec-title", style: { marginBottom: "var(--s-4)" } }, "Checklist di consegna"),
        h("div", { class: "stack" }, voci.map((v) =>
          h("div", { class: `auditrow auditrow--${v.tono}` },
            h("span", { class: "auditrow__icon" },
              v.tono === "ok" ? I.spunta(12) : v.tono === "crit" ? I.croce(12) : v.tono === "neu" ? I.tratteggio(12) : I.avviso(12)),
            h("span", { class: "auditrow__body" },
              h("span", { class: "auditrow__label" }, v.voce),
              v.dettaglio ? h("span", { class: "auditrow__detail" }, v.dettaglio) : null),
            h("span", { class: `badge badge--sm badge--${v.tono}` }, v.esito))))),
    });

    // L'approvazione finale è il gate umano della Fase 7: ha senso solo
    // quando la fase è stata eseguita e si è fermata sul checkpoint. Prima
    // di allora l'azione disponibile è avviarla, non approvarla.
    const st7 = Dominio.statoFase(stato.fasi, 7);
    const alCheckpoint = st7 === "da_rivedere";
    const tuttiProdotti = totaleDel > 0 && prodotti === totaleDel;
    const motivoBlocco = !alCheckpoint
      ? "L'audit della Fase 7 non si è ancora fermato su un checkpoint da approvare."
      : !tuttiProdotti
        ? "Tutti i deliverable devono essere prodotti prima dell'approvazione finale."
        : "";

    return h("div", { class: "split" },
      h("section", { class: "split__main" },
        h("div", { class: "note note--lg" }, I.info(15),
          h("p", null,
            h("strong", { class: "strong" }, "Questo audit non ricontrolla le prove."),
            " La verifica documentale requisito-per-requisito è avvenuta in Fase 4 e 5. Qui si controlla solo che il ",
            h("em", null, "plico"),
            " sia completo, formalmente valido e consegnabile: presenza dei deliverable, limiti di pagine, firme, formati, marca da bollo.")),
        checklist),

      h("aside", { class: "split__aside split__aside--wide" },
        h("div", { class: "card card--accent", style: { boxShadow: "var(--el-3)" } },
          h("h3", { style: { margin: "0 0 var(--s-2)", fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } },
            "Approvazione finale"),
          h("p", { style: { margin: "0 0 var(--s-4)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" } },
            totaleDel
              ? `${prodotti} deliverable su ${totaleDel} risultano prodotti.`
              : "Nessun deliverable ancora prodotto dalla Fase 6."),
          h("div", { class: "stack" },
            // Un solo invito primario per volta: al checkpoint è
            // l'approvazione, altrimenti sono le azioni della fase.
            alCheckpoint
              ? h("button", {
                  type: "button", class: "btn btn--primary btn--block",
                  disabled: !tuttiProdotti, title: motivoBlocco,
                  onClick: () => Gara.approvaFase(7),
                }, "Approva e genera il plico")
              : h("button", {
                  type: "button", class: "btn btn--block",
                  disabled: true, title: motivoBlocco,
                }, "Approva e genera il plico"),
            ...azioniFase(stato, 7)),
          h("p", { style: { margin: "var(--s-3) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
            "L'approvazione finale congela i deliverable e produce il plico firmabile.")),

        h("div", { class: "card card--tight card--flat" },
          h("h3", { style: { margin: "0 0 var(--s-2)", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } }, "Scadenza"),
          h("p", { style: { margin: 0, fontSize: "var(--fs-micro)", color: "var(--ink-2)" } },
            stato.manifest?.gara?.scadenza_offerta
              ? ["Presentazione entro il ", h("strong", { class: "strong" }, stato.manifest.gara.scadenza_offerta), ` — ${UI.scadenza(stato.manifest.gara.scadenza_offerta)}.`]
              : "Il manifesto della gara non riporta una scadenza di presentazione."))));
  }

  // ===================================================================
  // GRAFO
  // ===================================================================

  const TIPI_GRAFO = [
    { chiave: "documento",   etichetta: "Documenti",   uno: "documento",   forma: "2px",   tono: "var(--ink-3)" },
    { chiave: "requisito",   etichetta: "Requisiti",   uno: "requisito",   forma: "999px", tono: "var(--info)" },
    { chiave: "gap",         etichetta: "Gap",         uno: "gap",         forma: "2px",   tono: "var(--crit)" },
    { chiave: "proposta",    etichetta: "Proposte",    uno: "proposta",    forma: "999px", tono: "var(--accent)" },
    { chiave: "deliverable", etichetta: "Deliverable", uno: "deliverable", forma: "4px",   tono: "var(--ok)" },
    { chiave: "altro",       etichetta: "Altri nodi",  uno: "nodo",        forma: "2px",   tono: "var(--neu)" },
  ];

  /* I tipi del knowledge graph non coincidono con le colonne del design.
     La mappa sta qui; ciò che non rientra finisce in «Altri nodi» invece
     di sparire — un nodo che il grafo contiene e la vista non mostra
     sarebbe una bugia sulla tracciabilità. */
  const COLONNA_PER_TIPO = {
    document: "documento",
    criterion: "requisito",
    proposal: "proposta",
  };

  const FASE_PER_COLONNA = { documento: 1, requisito: 2, gap: 4, proposta: 5, deliverable: 6, altro: 2 };

  function destinazioneNodo(colonna, id) {
    if (colonna === "proposta") return { tipo: "fase", n: 5, sub: id };
    if (colonna === "deliverable") return { tipo: "fase", n: 6, sub: id };
    return { tipo: "fase", n: FASE_PER_COLONNA[colonna] || 2 };
  }

  /** Nodi per colonna. Documenti, requisiti e proposte vengono dal grafo
      reale (`GET /gare/{slug}/grafo`, ricostruito da 02_graph/); gap e
      deliverable non sono nodi del grafo e arrivano dalle loro fonti. */
  function nodiGrafo(stato) {
    const perColonna = Object.fromEntries(TIPI_GRAFO.map((t) => [t.chiave, []]));
    const faseFiltro = stato.vista.fase ? Number(stato.vista.fase) : null;
    const ammessa = (n) => !faseFiltro || faseFiltro === n;

    const g = stato.registri.grafo;
    if (g.stato === "ok") {
      for (const n of g.dati.nodi || []) {
        const colonna = COLONNA_PER_TIPO[n.tipo] || "altro";
        if (!ammessa(FASE_PER_COLONNA[colonna])) continue;
        perColonna[colonna].push({
          id: n.id,
          etichetta: n.etichetta || n.id,
          tipo: n.tipo,
          confidence: n.confidence,
          destinazione: destinazioneNodo(colonna, n.id),
        });
      }
    }

    if (ammessa(4) && stato.registri.gap.stato === "ok") {
      for (const x of stato.registri.gap.dati) {
        perColonna.gap.push({
          id: x.id || "GAP", etichetta: x.titolo || "(senza titolo)",
          destinazione: destinazioneNodo("gap", x.id),
        });
      }
    }
    if (ammessa(6) && stato.registri.deliverable.stato === "ok") {
      for (const x of stato.registri.deliverable.dati) {
        perColonna.deliverable.push({
          id: x.id, etichetta: x.nome || x.id,
          destinazione: destinazioneNodo("deliverable", x.id),
        });
      }
    }
    return perColonna;
  }

  function grafo(stato) {
    const res = stato.registri.grafo;
    if (res.stato === "caricamento") return scheletroBlocco(5);
    if (res.stato === "assente") return backendVecchio(res.percorso);
    if (res.stato === "errore") return erroreBlocco(res.errore, res.percorso);

    const perColonna = nodiGrafo(stato);
    const colonne = TIPI_GRAFO
      .map((t) => ({ ...t, nodi: perColonna[t.chiave] }))
      .filter((c) => c.nodi.length > 0);
    const totale = colonne.reduce((n, c) => n + c.nodi.length, 0);
    const filtro = stato.vista.filtro || "tutti";

    if (totale === 0) {
      return h("section", { class: "card" },
        vuotoInline("Il grafo è ancora vuoto",
          "I nodi compaiono man mano che le fasi producono documenti, requisiti, gap, proposte e deliverable. Il grafo di conoscenza si costruisce in Fase 2."));
    }

    const filtri = [{ chiave: "tutti", etichetta: "Tutti i nodi", forma: "2px", conteggio: totale }]
      .concat(colonne.map((c) => ({ chiave: c.chiave, etichetta: c.etichetta, forma: c.forma, conteggio: c.nodi.length })))
      .map((f) => h("button", {
        type: "button", class: "pill", dataset: { tone: "accent" },
        "aria-pressed": String(filtro === f.chiave),
        onClick: () => Gara.vai({ tipo: "grafo", filtro: f.chiave, fase: stato.vista.fase }),
      },
        h("span", { style: { width: "7px", height: "7px", borderRadius: f.forma, background: "currentColor", flex: "none" }, "aria-hidden": "true" }),
        f.etichetta,
        h("span", { class: "pill__count mono" }, String(f.conteggio))));

    const svgArchi = s("svg", { class: "graph__edges", "aria-hidden": "true" });
    const canvas = h("div", { class: "graph__canvas" },
      svgArchi,
      h("div", { class: "graph__cols", style: { gridTemplateColumns: `repeat(${colonne.length}, 1fr)` } },
        colonne.map((c) => {
          const attiva = filtro === "tutti" || filtro === c.chiave;
          return h("div", { class: "graph__col", dataset: { active: String(attiva) } },
            h("div", { class: "graph__colhead", style: { color: c.tono } },
              h("span", { class: "graph__shape", style: { borderRadius: c.forma }, "aria-hidden": "true" }),
              c.etichetta),
            c.nodi.slice(0, 6).map((n, i) => h("button", {
              type: "button", class: "node",
              dataset: { nodo: n.id },
              title: n.confidence ? `confidence: ${n.confidence}` : "",
              style: { animationDelay: `${i * 55}ms` },
              onClick: () => Gara.vai(n.destinazione),
            },
              h("div", { class: "node__id mono", style: { color: attiva ? c.tono : "var(--ink-4)" } }, n.id),
              h("div", { class: "node__label" }, n.etichetta))),
            c.nodi.length > 6
              ? h("div", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
                  `+${UI.plurale(c.nodi.length - 6, c.uno, c.etichetta.toLowerCase())}`)
              : null);
        })));

    // Gli archi sono quelli veri del grafo: si tracciano dopo il layout,
    // misurando i nodi effettivamente resi. Quelli verso nodi non
    // visibili (oltre i primi 6, o filtrati) semplicemente non si vedono.
    const archi = (res.dati.archi || []);
    requestAnimationFrame(() => disegnaArchi(canvas, svgArchi, archi));

    const senzaFrontmatter = (res.dati.nodi_senza_frontmatter || []).length;

    return h("section", { class: "card" },
      h("div", { class: "row row--between row--top", style: { marginBottom: "var(--s-4)" } },
        h("div", { class: "filterbar__group", role: "group", "aria-label": "Filtra per tipo di nodo" }, filtri),
        h("label", { class: "row row--tight", style: { flex: "none" } },
          h("span", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } }, "Fase"),
          h("select", {
            class: "select input--sm", style: { width: "auto" },
            onChange: (e) => Gara.vai({ tipo: "grafo", filtro: filtro, fase: e.target.value }),
          },
            h("option", { value: "" }, "Tutte le fasi"),
            Dominio.FASI.map((f) => h("option", {
              value: String(f.n), selected: String(f.n) === String(stato.vista.fase || ""),
            }, `${f.n} · ${f.titolo}`))))),

      senzaFrontmatter
        ? h("div", { class: "note note--warn", style: { marginBottom: "var(--s-4)" } }, I.avviso(14),
            h("p", null, `${UI.plurale(senzaFrontmatter, "pagina del grafo è inclusa", "pagine del grafo sono incluse")} senza frontmatter valido: compaiono come nodo senza dati invece di essere scartate in silenzio.`))
        : null,

      h("div", { class: "graph" }, canvas),

      h("div", { class: "row row--between", style: { marginTop: "var(--s-4)" } },
        h("p", { style: { margin: 0, maxWidth: "76ch", fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
          "Il grafo è la vista di tracciabilità: da un deliverable si risale alla proposta, al gap, al requisito e al documento che lo impone. Clic su un nodo per aprire l'elemento nella sua fase."),
        h("span", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
          `${UI.plurale(archi.length, "arco", "archi")} · filtro: `,
          h("strong", { style: { color: "var(--ink-2)" } },
            filtro === "tutti" ? "tutti i tipi di nodo" : filtro))));
  }

  /** Traccia gli archi reali misurando la posizione dei nodi resi. */
  function disegnaArchi(canvas, svg, archi) {
    if (!canvas.isConnected) return;
    const base = canvas.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${Math.round(base.width)} ${Math.round(base.height)}`);
    svg.replaceChildren();

    const centro = new Map();
    for (const el of canvas.querySelectorAll("[data-nodo]")) {
      const r = el.getBoundingClientRect();
      centro.set(el.dataset.nodo, {
        sx: r.right - base.left, dx: r.left - base.left,
        y: r.top - base.top + r.height / 2,
      });
    }

    const linee = [];
    for (const a of archi) {
      const da = centro.get(a.da), verso = centro.get(a.a);
      if (!da || !verso) continue;
      // La curva evita che archi paralleli si sovrappongano in una riga sola.
      const x1 = da.sx + 4, x2 = verso.dx - 4;
      const dx = Math.max(18, (x2 - x1) / 2);
      linee.push(s("path", {
        d: `M ${x1} ${da.y} C ${x1 + dx} ${da.y}, ${x2 - dx} ${verso.y}, ${x2} ${verso.y}`,
        fill: "none", stroke: "currentColor", "stroke-width": "1",
      }));
    }
    if (linee.length) svg.append(...linee);
  }

  // ===================================================================
  // ATTIVITÀ
  // ===================================================================

  function attivita(stato) {
    const res = stato.runLog;

    const tabella = risorsa(res, {
      vuoto: () => vuotoInline("Nessuna esecuzione registrata",
        "Lo storico si popola alla prima esecuzione di una fase."),
      render: (runs) => {
        const filtrate = runs.filter((r) => {
          if (stato.filtroAttivita === "errori") return r.esito !== "completato";
          if (stato.filtroAttivita === "umane") return r.umana;
          return true;
        });
        if (!filtrate.length) {
          return vuotoInline("Nessuna riga con questo filtro",
            "Cambia filtro per vedere le altre esecuzioni.");
        }
        return h("div", { class: "table-wrap" },
          h("table", { class: "table" },
            h("thead", null, h("tr", null,
              h("th", null, "Avvio"), h("th", null, "Fase / oggetto"),
              h("th", null, "Modello / attore"), h("th", { class: "t-right" }, "Durata"),
              h("th", { class: "t-right" }, "Esito"))),
            h("tbody", null, filtrate.map((r) => {
              const tono = r.esito === "completato" ? "ok" : r.esito === "in_corso" ? "info" : "crit";
              return h("tr", null,
                h("td", { class: "t-mono" }, UI.quandoBreve(r.avviato_il)),
                h("td", null, `${r.fase} · ${Dominio.fase(Number(r.fase))?.titolo || ""}`),
                h("td", { class: "t-muted" }, `${r.modello || "—"}${r.effort ? " · " + r.effort : ""}`),
                h("td", { class: "t-num" }, r.durata),
                h("td", { class: "t-right" },
                  h("span", { class: `badge badge--sm badge--${tono}` }, r.esito)));
            }))));
      },
    });

    const filtro = (chiave, etichetta) => h("button", {
      type: "button", class: "pill",
      "aria-pressed": String(stato.filtroAttivita === chiave),
      onClick: () => Gara.filtraAttivita(chiave),
    }, etichetta);

    return h("section", { class: "stack stack--4" },
      h("div", { class: "card" },
        h("div", { class: "row row--between", style: { marginBottom: "var(--s-4)" } },
          h("h3", { class: "sec-title", style: { margin: 0 } }, "Storico esecuzioni"),
          h("div", { class: "filterbar__group" },
            filtro("tutte", "Tutte le fasi"),
            filtro("errori", "Solo errori"),
            filtro("umane", "Solo decisioni umane"))),
        tabella),

      agentiAttivi(stato),

      h("details", { class: "raw", open: false },
        h("summary", null, I.freccia(10),
          "Log grezzo (JSON) · sede unica, non ripetuto nelle viste di fase"),
        h("pre", null, JSON.stringify({
          fasi: stato.fasi, attivita: stato.attivita,
          run_log: stato.runLog.stato === "ok" ? stato.runLog.grezzo : null,
        }, null, 2))),

      pannelloClaudeCode(stato));
  }

  /** Le righe di agente si desaturano quando lo stream è caduto: «fermo» e
      «non più aggiornato» non devono somigliarsi. */
  function agentiAttivi(stato) {
    const att = stato.attivita || {};
    const attivi = att.agenti_attivi || [];
    const conclusi = (att.agenti_conclusi || []).slice(-8).reverse();
    if (!attivi.length && !conclusi.length) return null;

    const perso = stato.sse === "perso";
    const righe = [
      ...attivi.map((a) => ({ ...a, st: "in_corso" })),
      ...conclusi.map((a) => ({ ...a, st: "completato" })),
    ];

    return h("div", { class: "card" },
      h("div", { class: "row row--between", style: { marginBottom: "var(--s-3)" } },
        h("h3", { class: "sec-title", style: { margin: 0 } }, "Agenti"),
        att.aggiornato_il
          ? h("span", { class: "faint", style: { fontSize: "var(--fs-micro)" } },
              `aggiornato ${UI.quandoRelativo(att.aggiornato_il)}`)
          : null),
      perso
        ? h("div", { class: "note note--warn", role: "alert", style: { marginBottom: "var(--s-4)" } },
            I.triangolo(15),
            h("div", { style: { flex: 1 } },
              h("strong", { style: { display: "block", fontSize: "var(--fs-sm)", color: "var(--ink-1)", marginBottom: "2px" } },
                "Aggiornamenti in tempo reale interrotti"),
              h("span", { style: { fontSize: "var(--fs-xs)", color: "var(--ink-2)" } },
                `La pipeline continua a girare sul server. Riconnessione automatica in corso — ultimo dato ricevuto ${UI.quandoRelativo(stato.ultimoEvento)}.`),
              h("div", { class: "row row--tight", style: { marginTop: "var(--s-3)" } },
                h("button", { type: "button", class: "btn btn--xs", onClick: () => Gara.riconnetti() }, "Riconnetti ora"),
                h("button", { type: "button", class: "btn btn--xs btn--quiet", onClick: () => location.reload() }, "Ricarica la pagina"))))
        : null,
      h("div", { class: `stack${perso ? " stale" : ""}` }, righe.map((a) =>
        h("div", { class: "agentrow", dataset: { st: a.st } },
          h("span", { class: "agentrow__dot", "aria-hidden": "true" }),
          h("div", { class: "agentrow__body" },
            h("div", { class: "agentrow__name" }, a.agente || "agente"),
            h("div", { class: "agentrow__desc" }, a.descrizione || "")),
          h("span", { class: "agentrow__st" },
            perso ? "stato non aggiornato" : a.st === "in_corso" ? "in corso" : "concluso")))),
      perso
        ? h("p", { style: { margin: "var(--s-3) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-4)" } },
            "Le righe restano visibili ma desaturate e con bordo tratteggiato: si distingue «fermo» da «non più aggiornato».")
        : null);
  }

  /** Claude Code: l'unico punto dell'app che scrive sulla gara, messo
      accanto al registro di ciò che ha scritto. Sta qui e non
      nell'assistente proprio perché i due poteri non vanno confusi:
      l'assistente legge, questo modifica file e riaccoda job. */
  function pannelloClaudeCode(stato) {
    const c = stato.interventi;

    const messaggi = c.messaggi.length
      ? c.messaggi.map((m) => h("div", { class: `chat__msg${m.mio ? " chat__msg--me" : ""}` },
          h("div", { class: "chat__who" }, m.mio ? "Tu" : "Claude Code"),
          h("div", { class: "chat__text" }, m.testo),
          m.quando ? h("div", { class: "chat__source" }, UI.quandoBreve(m.quando)) : null))
      : [h("div", { class: "empty-inline" },
          h("div", { class: "empty-inline__title" }, "Nessun intervento ancora"),
          h("p", null, "Da qui si chiede una correzione puntuale che non rientra nel comando di una fase: sistemare un elaborato, rilanciare un controllo, verificare qualcosa direttamente sui documenti. Ogni intervento entra nello storico qui sopra."))];

    return h("section", { class: "codepanel", "aria-labelledby": "h-code" },
      h("div", { class: "codepanel__head" },
        h("div", { style: { minWidth: 0, flex: "1 1 420px" } },
          h("div", { class: "row row--tight", style: { marginBottom: "5px" } },
            h("h3", { id: "h-code" }, "Claude Code · intervento diretto"),
            h("span", { class: "badge badge--sm badge--info" }, "lettura e scrittura")),
          h("p", null, "Sta qui, e non nell'assistente, perché scrive: corregge elaborati, riaccoda job, cambia parametri. La sessione è limitata alla directory di questa gara e ogni intervento resta nello storico.")),
        h("span", { class: "mono faint", style: { flex: "none", fontSize: "var(--fs-micro)" } },
          `cwd: gare/${stato.slug}`)),

      h("div", { class: "codepanel__log chat chat--code", role: "log", "aria-live": "polite" },
        messaggi,
        c.invio ? h("div", { class: "typing" }, h("span"), h("span"), h("span")) : null,
        c.errore
          ? h("div", { class: "note note--crit" }, I.avviso(14), h("p", null, c.errore))
          : null),

      h("div", { class: "composer composer--code" },
        h("input", {
          type: "text", class: "input", id: "intervento-input", value: c.bozza,
          disabled: c.invio,
          "aria-label": "Richiesta a Claude Code",
          placeholder: "Es. sostituisci la voce E.14.20 con E.14.18 nel computo e riaccoda il job",
          onInput: (e) => { stato.interventi.bozza = e.target.value; },
          onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); Gara.intervieni(); } },
        }),
        h("button", {
          type: "button", class: "btn btn--sm btn--infotone",
          disabled: c.invio,
          onClick: () => Gara.intervieni(),
        }, c.invio ? "In corso…" : "Esegui")));
  }

  // ===================================================================
  // IMPOSTAZIONI
  // ===================================================================

  function impostazioni(stato) {
    const m = stato.manifest || {};
    const sistema = stato.sistema;

    const riga = (titolo, valore, tono, azione) =>
      h("div", { class: `auditrow${tono ? " auditrow--" + tono : ""}`, style: { justifyContent: "space-between" } },
        h("span", { style: { minWidth: 0 } },
          h("strong", { style: { display: "block", fontSize: "var(--fs-xs)", color: "var(--ink-1)" } }, titolo),
          h("span", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-2)" } }, valore)),
        azione || null);

    return h("div", { class: "split", style: { gap: "var(--s-5)" } },
      // Ambito 1: questa gara.
      h("section", { class: "card card--accent", style: { flex: "1 1 480px", minWidth: 0 }, "aria-labelledby": "h-set-gara" },
        h("div", { class: "row row--tight", style: { marginBottom: "var(--s-2)" } },
          h("span", { class: "badge badge--sm badge--accent" }, "Questa gara")),
        h("h3", { id: "h-set-gara", class: "mono", style: { margin: "0 0 var(--s-4)", fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } },
          stato.slug),
        h("div", { class: "stack stack--4" },
          h("label", { class: "field" },
            h("span", { class: "field__label" }, "Nome esteso"),
            h("input", { type: "text", class: "input", value: m.nome || "", readonly: true })),
          h("div", { class: "grid-auto grid-auto--sm" },
            campoSolaLettura("Modello", m.esecuzione?.modello),
            campoSolaLettura("Effort", m.esecuzione?.effort),
            campoSolaLettura("Prezzario", `${m.prezzario?.regione || "—"} ${m.prezzario?.anno || ""}`.trim())),
          h("div", { class: "note note--warn" }, I.avviso(14),
            h("p", null, "I parametri della gara sono scritti in ", h("code", { class: "mono" }, "manifest.json"),
              " dalla pipeline. Il backend non espone ancora una modifica: per cambiarli si interviene sul manifesto e si riesegue la fase interessata. I job già completati non vengono rigenerati.")),
          h("div", { class: "card card--tight card--crit", style: { background: "var(--crit-soft)", boxShadow: "none" } },
            h("strong", { style: { display: "block", fontSize: "var(--fs-xs)", color: "var(--ink-1)", marginBottom: "4px" } }, "Archiviazione"),
            h("p", { style: { margin: "0 0 var(--s-3)", fontSize: "var(--fs-micro)", color: "var(--ink-2)" } },
              "La gara esce dall'elenco attivo e diventa in sola lettura. Elaborati, grafo e storico restano consultabili."),
            h("div", { class: "row row--tight" },
              h("button", { type: "button", class: "btn btn--sm btn--crit", disabled: true, title: "Non ancora esposta dal backend" }, "Archivia la gara"),
              h("button", { type: "button", class: "btn btn--sm", disabled: true, title: "Non ancora esposta dal backend" }, "Duplica come nuova gara"))))),

      // Ambito 2: l'installazione. Separato di proposito.
      h("section", { class: "card card--dashed", style: { flex: "1 1 380px", minWidth: 0, maxWidth: "520px" }, "aria-labelledby": "h-set-sys" },
        h("div", { class: "row row--tight", style: { marginBottom: "var(--s-2)" } },
          h("span", { class: "badge badge--sm" }, "Sistema e account")),
        h("h3", { id: "h-set-sys", style: { margin: "0 0 var(--s-2)", fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--ink-1)" } },
          "Vale per tutte le gare"),
        h("p", { style: { margin: "0 0 var(--s-4)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
          "Sezione separata di proposito: qui una modifica ha effetto sull'intera installazione, non su questa gara."),
        h("div", { class: "stack stack--3" },
          sistema.auth === null
            ? h("div", { class: "skeleton", style: { padding: "var(--s-3)" } }, h("div", { class: "sk" }))
            : riga("Autenticazione Claude",
                sistema.auth.disponibile
                  ? `Attiva${sistema.auth.stima_scadenza ? ` · ~${sistema.auth.stima_scadenza.giorni_alla_scadenza_stimata} giorni alla scadenza stimata` : ""}`
                  : `Non disponibile: ${sistema.auth.motivo || "motivo non riportato"}`,
                sistema.auth.disponibile ? "ok" : "crit"),
          sistema.pipeline === null
            ? h("div", { class: "skeleton", style: { padding: "var(--s-3)" } }, h("div", { class: "sk" }))
            : riga("Versione pipeline",
                `spada-core ${sistema.pipeline.versione} · ${sistema.pipeline.git_ref}`, null,
                h("span", { class: "badge badge--sm badge--ok", style: { flex: "none" } }, "installata")),
          sistema.prezzari === null
            ? h("div", { class: "skeleton", style: { padding: "var(--s-3)" } }, h("div", { class: "sk" }))
            : riga("Prezzari installati",
                sistema.prezzari.length
                  ? `${new Set(sistema.prezzari.map((p) => p.regione)).size} regioni · ${sistema.prezzari.length} annualità`
                  : "Nessun prezzario importato",
                sistema.prezzari.length ? null : "warn"),
          riga("Tema predefinito",
            UI.Tema.leggi() === "auto" ? "Segue il sistema operativo" : `Forzato su ${UI.Tema.leggi() === "dark" ? "scuro" : "chiaro"}`,
            null,
            h("button", {
              type: "button", class: "btn btn--xs", style: { flex: "none" },
              onClick: () => { UI.Tema.applica("auto"); Gara.disegna(); },
            }, "Torna ad automatico")))));
  }

  function campoSolaLettura(etichetta, valore) {
    return h("label", { class: "field" },
      h("span", { class: "field__label" }, etichetta),
      h("input", { type: "text", class: "input mono", value: valore || "—", readonly: true }));
  }

  return {
    fase1, fase2, fase3, fase4,
    fase5Elenco, fase5Dettaglio,
    fase6Elenco, fase6Workspace,
    fase7, grafo, attivita, impostazioni, brief,
    azioniFase, risorsa, vuotoInline, TIPI_GRAFO,
  };
})();
