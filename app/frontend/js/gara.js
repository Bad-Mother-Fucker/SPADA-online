// gara.js — guscio della pagina gara: router, stream, caricamento dei
// registri e azioni. Le viste stanno in viste.js e non fanno fetch.
//
// Regole di struttura (dallo schema di navigazione del design):
//   · il guscio non si ricarica mai al cambio vista;
//   · lo stream SSE è aperto una volta dal guscio, non dalle viste;
//   · ogni vista ha una URL propria, così è linkabile e sta nella cronologia;
//   · l'assistente è un pannello flottante: non occupa layout e non cambia
//     con la fase, perché interroga sempre l'intera gara.

const { h, s, set, I, punto, Toast } = UI;

const SLUG = new URLSearchParams(location.search).get("slug");
if (!SLUG) {
  document.body.replaceChildren(h("div", { class: "shell" },
    h("div", { class: "pageerror" }, h("div", null,
      h("h3", null, "Slug della gara mancante"),
      h("p", null, "L'indirizzo non indica quale gara aprire. Serve un parametro ", h("code", { class: "mono" }, "?slug="), "."),
      h("a", { class: "btn btn--primary", href: "index.html" }, "Torna all'elenco gare")))));
  throw new Error("slug mancante");
}

const vuoto = () => ({ stato: "caricamento", dati: null, errore: null, percorso: "" });

const stato = {
  slug: SLUG,
  manifest: null,
  fasi: {},
  attivita: {},
  caricamento: true,
  erroreGara: null,
  output: [],
  outputCaricato: false,
  documenti: vuoto(),
  runLog: vuoto(),
  registri: {
    criteri: vuoto(), analisi: vuoto(), gap: vuoto(),
    proposte: vuoto(), audit: vuoto(), deliverable: vuoto(), grafo: vuoto(),
  },
  contenutoDeliverable: vuoto(),
  dettaglioProposta: vuoto(),
  proposteOperatore: vuoto(),
  formProposta: { criterio: "", gap_id: "", titolo: "", descrizione: "", invio: false },
  interventi: { messaggi: [], invio: false, bozza: "", errore: null },
  vista: { tipo: "fase", n: 1, sub: null },
  gapAperto: null,
  espansi: { requisiti: false, proposte: false },
  decisioni: {},
  storicoDecisioni: [],
  filtroAttivita: "tutte",
  sse: "connessione",
  ultimoEvento: null,
  sistema: { auth: null, pipeline: null, prezzari: null },
  assistente: { aperto: false, messaggi: [], pensa: false, bozza: "", errore: null },
  upload: { inCorso: [], rifiutati: [] },
};

// ===========================================================================
// Router — hash come sorgente di verità della vista
// ===========================================================================

/** #/fase/5 · #/fase/5/proposta/P-07 · #/fase/6/deliverable/D-01
    #/grafo/gap · #/attivita · #/impostazioni */
function leggiHash() {
  const parti = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parti.length) return null;
  if (parti[0] === "fase") {
    const n = Number(parti[1]);
    if (!(n >= 1 && n <= 7)) return null;
    const sub = (parti[2] === "proposta" || parti[2] === "deliverable") ? decodeURIComponent(parti[3] || "") : null;
    return { tipo: "fase", n, sub: sub || null };
  }
  if (parti[0] === "grafo") return { tipo: "grafo", filtro: parti[1] || "tutti", fase: parti[2] || null };
  if (parti[0] === "attivita") return { tipo: "attivita" };
  if (parti[0] === "impostazioni") return { tipo: "impostazioni" };
  return null;
}

function scriviHash(v) {
  if (v.tipo === "fase") {
    const coda = v.sub ? `/${v.n === 6 ? "deliverable" : "proposta"}/${encodeURIComponent(v.sub)}` : "";
    return `#/fase/${v.n}${coda}`;
  }
  if (v.tipo === "grafo") return `#/grafo/${v.filtro || "tutti"}${v.fase ? "/" + v.fase : ""}`;
  return `#/${v.tipo}`;
}

/** Cambia vista. Il guscio resta: si ridisegna solo l'area centrale. */
function vai(v, sostituisci = false) {
  const nuovo = scriviHash(v);
  if (location.hash === nuovo) { applicaVista(v); return; }
  if (sostituisci) history.replaceState(null, "", nuovo);
  else location.hash = nuovo;
  applicaVista(v);
}

function applicaVista(v) {
  stato.vista = v;
  stato.contenutoDeliverable = vuoto();
  stato.dettaglioProposta = vuoto();
  assicuraDati(v);
  disegnaVista();
  // Entrare in una sottovista significa cambiare argomento: la lettura
  // riparte dall'alto, non da dove si era rimasti nell'elenco.
  if (v.sub) document.getElementById("vista").scrollIntoView({ block: "start", behavior: "smooth" });
}

window.addEventListener("hashchange", () => {
  const v = leggiHash();
  if (v) applicaVista(v);
});

// ===========================================================================
// Caricamento dati
// ===========================================================================

/** Legge un elaborato di output. Un 404 non è un errore: significa che la
    fase non l'ha ancora prodotto, ed è uno stato previsto dal design.
    L'elenco degli output è già noto: se il file non c'è non lo si chiede,
    così una gara appena creata non genera una raffica di 404. */
async function leggiRegistro(percorso, parser) {
  if (stato.outputCaricato && !stato.output.includes(percorso)) {
    return { stato: "vuoto", dati: [], errore: null, percorso };
  }
  try {
    const testo = await Api.testoOutput(SLUG, percorso);
    const dati = parser(testo);
    const vuotoDavvero = Array.isArray(dati) ? dati.length === 0 : !dati;
    return vuotoDavvero
      ? { stato: "vuoto", dati: Array.isArray(dati) ? [] : null, errore: null, percorso }
      : { stato: "ok", dati, errore: null, percorso, grezzo: testo };
  } catch (e) {
    if (e.stato === 404) return { stato: "vuoto", dati: [], errore: null, percorso };
    return { stato: "errore", dati: null, errore: e, percorso };
  }
}

/** Prova più percorsi: gli agenti non scrivono sempre lo stesso file. */
async function leggiPrimoDisponibile(percorsi, parser) {
  let ultimo = null;
  for (const p of percorsi) {
    const r = await leggiRegistro(p, parser);
    if (r.stato === "ok") return r;
    ultimo = ultimo && ultimo.stato === "errore" ? ultimo : r;
  }
  return ultimo || { stato: "vuoto", dati: [], errore: null, percorso: percorsi[0] };
}

const inCorso = new Set();

/** Carica solo ciò che la vista corrente mostra davvero. */
function assicuraDati(v) {
  const serve = [];
  if (v.tipo === "fase") {
    if (v.n === 1) serve.push("documenti");
    if (v.n === 2) serve.push("criteri");
    if (v.n === 3) serve.push("analisi");
    if (v.n === 4) serve.push("gap", "proposteOperatore");
    if (v.n === 5) serve.push("proposte", "gap", "grafo");
    if (v.n === 6) serve.push("deliverable");
    if (v.n === 7) serve.push("audit", "deliverable");
  } else if (v.tipo === "grafo") {
    serve.push("grafo", "gap", "deliverable");
  } else if (v.tipo === "attivita") {
    serve.push("runLog", "interventi");
  } else if (v.tipo === "impostazioni") {
    serve.push("sistema");
  }
  serve.forEach(carica);
  if (v.tipo === "fase" && v.n === 6 && v.sub) caricaContenutoDeliverable(v.sub);
  if (v.tipo === "fase" && v.n === 5 && v.sub) caricaDettaglioProposta(v.sub);
}

function carica(chiave, forza = false) {
  if (inCorso.has(chiave)) return;
  const corrente = chiave === "documenti" ? stato.documenti
    : chiave === "runLog" ? stato.runLog
    : chiave === "proposteOperatore" ? stato.proposteOperatore
    : chiave === "sistema" || chiave === "interventi" ? null
    : stato.registri[chiave];
  if (!forza && corrente && corrente.stato !== "caricamento") return;

  inCorso.add(chiave);
  const fine = (res) => {
    inCorso.delete(chiave);
    if (chiave === "documenti") stato.documenti = res;
    else if (chiave === "runLog") stato.runLog = res;
    else if (chiave === "proposteOperatore") stato.proposteOperatore = res;
    else stato.registri[chiave] = res;
    disegnaVista();
  };

  switch (chiave) {
    case "documenti":
      Api.elencoDocumenti(SLUG)
        .then((d) => fine(d.length
          ? { stato: "ok", dati: d, errore: null, percorso: "/documenti" }
          : { stato: "vuoto", dati: [], errore: null, percorso: "/documenti" }))
        .catch((e) => fine({ stato: "errore", dati: null, errore: e, percorso: `/gare/${SLUG}/documenti` }));
      break;

    case "runLog":
      Api.runLog(SLUG)
        .then((l) => {
          const runs = normalizzaRuns(l.runs || []);
          fine(runs.length
            ? { stato: "ok", dati: runs, errore: null, percorso: "/run-log", grezzo: l }
            : { stato: "vuoto", dati: [], errore: null, percorso: "/run-log", grezzo: l });
        })
        .catch((e) => fine({ stato: "errore", dati: null, errore: e, percorso: `/gare/${SLUG}/run-log` }));
      break;

    case "criteri":
      leggiPrimoDisponibile(
        ["03_criteria/criteria_matrix.md", "03_criteria/criteria_checklist.md"],
        parseCriteri).then(fine);
      break;

    case "analisi":
      leggiPrimoDisponibile(
        ["03_criteria/gara_brief.md", "03_criteria/strategy_audit.md"],
        parseAnalisi).then(fine);
      break;

    case "gap":
      leggiRegistro("06_registers/gap_register.md", parseGap).then((res) => {
        // Il primo gap grave si apre da solo: le prove sono il motivo per
        // cui questa vista esiste, e un elenco tutto chiuso le nasconde.
        if (stato.gapAperto === null && res.stato === "ok" && res.dati.length) {
          const grave = res.dati.find((g) => g.severita === "alta") || res.dati[0];
          stato.gapAperto = grave.id;
        }
        fine(res);
      });
      break;

    case "proposte":
      leggiRegistro("06_registers/proposal_register.md", parseProposte).then(fine);
      break;

    case "audit":
      leggiRegistro("06_registers/audit_summary.md", parseAudit).then(fine);
      break;

    case "deliverable":
      Api.elencoDeliverables(SLUG)
        .then((d) => fine(d.length
          ? { stato: "ok", dati: d, errore: null, percorso: "/deliverables" }
          : { stato: "vuoto", dati: [], errore: null, percorso: "/deliverables" }))
        .catch((e) => fine(risorsaDaErrore(e, `/gare/${SLUG}/deliverables`)));
      break;

    case "grafo":
      Api.grafo(SLUG)
        .then((g) => fine((g.nodi || []).length
          ? { stato: "ok", dati: g, errore: null, percorso: "/grafo" }
          : { stato: "vuoto", dati: g, errore: null, percorso: "/grafo" }))
        .catch((e) => fine(risorsaDaErrore(e, `/gare/${SLUG}/grafo`)));
      break;

    case "proposteOperatore":
      Api.elencoProposteOperatore(SLUG)
        .then((l) => fine(l.length
          ? { stato: "ok", dati: l, errore: null, percorso: "/proposte-operatore" }
          : { stato: "vuoto", dati: [], errore: null, percorso: "/proposte-operatore" }))
        .catch((e) => fine(risorsaDaErrore(e, `/gare/${SLUG}/proposte-operatore`)));
      break;

    case "interventi":
      inCorso.delete("interventi");
      Api.cronologiaInterventi(SLUG)
        .then((righe) => {
          stato.interventi.messaggi = righe.map((r) => ({
            mio: r.ruolo === "utente", testo: r.testo, quando: r.creato_il,
          }));
          disegnaVista();
        })
        .catch(() => { /* nessuno storico: il pannello resta vuoto, non in errore */ });
      break;

    case "sistema":
      inCorso.delete("sistema");
      caricaSistema();
      break;
  }
}

/** Un 404 su una risorsa Sprint 10 vuol dire "la pipeline non l'ha ancora
    prodotta" (o, su un backend più vecchio, che l'endpoint non esiste):
    in entrambi i casi la vista mostra lo stato vuoto, non un errore. */
function risorsaDaErrore(e, percorso) {
  if (e.stato === 404) return { stato: "vuoto", dati: [], errore: null, percorso };
  return { stato: "errore", dati: null, errore: e, percorso };
}

function caricaSistema() {
  const set1 = (k, v) => { stato.sistema[k] = v; disegnaVista(); };
  Api.sistemaAuth().then((v) => set1("auth", v)).catch(() => set1("auth", { disponibile: false, motivo: "endpoint non raggiungibile" }));
  Api.sistemaPipeline().then((v) => set1("pipeline", v)).catch(() => set1("pipeline", { versione: "non disponibile", git_ref: "n.d." }));
  Api.sistemaPrezzari().then((v) => set1("prezzari", Array.isArray(v) ? v : [])).catch(() => set1("prezzari", []));
}

async function caricaContenutoDeliverable(id) {
  const res = stato.registri.deliverable;
  if (res.stato !== "ok") return;
  const d = res.dati.find((x) => x.id === id);
  if (!d) return;

  const cartella = d.tipo === "relazione_tecnica" ? "10_offer/" : `10_offer/${d.id}/`;
  const file = (stato.output || []).filter((p) =>
    p.startsWith(cartella) && !p.slice(cartella.length).includes("/") && p.endsWith(".md"));

  if (!file.length) {
    stato.contenutoDeliverable = { stato: "vuoto", dati: null, sezioni: [], errore: null, percorso: cartella };
    disegnaVista();
    return;
  }
  try {
    const testo = await Api.testoOutput(SLUG, file[0]);
    const paragrafi = [];
    const sezioni = [];
    for (const sez of Md.sezioni(testo)) {
      paragrafi.push({ titolo: sez.titolo });
      for (const p of Md.paragrafi(sez.corpo, 3)) paragrafi.push({ testo: p });
      sezioni.push({ titolo: sez.titolo, parole: sez.corpo.split(/\s+/).filter(Boolean).length });
    }
    if (!paragrafi.length) {
      for (const p of Md.paragrafi(testo, 6)) paragrafi.push({ testo: p });
    }
    stato.contenutoDeliverable = paragrafi.length
      ? { stato: "ok", dati: paragrafi, sezioni, errore: null, percorso: file[0] }
      : { stato: "vuoto", dati: null, sezioni: [], errore: null, percorso: file[0] };
  } catch (e) {
    stato.contenutoDeliverable = risorsaDaErrore(e, file[0]);
  }
  disegnaVista();
}

// ===========================================================================
// Parser dei registri
// ===========================================================================

function parseCriteri(testo) {
  const t = Md.tabellaCon(testo, [["id", "codice", "criterio"]]);
  if (!t) return [];
  const righe = Md.righeMappate(t, {
    id: ["id", "codice", "criterio", "crit", "rif"],
    testo: ["descrizione", "requisito", "oggetto", "titolo", "contenuto", "criterio"],
    fonte: ["fonte", "riferimento", "documento", "provenienza", "origine", "sezione"],
    tipo: ["tipo", "natura", "categoria"],
    copertura: ["copertura", "stato", "evidenza", "coperto"],
    punti: ["punti", "punteggio", "peso"],
  });
  return righe.map((r) => ({
    id: r.id,
    testo: r.testo && r.testo !== r.id ? r.testo : (r._celle[1] || ""),
    fonte: r.fonte,
    tipo: /premi|migliorat/i.test(r.tipo) ? "premiante" : /vincol|obblig/i.test(r.tipo) ? "vincolante" : (r.tipo || ""),
    copertura: coperturaDa(r.copertura),
    punti: r.punti,
  })).filter((r) => r.id || r.testo);
}

function coperturaDa(s) {
  const n = String(s || "").toLowerCase();
  if (/critic|conflitt|contrar/.test(n)) return "criticita";
  if (/scopert|assent|mancant|no\b|nessun/.test(n)) return "scoperto";
  if (/copert|ok|s[iì]\b|present|verificat/.test(n)) return "coperto";
  return "";
}

function parseAnalisi(testo) {
  const sezioni = Md.sezioni(testo)
    .filter((s2) => s2.livello >= 2 && s2.corpo.trim())
    .map((s2) => {
      const sev = Md.severita(s2.titolo) || Md.severita(s2.corpo);
      const par = Md.paragrafi(s2.corpo, 1);
      return {
        ref: (/^((?:art\.?|sez\.?|cap\.?|§)\s*[\w.]+)/i.exec(s2.titolo) || [])[1] || "",
        titolo: s2.titolo,
        severita: sev,
        badge: sev === "alta" ? "Criticità alta" : sev === "media" ? "Da presidiare" : sev === "bassa" ? "Conforme" : null,
        nota: par[0] || "",
        citazione: Md.citazione(s2.corpo),
      };
    })
    .filter((s2) => s2.nota || s2.citazione);

  const sintesi = Md.paragrafi(testo, 2);
  if (!sintesi.length && !sezioni.length) return null;

  const conteggi = { alta: 0, media: 0, bassa: 0 };
  for (const s2 of sezioni) if (s2.severita) conteggi[s2.severita]++;
  return { sintesi, sezioni, conteggi };
}

function parseGap(testo) {
  const t = Md.tabellaCon(testo, [["id", "gap", "codice"]]);
  if (!t) return [];
  const righe = Md.righeMappate(t, {
    id: ["id", "gap", "codice"],
    requisito: ["criterio", "requisito", "crit", "riferimento", "rif"],
    titolo: ["titolo", "descrizione", "oggetto", "gap"],
    severita: ["severita", "gravita", "priorita", "impatto", "rischio"],
    sintesi: ["sintesi", "note", "dettaglio", "motivazione", "analisi"],
    proposta: ["proposta", "soluzione", "copertura"],
    prova: ["prova", "prove", "evidenza", "evidenze", "fonte", "riscontro"],
  });
  return righe.map((r) => ({
    id: r.id,
    requisito: r.requisito && r.requisito !== r.id ? r.requisito : "",
    titolo: r.titolo && r.titolo !== r.id ? r.titolo : (r._celle[1] || ""),
    severita: Md.severita(r.severita),
    sintesi: r.sintesi,
    proposta: /^P[-.]?\w+/i.test(r.proposta) ? r.proposta : "",
    nota: "",
    prove: r.prova
      ? [{ fonte: "", testo: r.prova, contraria: /contrari|conflitt|supera|viola/i.test(r.prova) }]
      : [],
  })).filter((g) => g.id || g.titolo);
}

function parseProposte(testo) {
  const t = Md.tabellaCon(testo, [["id", "proposta", "codice"]]);
  if (!t) return [];
  const righe = Md.righeMappate(t, {
    id: ["id", "proposta", "codice"],
    titolo: ["titolo", "descrizione", "oggetto"],
    criterio: ["criterio", "sottocriterio", "crit"],
    riferimento: ["gap", "origine", "riferimento", "rif"],
    stato: ["stato", "decisione", "esito"],
    sintesi: ["sintesi", "note", "contenuto", "motivazione"],
    severita: ["severita", "priorita", "impatto", "rischio"],
    punteggio: ["punti", "punteggio", "peso"],
    agente: ["agente", "autore"],
  });
  return righe.map((r) => ({
    id: r.id,
    titolo: r.titolo && r.titolo !== r.id ? r.titolo : (r._celle[1] || ""),
    criterio: r.criterio,
    riferimento: r.riferimento || r.criterio,
    decisione: Md.decisione(r.stato),
    sintesi: r.sintesi,
    severita: Md.severita(r.severita),
    punteggio: r.punteggio,
    agente: r.agente,
    contenuto: null,
  })).filter((p) => p.id || p.titolo);
}

function parseAudit(testo) {
  const t = Md.tabellaCon(testo, [["voce", "controllo", "verifica", "requisito", "check"]]);
  if (t) {
    const righe = Md.righeMappate(t, {
      voce: ["voce", "controllo", "verifica", "requisito", "check", "oggetto"],
      esito: ["esito", "stato", "risultato", "conforme"],
      dettaglio: ["dettaglio", "note", "nota", "motivazione", "osservazioni"],
    });
    return righe.map((r) => ({
      voce: r.voce,
      dettaglio: r.dettaglio,
      esito: r.esito || "da verificare",
      tono: tonoAudit(r.esito),
    })).filter((v) => v.voce);
  }
  // Nessuna tabella: le sezioni del documento diventano voci di checklist.
  return Md.sezioni(testo)
    .filter((s2) => s2.livello >= 2 && s2.corpo.trim())
    .map((s2) => ({
      voce: s2.titolo,
      dettaglio: Md.paragrafi(s2.corpo, 1)[0] || "",
      esito: Md.severita(s2.corpo) === "alta" ? "bloccante" : "da verificare",
      tono: Md.severita(s2.corpo) === "alta" ? "crit" : "neu",
    }));
}

function tonoAudit(s2) {
  const n = String(s2 || "").toLowerCase();
  if (/conform|ok|s[iì]\b|superat|present/.test(n)) return "ok";
  if (/blocc|non conform|kop|fallit|assent|mancant/.test(n)) return "crit";
  if (/incomplet|parziale|attesa|warn/.test(n)) return "warn";
  if (/fuori|escluso|manuale/.test(n)) return "info";
  return "neu";
}

/** Nodo della proposta nel grafo: contenuto integrale e prove. Esiste solo
    dopo l'elaborazione del feedback — un 404 qui è normale. */
/** Gli id dei nodi proposta hanno la forma P-C{criterio}-{num} (vedi
    PROPOSTA_ID_RE nel backend). Un id del solo registro non è un nodo:
    chiederlo sarebbe un 400 annunciato. */
const ID_NODO_PROPOSTA = /^P-C\d+-\d+$/;

async function caricaDettaglioProposta(id) {
  if (!ID_NODO_PROPOSTA.test(id)) {
    stato.dettaglioProposta = { stato: "vuoto", dati: null, errore: null, percorso: `/proposte/${id}` };
    disegnaVista();
    return;
  }
  stato.dettaglioProposta = vuoto();
  disegnaVista();
  try {
    const d = await Api.dettaglioProposta(SLUG, id);
    stato.dettaglioProposta = { stato: "ok", dati: d, errore: null, percorso: `/proposte/${id}` };
  } catch (e) {
    stato.dettaglioProposta = risorsaDaErrore(e, `/gare/${SLUG}/proposte/${id}`);
  }
  disegnaVista();
}

/** Non più usata: i deliverable arrivano da GET /deliverables. Resta il
    percorso dei file, che serve al workspace. */
function costruisciDeliverableNonUsato() {
  const CARTELLE = ["10_offer/", "05_criteria_outputs/"];
  const TABELLARI = new Set(["xlsx", "xls", "csv"]);
  const file = (stato.output || [])
    .filter((p) => CARTELLE.some((c) => p.startsWith(c)) && !p.startsWith("11_view/"))
    .filter((p) => !/\/$/.test(p));

  if (!file.length) return { stato: "vuoto", dati: [], errore: null, percorso: "/output" };

  const dati = file.map((p, i) => {
    const nomeFile = p.split("/").pop();
    const ext = (nomeFile.split(".").pop() || "").toLowerCase();
    const tabellare = TABELLARI.has(ext);
    return {
      codice: `D-${String(i + 1).padStart(2, "0")}`,
      nome: nomeFile.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      cartella: p.split("/").slice(0, -1).join("/") || "output",
      percorso: p,
      ext: `.${ext}`,
      formato: tabellare ? "tabellare" : "testuale",
      tabellare,
      prodotto: true,
    };
  });
  return { stato: "ok", dati, errore: null, percorso: "/output" };
}

function normalizzaRuns(runs) {
  return runs.slice().reverse().map((r) => {
    const inizio = Date.parse(r.avviato_il);
    const fine = Date.parse(r.concluso_il);
    return {
      fase: r.fase,
      avviato_il: r.avviato_il,
      modello: r.modello,
      effort: r.effort,
      esito: r.esito || "sconosciuto",
      errore: r.errore,
      umana: !r.modello,
      durata: Number.isFinite(inizio) && Number.isFinite(fine) ? UI.durata((fine - inizio) / 1000) : "—",
    };
  });
}

// ===========================================================================
// Disegno del guscio
// ===========================================================================

document.getElementById("brand-mark").appendChild(I.stella(13));
document.getElementById("slot-tema").appendChild(UI.Tema.controllo());

const VISTE_TRASVERSALI = [
  { chiave: "grafo", etichetta: "Grafo", icona: () => I.grafo(11) },
  { chiave: "attivita", etichetta: "Attività", icona: () => null },
  { chiave: "impostazioni", etichetta: "Impostazioni", icona: () => null },
];

function disegnaTrasversali() {
  const attiva = stato.vista.tipo;
  const errori = stato.runLog.stato === "ok"
    ? stato.runLog.dati.filter((r) => r.esito !== "completato" && r.esito !== "in_corso").length
    : 0;
  set(document.getElementById("viste-trasversali"), VISTE_TRASVERSALI.map((t) =>
    h("button", {
      type: "button", class: "seg__btn",
      "aria-pressed": String(attiva === t.chiave),
      onClick: () => vai({ tipo: t.chiave, filtro: "tutti" }),
    },
      t.icona(),
      t.etichetta,
      t.chiave === "attivita" && errori
        ? h("span", { class: "seg__count" }, `${errori} err`)
        : null)));
}

function disegnaCrumb() {
  document.getElementById("crumb-slug").textContent = SLUG;
  const v = stato.vista;
  let testo;
  if (v.tipo === "fase") {
    const f = Dominio.fase(v.n);
    testo = `Fase ${v.n} · ${f.titolo}`;
    if (v.sub) testo += ` · ${v.sub}`;
  } else {
    testo = { grafo: "Grafo", attivita: "Attività", impostazioni: "Impostazioni" }[v.tipo];
  }
  document.getElementById("crumb-vista").textContent = testo;
  document.title = `${stato.manifest?.nome || SLUG} — ${testo} · SPADA Online`;
}

function disegnaTestata() {
  const el = document.getElementById("testata-gara");
  if (stato.erroreGara) { el.hidden = true; return; }
  el.hidden = false;

  if (stato.caricamento) {
    set(el,
      h("div", { class: "stack stack--3" },
        h("div", { class: "sk sk--pill" }),
        h("div", { class: "sk", style: { width: "70%", height: "24px" } }),
        h("div", { class: "sk", style: { width: "90%" } })));
    return;
  }

  const m = stato.manifest || {};
  const st = Dominio.statoGara(stato.fasi);
  const meta = Dominio.STATO_GARA[st];
  const faseN = Dominio.faseCorrente(stato.fasi);

  set(el,
    h("div", { class: "sheen", "aria-hidden": "true" }),
    h("div", { class: "tenderhead__grid" },
      h("div", { class: "tenderhead__main" },
        h("div", { class: "tenderhead__meta" },
          h("span", { class: `badge badge--lg badge--${meta.tono}` },
            I.scintilla(11), `${meta.etichetta} · Fase ${faseN}`),
          h("span", { class: "chip chip--mono" }, SLUG),
          h("span", { class: "chip" }, `${m.prezzario?.regione || "—"} · prezzario ${m.prezzario?.anno || "—"}`),
          h("span", { class: "chip chip--mono" }, `${m.esecuzione?.modello || "—"} · ${m.esecuzione?.effort || "—"}`),
          m.gara?.scadenza_offerta ? h("span", { class: "chip" }, UI.scadenza(m.gara.scadenza_offerta)) : null),
        h("h1", null, m.nome || SLUG),
        h("p", { class: "tenderhead__summary" },
          h("span", { class: "kicker" }, "Sintesi · "),
          sintesiGara())),
      h("div", { class: "tenderhead__aside" },
        h("div", { class: "tenderhead__actions" },
          h("button", {
            type: "button", class: "btn",
            onClick: () => vai({ tipo: "attivita" }),
          }, I.codice(13), "Claude Code"),
          h("button", {
            type: "button", class: "btn",
            onClick: () => vai({ tipo: "attivita" }),
          }, "Attività")),
        h("span", { class: "faint", style: { fontSize: "var(--fs-micro)" } },
          stato.ultimoEvento ? `ultimo evento ${UI.quandoRelativo(stato.ultimoEvento)}` : "nessun evento ricevuto"))));
}

/** La sintesi in testata riassume la fase corrente, non l'intera gara: è
    ciò che la pipeline ha effettivamente scritto in fasi.json. */
function sintesiGara() {
  const n = Dominio.faseCorrente(stato.fasi);
  const corpo = Dominio.corpoFase(stato.fasi, n) || {};
  if (corpo.sintesi) return corpo.sintesi;
  const completate = [1, 2, 3, 4, 5, 6, 7].filter((i) => Dominio.statoFase(stato.fasi, i) === "completata").length;
  return `${completate} fasi su 7 completate. La pipeline non ha ancora scritto una sintesi per la fase corrente.`;
}

function disegnaStepper() {
  const ol = document.getElementById("stepper");
  set(ol, Dominio.FASI.map((f) => {
    const st = Dominio.statoFase(stato.fasi, f.n);
    const meta = Dominio.STATO[st];
    const corrente = stato.vista.tipo === "fase" && stato.vista.n === f.n;
    const icona = st === "completata" ? "✓ " : st === "da_rivedere" ? "◆ " : st === "errore" ? "✕ " : "";
    return h("li", null,
      h("button", {
        type: "button", class: "step", dataset: { st },
        "aria-current": corrente ? "step" : null,
        onClick: () => vai({ tipo: "fase", n: f.n }),
      },
        h("span", { class: "step__bar", "aria-hidden": "true" }),
        h("span", { class: "step__num" }, icona, f.num),
        h("span", { class: "step__title" }, f.titolo),
        h("span", { class: "step__st" }, meta.breve)));
  }));
}

const TITOLI_TRASVERSALI = {
  grafo: ["Vista trasversale", "Grafo della gara",
    "Documenti, requisiti, gap, proposte e deliverable con i legami che li tengono insieme. Consultabile in qualunque momento, indipendente dalla fase corrente."],
  attivita: ["Vista trasversale", "Attività della gara",
    "Storico delle esecuzioni, log grezzo e canale operativo — l'unico punto dell'app che scrive sulla gara, messo accanto al registro di ciò che ha scritto. Sede unica per tutte le fasi."],
  impostazioni: ["Vista trasversale", "Impostazioni",
    "Due ambiti separati: i parametri di questa gara e le impostazioni di sistema che valgono per l'intera installazione."],
};

function disegnaTestataVista() {
  const el = document.getElementById("testata-vista");
  const v = stato.vista;
  let kicker, titolo, sottotitolo, chiaveStato = "trasversale";
  let indietro = null;

  if (v.tipo === "fase") {
    const f = Dominio.fase(v.n);
    kicker = f.kicker; titolo = f.testata; sottotitolo = f.sottotitolo;
    chiaveStato = Dominio.statoFase(stato.fasi, v.n);

    if (v.n === 5 && v.sub) {
      const p = (stato.registri.proposte.dati || []).find((x) => x.id === v.sub);
      kicker = `Fase 5 · dettaglio proposta ${v.sub}`;
      titolo = p ? (p.titolo || v.sub) : v.sub;
      sottotitolo = "Contenuto integrale, gap di origine con le prove collegate e storico delle decisioni: tutto ciò che serve per decidere senza aprire gli elaborati.";
      indietro = { etichetta: "Tutte le proposte", vai: { tipo: "fase", n: 5 } };
    }
    if (v.n === 6 && v.sub) {
      const d = (stato.registri.deliverable.dati || []).find((x) => x.codice === v.sub);
      kicker = `Fase 6 · workspace ${v.sub}`;
      titolo = d ? d.nome : v.sub;
      sottotitolo = d ? `${d.cartella} · formato ${d.formato} (${d.ext})` : "Deliverable non trovato fra quelli prodotti.";
      indietro = { etichetta: "Tutti i deliverable", vai: { tipo: "fase", n: 6 } };
      // In una sottovista il badge deve parlare dell'oggetto aperto, non
      // della fase: un deliverable già prodotto non è «non ancora eseguito».
      if (d) chiaveStato = d.prodotto ? "completata" : "in_coda";
    }
  } else {
    [kicker, titolo, sottotitolo] = TITOLI_TRASVERSALI[v.tipo];
  }

  const meta = Dominio.STATO[chiaveStato] || Dominio.STATO.trasversale;

  set(el,
    h("div", { style: { minWidth: 0 } },
      h("div", { class: "viewhead__top" },
        indietro
          ? h("button", { type: "button", class: "back", onClick: () => vai(indietro.vai) },
              I.indietro(10), indietro.etichetta)
          : null,
        h("span", { class: "kicker" }, kicker)),
      h("h2", null, titolo),
      h("p", null, sottotitolo)),
    h("span", { class: `badge badge--lg badge--${meta.tono}` }, meta.etichetta));
}

function disegnaVista() {
  disegnaCrumb();
  disegnaTrasversali();
  const vp = document.getElementById("viewport");
  const testataVista = document.getElementById("testata-vista");
  const v = stato.vista;

  // Gara non caricata: stepper e testata direbbero «fase 1, in coda» per
  // ogni fase, cioè un dato inventato. Restano solo barra ed errore.
  if (stato.erroreGara) {
    testataVista.hidden = true;
    document.querySelector(".stepper").hidden = true;
    set(vp, vistaErroreGara(stato.erroreGara));
    disegnaAssistente();
    return;
  }
  testataVista.hidden = false;
  // Anche in caricamento lo stepper direbbe sette fasi «in coda»: compare
  // quando gli stati sono noti.
  document.querySelector(".stepper").hidden = stato.caricamento;
  testataVista.hidden = stato.caricamento;
  if (!stato.caricamento) disegnaTestataVista();

  if (stato.caricamento) {
    set(vp, h("div", { class: "card", "aria-busy": "true" },
      h("div", { class: "stack stack--3" },
        h("div", { class: "sk", style: { width: "60%" } }),
        h("div", { class: "sk", style: { width: "85%" } }),
        h("div", { class: "sk", style: { width: "45%" } }))));
    return;
  }

  let nodo;
  if (v.tipo === "fase") {
    if (v.n === 1) nodo = Viste.fase1(stato);
    else if (v.n === 2) nodo = Viste.fase2(stato);
    else if (v.n === 3) nodo = Viste.fase3(stato);
    else if (v.n === 4) nodo = Viste.fase4(stato);
    else if (v.n === 5) nodo = v.sub ? Viste.fase5Dettaglio(stato) : Viste.fase5Elenco(stato);
    else if (v.n === 6) nodo = v.sub ? Viste.fase6Workspace(stato) : Viste.fase6Elenco(stato);
    else nodo = Viste.fase7(stato);
  } else if (v.tipo === "grafo") nodo = Viste.grafo(stato);
  else if (v.tipo === "attivita") nodo = Viste.attivita(stato);
  else nodo = Viste.impostazioni(stato);

  set(vp, nodo);
  disegnaAssistente();
}

function vistaErroreGara(err) {
  return h("div", { class: "pageerror" },
    h("div", null,
      h("div", { class: "empty__icon empty__icon--crit" }, I.triangolo(20)),
      h("h3", null, "Non riesco a caricare questa gara"),
      h("p", null,
        "Il servizio ha risposto ",
        h("code", { class: "mono" }, err.stato ? String(err.stato) : "nessuna risposta"),
        " per ", h("code", { class: "mono" }, err.percorso || `/gare/${SLUG}`),
        ". I dati della gara non sono stati modificati: nessun job è stato avviato o interrotto."),
      h("div", { class: "empty__actions" },
        h("button", { type: "button", class: "btn btn--primary", onClick: ricarica }, "Riprova"),
        h("a", { class: "btn", href: "index.html" }, "Torna all'elenco gare"))));
}

function disegna() {
  disegnaTestata();
  disegnaStepper();
  disegnaVista();
}

// ===========================================================================
// Stream SSE — aperto una volta dal guscio, non dalle viste
// ===========================================================================

let sorgente = null;
let tentativi = 0;
let timerRiconnessione = null;

function apriStream() {
  if (sorgente) { sorgente.close(); sorgente = null; }
  clearTimeout(timerRiconnessione);
  stato.sse = "connessione";
  segnalaSse();

  sorgente = new EventSource(Api.streamUrl(SLUG));

  sorgente.onopen = () => {
    tentativi = 0;
    stato.sse = "connesso";
    segnalaSse();
  };

  sorgente.onmessage = (ev) => {
    let payload;
    try { payload = JSON.parse(ev.data); } catch { return; }
    stato.ultimoEvento = new Date().toISOString();
    stato.sse = "connesso";

    const prima = JSON.stringify(stato.fasi);
    stato.fasi = payload.fasi?.fasi || payload.fasi || stato.fasi;
    stato.attivita = payload.attivita || stato.attivita;
    segnalaSse();
    disegnaTestata();
    disegnaStepper();

    // Un cambio di stato delle fasi può aver prodotto nuovi elaborati: si
    // rilegge l'output e si invalidano i registri della vista corrente.
    if (JSON.stringify(stato.fasi) !== prima) {
      aggiornaOutput().then(() => {
        invalidaRegistri();
        assicuraDati(stato.vista);
        disegnaVista();
      });
    } else {
      disegnaVista();
    }
  };

  sorgente.onerror = () => {
    sorgente.close();
    sorgente = null;
    stato.sse = "perso";
    segnalaSse();
    disegnaVista();
    // Backoff: 2s, 4s, 8s… fino a 30s. Riprovare ogni secondo su un
    // backend caduto non lo fa tornare su prima.
    const attesa = Math.min(2000 * 2 ** tentativi, 30000);
    tentativi += 1;
    timerRiconnessione = setTimeout(apriStream, attesa);
  };
}

function riconnetti() { tentativi = 0; apriStream(); }

function segnalaSse() {
  const el = document.getElementById("stato-sse");
  const mappa = {
    connesso: ["badge badge--ok", "SSE connesso", true],
    connessione: ["badge", "SSE in connessione", false],
    perso: ["badge badge--warn", "SSE interrotto", false],
  };
  const [classe, testo, pulsa] = mappa[stato.sse] || mappa.connessione;
  el.className = classe;
  set(el, h("span", { class: pulsa ? "dot dot--slow" : "dot", "aria-hidden": "true" }), testo);
  el.title = stato.ultimoEvento ? `Ultimo evento ${UI.quandoRelativo(stato.ultimoEvento)}` : "";
}

function invalidaRegistri() {
  for (const k of Object.keys(stato.registri)) stato.registri[k] = vuoto();
  stato.documenti = vuoto();
  stato.runLog = vuoto();
  stato.proposteOperatore = vuoto();
}

async function aggiornaOutput() {
  try {
    stato.output = await Api.elencoOutput(SLUG);
    stato.outputCaricato = true;
  } catch {
    // L'elenco resta quello precedente: meglio stantio che vuoto. Se non è
    // mai arrivato, i registri tornano a chiedersi uno per uno.
    stato.outputCaricato = stato.output.length > 0;
  }
}

// ===========================================================================
// Assistente di gara — sola lettura, contesto l'intera gara
// ===========================================================================

const SUGGERIMENTI = [
  "Quali penali sono previste?",
  "Cosa pesa di più nel punteggio tecnico?",
  "Quali requisiti restano scoperti?",
];

/** Si attiva quando la Fase 2 ha costruito il grafo di conoscenza: prima
    non avrebbe su cosa rispondere. È lo stesso vincolo che applica il
    backend (409 se la fase 2 non è completata). */
const assistentePronto = () => Dominio.statoFase(stato.fasi, 2) === "completata";

function disegnaAssistente() {
  const pronto = assistentePronto();
  const a = stato.assistente;
  const fab = document.getElementById("fab-assistente");
  const pannello = document.getElementById("assistente");

  // Su una gara che non si è caricata l'assistente non ha contesto: sparisce
  // invece di restare come pulsante inerte sopra un messaggio d'errore.
  if (stato.erroreGara || stato.caricamento) {
    fab.hidden = true;
    pannello.hidden = true;
    return;
  }
  fab.hidden = false;

  fab.dataset.ready = String(pronto);
  fab.dataset.open = String(a.aperto && pronto);
  fab.disabled = !pronto;
  fab.setAttribute("aria-expanded", String(a.aperto && pronto));
  set(fab, pronto ? I.chat(15) : I.lucchetto(15),
    pronto ? (a.aperto ? "Chiudi assistente" : "Assistente di gara") : "Assistente · dalla Fase 2");

  if (!pronto || !a.aperto) { pannello.hidden = true; return; }
  pannello.hidden = false;

  const messaggi = a.messaggi.length
    ? a.messaggi.map((m) => h("div", { class: `chat__msg${m.mio ? " chat__msg--me" : ""}` },
        h("div", { class: "chat__who" }, m.mio ? "Tu" : "Assistente"),
        h("div", { class: "chat__text" }, m.testo),
        m.fonte ? h("div", { class: "chat__source" }, m.fonte) : null))
    : [h("p", { style: { margin: 0, fontSize: "var(--fs-xs)", color: "var(--ink-3)" } },
        "Nessuna domanda ancora. L'assistente legge documenti ed elaborati già prodotti da questa gara.")];

  set(pannello,
    h("div", { class: "assistant__head" },
      h("div", { class: "assistant__title" },
        h("h2", null, "Assistente di gara"),
        h("span", { class: "badge badge--sm badge--info" }, "sola lettura"),
        h("span", { class: "spacer" }),
        h("button", {
          type: "button", class: "icon-btn", "aria-label": "Chiudi assistente",
          onClick: () => { stato.assistente.aperto = false; disegnaAssistente(); document.getElementById("fab-assistente").focus(); },
        }, I.chiudi(11))),
      h("p", null, "Risponde solo su documenti ed elaborati di questa gara. Non modifica nulla: per intervenire si usano le azioni di fase e la vista ",
        h("button", { type: "button", class: "linkbtn", onClick: () => vai({ tipo: "attivita" }) }, "Attività"), ".")),

    h("div", { class: "assistant__scope" },
      "Contesto: ", h("strong", { style: { color: "var(--ink-2)" } }, "intera gara"), " · ", ambitoAssistente()),

    h("div", { class: "assistant__log chat", role: "log", "aria-live": "polite" },
      messaggi,
      a.pensa ? h("div", { class: "typing" }, h("span"), h("span"), h("span")) : null,
      a.errore
        ? h("div", { class: "note note--crit" }, I.avviso(14), h("p", null, a.errore))
        : null),

    h("div", { class: "suggestions" }, SUGGERIMENTI.map((q) =>
      h("button", { type: "button", class: "suggestion", onClick: () => chiediAssistente(q) }, q))),

    h("div", { class: "composer" },
      h("input", {
        type: "text", class: "input", id: "assistente-input", value: a.bozza,
        placeholder: "Chiedi qualcosa sulla gara…",
        "aria-label": "Domanda per l'assistente",
        onInput: (e) => { stato.assistente.bozza = e.target.value; },
        onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); chiediAssistente(); } },
      }),
      h("button", {
        type: "button", class: "composer__send", "aria-label": "Invia",
        onClick: () => chiediAssistente(),
      }, I.invia(14))));

  const log = pannello.querySelector(".assistant__log");
  if (log) log.scrollTop = log.scrollHeight;
}

function ambitoAssistente() {
  const pezzi = [];
  if (stato.documenti.stato === "ok") pezzi.push(UI.plurale(stato.documenti.dati.length, "documento", "documenti"));
  if (stato.registri.criteri.stato === "ok") pezzi.push(UI.plurale(stato.registri.criteri.dati.length, "requisito", "requisiti"));
  if (stato.registri.gap.stato === "ok") pezzi.push(UI.plurale(stato.registri.gap.dati.length, "gap", "gap"));
  if (stato.registri.proposte.stato === "ok") pezzi.push(UI.plurale(stato.registri.proposte.dati.length, "proposta", "proposte"));
  return pezzi.length ? pezzi.join(" · ") : "elaborati della gara";
}

async function chiediAssistente(testoForzato) {
  const q = (testoForzato || stato.assistente.bozza || "").trim();
  if (!q || stato.assistente.pensa) return;
  stato.assistente.messaggi.push({ mio: true, testo: q });
  stato.assistente.bozza = "";
  stato.assistente.pensa = true;
  stato.assistente.errore = null;
  disegnaAssistente();

  try {
    const r = await Api.chiediAssistente(SLUG, q);
    stato.assistente.messaggi.push({ mio: false, testo: r.risposta });
  } catch (e) {
    // 409 = vincolo di dominio (fase 2 incompleta, oppure job in corso):
    // è un'informazione, non un guasto, e va detta con le sue parole.
    stato.assistente.errore = e.stato === 409
      ? e.message
      : `Assistente non disponibile (${e.stato || "nessuna risposta"}). La gara non è stata modificata.`;
  }
  stato.assistente.pensa = false;
  disegnaAssistente();
  const input = document.getElementById("assistente-input");
  if (input) input.focus();
}

document.getElementById("fab-assistente").addEventListener("click", () => {
  if (!assistentePronto()) return;
  stato.assistente.aperto = !stato.assistente.aperto;
  disegnaAssistente();
  if (stato.assistente.aperto) {
    carica("criteri"); carica("documenti");
    const input = document.getElementById("assistente-input");
    if (input) input.focus();
  }
});

// La cronologia dell'assistente è persistita dal backend: si recupera al
// primo accesso, così una conversazione non sparisce con il ricaricamento.
Api.cronologiaAssistente(SLUG)
  .then((righe) => {
    stato.assistente.messaggi = righe.map((r) => ({ mio: r.ruolo === "utente", testo: r.testo }));
    disegnaAssistente();
  })
  .catch(() => { /* nessuna cronologia: si parte dal pannello vuoto */ });

// ===========================================================================
// Azioni
// ===========================================================================

async function eseguiFase(n) {
  try {
    await Api.esegui(SLUG, n);
    Toast.ok(`Fase ${n} accodata.`);
    await ricarica();
  } catch (e) { Toast.errore(`Avvio non riuscito: ${e.message}`); }
}

async function rieseguiFase(n) {
  const st = Dominio.statoFase(stato.fasi, n);
  if (st === "completata" &&
      !confirm(`Rieseguire la Fase ${n}? Le fasi successive già completate verranno marcate "da rivedere".`)) return;
  try {
    await Api.riesegui(SLUG, n);
    Toast.ok(`Riesecuzione della Fase ${n} accodata.`);
    await ricarica();
  } catch (e) { Toast.errore(`Riesecuzione non riuscita: ${e.message}`); }
}

async function approvaFase(n) {
  try {
    await Api.approva(SLUG, n);
    Toast.ok(`Checkpoint della Fase ${n} approvato.`);
    await ricarica();
  } catch (e) { Toast.errore(`Approvazione non riuscita: ${e.message}`); }
}

/** Decisione su una proposta: ottimistica in interfaccia, poi registrata.
    Se la registrazione fallisce si torna indietro — una spunta che resta
    dopo un errore è peggio di nessuna spunta. */
async function decidi(id, decisione, nota) {
  const precedente = stato.decisioni[id];
  stato.decisioni[id] = decisione;
  disegnaVista();
  try {
    await Api.registraApprovazione(SLUG, {
      fase: 5, tipo: "proposta", riferimento: id, decisione, nota: nota || null,
    });
    stato.storicoDecisioni.push({ riferimento: id, decisione, nota: nota || null, quando: new Date().toISOString() });
    Toast.ok(`${id}: decisione registrata.`);
    disegnaVista();
  } catch (e) {
    if (precedente) stato.decisioni[id] = precedente; else delete stato.decisioni[id];
    disegnaVista();
    Toast.errore(`Decisione non registrata: ${e.message}`);
  }
}

/** Avvio di uno o più deliverable. Ognuno è un job proprio: se uno fallisce
    gli altri restano accodati, e lo si dice invece di riassumere in "errore". */
async function avviaDeliverable(ids) {
  const falliti = [];
  for (const id of ids) {
    try { await Api.eseguiDeliverable(SLUG, id); }
    catch (e) { falliti.push(`${id}: ${e.message}`); }
  }
  const ok = ids.length - falliti.length;
  if (ok) Toast.ok(`${UI.plurale(ok, "deliverable accodato", "deliverable accodati")}.`);
  falliti.forEach((f) => Toast.errore(f));
  carica("deliverable", true);
  await ricarica();
}

async function rieseguiDeliverable(id) {
  if (!confirm(`Rieseguire il deliverable ${id}? Il contenuto già prodotto viene rigenerato.`)) return;
  try {
    await Api.rieseguiDeliverable(SLUG, id);
    Toast.ok(`Riesecuzione di ${id} accodata.`);
    carica("deliverable", true);
    await ricarica();
  } catch (e) { Toast.errore(`Riesecuzione non riuscita: ${e.message}`); }
}

/** Intervento diretto: scrive sulla gara. Il backend rifiuta con 409 se una
    fase è in esecuzione — due scritture concorrenti sarebbero un rischio
    reale, e l'interfaccia riporta il motivo invece di un errore generico. */
async function intervieni() {
  const q = (stato.interventi.bozza || "").trim();
  if (!q || stato.interventi.invio) return;
  stato.interventi.messaggi.push({ mio: true, testo: q, quando: new Date().toISOString() });
  stato.interventi.bozza = "";
  stato.interventi.invio = true;
  stato.interventi.errore = null;
  disegnaVista();

  try {
    const r = await Api.intervieni(SLUG, q);
    stato.interventi.messaggi.push({ mio: false, testo: r.risposta, quando: new Date().toISOString() });
    // Un intervento può aver toccato file e riaccodato job: si rilegge tutto.
    await ricarica();
  } catch (e) {
    stato.interventi.errore = e.stato === 409
      ? e.message
      : `Intervento non riuscito (${e.stato || "nessuna risposta"}). Controlla lo storico qui sopra prima di riprovare: potrebbe essere stato applicato in parte.`;
  }
  stato.interventi.invio = false;
  disegnaVista();
  const input = document.getElementById("intervento-input");
  if (input) input.focus();
}

async function creaPropostaOperatore() {
  const f = stato.formProposta;
  f.invio = true;
  disegnaVista();
  try {
    await Api.creaPropostaOperatore(SLUG, {
      criterio: f.criterio.trim(),
      gap_id: f.gap_id.trim() || null,
      titolo: f.titolo.trim(),
      descrizione: f.descrizione.trim(),
    });
    Toast.ok("Proposta inviata: verrà valutata alla prossima analisi del criterio.");
    stato.formProposta = { criterio: "", gap_id: "", titolo: "", descrizione: "", invio: false };
    carica("proposteOperatore", true);
  } catch (e) {
    f.invio = false;
    Toast.errore(`Proposta non inviata: ${e.message}`);
  }
  disegnaVista();
}

/** Il form si ridisegna solo nel bottone: riscriverlo a ogni tasto
    sposterebbe il cursore nel campo attivo. */
function aggiornaFormProposta() {
  const b = document.getElementById("btn-proposta-operatore");
  if (b) b.disabled = !(/^C[0-9]+$/.test(stato.formProposta.criterio.trim())
    && (!stato.formProposta.gap_id.trim() || /^G-C[0-9]+-[0-9]+$/.test(stato.formProposta.gap_id.trim()))
    && stato.formProposta.titolo.trim() && stato.formProposta.descrizione.trim());
}

const apriGap = (id) => { stato.gapAperto = id; disegnaVista(); };
const espandi = (chiave) => { stato.espansi[chiave] = !stato.espansi[chiave]; disegnaVista(); };
const filtraAttivita = (chiave) => { stato.filtroAttivita = chiave; disegnaVista(); };

/** Selettore file nativo per una categoria: la dropzone resta la via
    principale, questa è quella accessibile da tastiera. */
function scegliFile(categoria) {
  const input = h("input", {
    type: "file", multiple: true, style: { display: "none" },
    accept: Dominio.ESTENSIONI_AMMESSE.join(","),
    onChange: (e) => { caricaFile([...e.target.files], categoria); input.remove(); },
  });
  document.body.appendChild(input);
  input.click();
}

async function caricaFile(files, categoriaForzata) {
  if (!files.length) return;
  const buoni = [];
  for (const f of files) {
    const motivo = Dominio.motivoRifiuto(f);
    if (motivo) stato.upload.rifiutati.push({ nome: f.name, dimensione: f.size, motivo });
    else buoni.push(f);
  }
  stato.upload.inCorso.push(...buoni.map((f) => f.name));
  disegnaVista();

  let caricati = 0;
  let fasiDaValutare = [];
  for (const f of buoni) {
    const categoria = categoriaForzata || Dominio.categoriaProbabile(f.name);
    try {
      const r = await Api.caricaDocumento(SLUG, categoria, f);
      caricati += 1;
      if (r.fasi_completate_da_valutare?.length) fasiDaValutare = r.fasi_completate_da_valutare;
    } catch (e) {
      stato.upload.rifiutati.push({ nome: f.name, dimensione: f.size, motivo: e.message });
    } finally {
      stato.upload.inCorso = stato.upload.inCorso.filter((n) => n !== f.name);
      disegnaVista();
    }
  }

  if (caricati) {
    Toast.ok(UI.plurale(caricati, "documento caricato", "documenti caricati") + ".");
    carica("documenti", true);
    // Ingestione incrementale: un upload a gara avviata non rilancia nulla
    // da solo. Si chiede quale fase rieseguire, senza deciderlo al posto
    // dell'operatore e senza farlo in silenzio.
    if (fasiDaValutare.length) chiediRiesecuzione(fasiDaValutare);
  }
}

function chiediRiesecuzione(fasiCompletate) {
  const t = Toast.mostra("", "warn", 30000);
  set(t,
    I.avviso(13),
    h("div", null,
      h("strong", { style: { display: "block", marginBottom: "4px" } },
        "Rieseguire una fase già completata per tenere conto del nuovo documento?"),
      h("span", { style: { display: "block", color: "var(--ink-3)", marginBottom: "var(--s-2)" } },
        "Le fasi successive già completate verranno marcate «da rivedere», non cancellate."),
      h("div", { class: "row row--tight" },
        fasiCompletate.map((n) => h("button", {
          type: "button", class: "btn btn--xs",
          onClick: () => { t.remove(); rieseguiFase(n); },
        }, `Fase ${n}`)),
        h("button", { type: "button", class: "btn btn--xs btn--quiet", onClick: () => t.remove() }, "Non ora"))));
}

const scartaRifiuto = (nome) => {
  stato.upload.rifiutati = stato.upload.rifiutati.filter((r) => r.nome !== nome);
  disegnaVista();
};

// ===========================================================================
// Avvio
// ===========================================================================

async function ricarica() {
  try {
    const d = await Api.dettaglioGara(SLUG);
    stato.manifest = d.manifest || {};
    stato.fasi = d.fasi?.fasi || {};
    stato.attivita = d.attivita || {};
    stato.erroreGara = null;
    stato.caricamento = false;
    await aggiornaOutput();
    invalidaRegistri();
    assicuraDati(stato.vista);
    disegna();
    disegnaAssistente();
  } catch (e) {
    stato.caricamento = false;
    stato.erroreGara = e;
    disegna();
  }
}

// Espone al modulo delle viste solo ciò che serve: navigazione e azioni.
const Gara = {
  vai, ricarica, disegna, disegnaVista,
  eseguiFase, rieseguiFase, approvaFase, decidi,
  avviaDeliverable, rieseguiDeliverable,
  intervieni, creaPropostaOperatore, aggiornaFormProposta,
  apriGap, espandi, filtraAttivita,
  scegliFile, caricaFile, scartaRifiuto, riconnetti,
};

(async function avvio() {
  // La vista iniziale è quella nell'URL; senza indicazione si apre la fase
  // corrente della gara — se richiede una decisione, si atterra sul
  // checkpoint invece che su una panoramica da cui ripartire.
  await ricarica();
  const daUrl = leggiHash();
  applicaVista(daUrl || { tipo: "fase", n: Dominio.faseCorrente(stato.fasi), sub: null });
  if (!daUrl) history.replaceState(null, "", scriviHash(stato.vista));
  apriStream();
})();
