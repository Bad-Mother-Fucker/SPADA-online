// dominio.js — vocabolario condiviso fra elenco e pagina gara.
//
// Le 7 fasi hanno due nomi: quello della pipeline (chiave in _state/fasi.json,
// vedi _pipeline/scripts/setup/spada_fase.sh) e quello mostrato all'operatore,
// che è quello del design. La mappa sta qui, in un posto solo: le viste non
// devono mai conoscere le chiavi della pipeline.

const Dominio = (() => {
  const FASI = [
    {
      n: 1, num: "01", chiave: "1_acquisizione_documenti",
      titolo: "Acquisizione documenti",
      kicker: "Fase 1 · acquisizione",
      testata: "Documenti di gara",
      sottotitolo: "Categorie separate perché la pipeline le tratta in modo diverso: il disciplinare guida i requisiti, gli elaborati l'analisi tecnica, i P7M richiedono verifica di firma.",
    },
    {
      n: 2, num: "02", chiave: "2_costruzione_grafo",
      titolo: "Estrazione requisiti",
      kicker: "Fase 2 · requisiti",
      testata: "Requisiti estratti",
      sottotitolo: "Ogni requisito porta con sé la provenienza puntuale. Da qui in avanti l'assistente conversazionale è attivo.",
    },
    {
      n: 3, num: "03", chiave: "3_analisi_strategica",
      titolo: "Analisi capitolato",
      kicker: "Fase 3 · analisi",
      testata: "Analisi del capitolato speciale",
      sottotitolo: "Lettura critica del capitolato: cosa vincola l'offerta, cosa la premia, dove il testo è ambiguo o contraddittorio.",
    },
    {
      n: 4, num: "04", chiave: "4_elaborazione_criteri",
      titolo: "Ricerca soluzioni",
      kicker: "Fase 4 · gap e prove",
      testata: "Gap rilevati",
      sottotitolo: "Distanza fra ciò che la gara richiede e ciò che l'offerta dimostra oggi. Ogni gap è ancorato alle prove documentali raccolte.",
    },
    {
      n: 5, num: "05", chiave: "5_revisione_proposte",
      titolo: "Revisione proposte",
      kicker: "Fase 5 · checkpoint umano",
      testata: "Revisione delle proposte tecniche",
      sottotitolo: "Decisione proposta per proposta: approvate entrano nei deliverable, rimandate tornano agli agenti con la tua nota, scartate restano nello storico.",
    },
    {
      n: 6, num: "06", chiave: "6_stesura_offerta",
      titolo: "Deliverables",
      kicker: "Fase 6 · deliverables",
      testata: "Deliverable richiesti",
      sottotitolo: "Elenco ricavato dal disciplinare di questa gara, non un modello fisso. Ogni deliverable ha agente e skill propri e può girare in parallelo.",
    },
    {
      n: 7, num: "07", chiave: "7_approvazione_finale",
      titolo: "Audit e consegna",
      kicker: "Fase 7 · audit di consegna",
      testata: "Audit formale del plico",
      sottotitolo: "Verifica di completezza e consegnabilità — non una seconda verifica delle prove, già svolta in Fase 4 e 5.",
    },
  ];

  /** Le fasi che si fermano su una decisione umana (gate di checkpoint). */
  const GATE_UMANO = new Set([3, 5, 7]);

  /** tono = classe CSS; etichetta = come si legge nell'interfaccia. */
  const STATO = {
    completata:    { tono: "ok",     etichetta: "Completata",               breve: "completata" },
    da_rivedere:   { tono: "accent", etichetta: "Richiede la tua decisione", breve: "da rivedere" },
    in_esecuzione: { tono: "info",   etichetta: "In esecuzione",            breve: "in esecuzione" },
    errore:        { tono: "crit",   etichetta: "Errore",                   breve: "errore" },
    in_coda:       { tono: "neu",    etichetta: "Non ancora eseguita",      breve: "in coda" },
    trasversale:   { tono: "neu",    etichetta: "Sempre disponibile",       breve: "sempre disponibile" },
  };

  /** Stati della gara nell'elenco, con l'etichetta usata nei filtri. */
  const STATO_GARA = {
    da_rivedere:   { tono: "accent", etichetta: "Da rivedere" },
    in_esecuzione: { tono: "info",   etichetta: "In esecuzione" },
    completata:    { tono: "ok",     etichetta: "Completata" },
    errore:        { tono: "crit",   etichetta: "Errore" },
    in_coda:       { tono: "neu",    etichetta: "In coda" },
  };

  const fase = (n) => FASI.find((f) => f.n === n);

  /** La pipeline scrive "da_eseguire"; il design lo chiama "in coda". */
  function normalizzaStato(st) {
    if (!st) return "in_coda";
    if (st === "da_eseguire") return "in_coda";
    if (st === "completato") return "completata";
    return STATO[st] ? st : "in_coda";
  }

  /** Corpo della fase n dentro fasi.json, indipendente dal suffisso della chiave. */
  function corpoFase(fasi, n) {
    if (!fasi) return null;
    const attesa = fase(n);
    if (attesa && fasi[attesa.chiave]) return fasi[attesa.chiave];
    const k = Object.keys(fasi).find((x) => x.startsWith(`${n}_`));
    return k ? fasi[k] : null;
  }

  function statoFase(fasi, n) {
    const c = corpoFase(fasi, n);
    if (!c) return "in_coda";
    // Una fase che attende un'approvazione non è "completata": chiede una
    // decisione, e l'interfaccia deve dirlo con il colore dell'accento.
    if (c.richiede_approvazione) return "da_rivedere";
    return normalizzaStato(c.stato);
  }

  /** Prima fase non completata: è quella su cui si apre la pagina gara. */
  function faseCorrente(fasi) {
    for (let n = 1; n <= 7; n++) {
      if (statoFase(fasi, n) !== "completata") return n;
    }
    return 7;
  }

  /** Stato complessivo della gara: la cosa che l'operatore deve sapere per
      prima. L'ordine di precedenza è deliberato — un errore va visto prima
      di una richiesta di revisione, che va vista prima di un'esecuzione. */
  function statoGara(fasi) {
    const stati = [];
    for (let n = 1; n <= 7; n++) stati.push(statoFase(fasi, n));
    if (stati.includes("errore")) return "errore";
    if (stati.includes("da_rivedere")) return "da_rivedere";
    if (stati.includes("in_esecuzione")) return "in_esecuzione";
    if (stati.every((s) => s === "completata")) return "completata";
    return "in_coda";
  }

  /** Segmenti del mini-stepper nella card di gara: 7, uno per fase. */
  function segmenti(fasi) {
    const mappa = {
      completata: "done", errore: "error", da_rivedere: "review",
      in_esecuzione: "running", in_coda: "queued",
    };
    const out = [];
    for (let n = 1; n <= 7; n++) out.push(mappa[statoFase(fasi, n)] || "queued");
    return out;
  }

  /** Le categorie di documento accettate dal backend (vedi routers/gare.py). */
  const CATEGORIE = [
    { id: "disciplinare", tag: "DISC", label: "Disciplinare", hint: "Guida l'estrazione dei requisiti" },
    { id: "elaborati",    tag: "ELAB", label: "Elaborati",    hint: "Capitolato, allegati, planimetrie" },
    { id: "p7m",          tag: "P7M",  label: "PDF firmati",  hint: "Verifica automatica della firma" },
  ];

  const ESTENSIONI_AMMESSE = [".pdf", ".p7m", ".xlsx", ".docx", ".xls", ".doc"];
  const LIMITE_BYTE = 40 * 1024 * 1024;

  /** Categoria indovinata dal nome del file: correggibile, mai imposta. */
  function categoriaProbabile(nome) {
    const n = String(nome || "").toLowerCase();
    if (n.endsWith(".p7m")) return "p7m";
    if (/disciplinar/.test(n)) return "disciplinare";
    return "elaborati";
  }

  /** Perché un file è stato rifiutato — o null se va bene. */
  function motivoRifiuto(file) {
    const nome = String(file.name || "").toLowerCase();
    const ok = ESTENSIONI_AMMESSE.some((e) => nome.endsWith(e));
    if (!ok) return "formato non supportato";
    if (file.size > LIMITE_BYTE) return `${UI.byte(file.size)} · limite 40 MB`;
    return null;
  }

  const EFFORT = ["low", "medium", "high", "xhigh", "max"];
  const EFFORT_HINT = {
    low: "Passata rapida: utile per una prima ricognizione del disciplinare.",
    medium: "Equilibrio fra tempi e profondità — adatto a gare sotto soglia.",
    high: "Predefinito per gare complesse: analisi requisito per requisito.",
    xhigh: "Ragionamento esteso su capitolato e quadro economico. Tempi 2–3×.",
    max: "Massima profondità, da riservare a gare strategiche o contenziose.",
  };
  const MODELLI = [
    { id: "claude-sonnet-5", hint: "Predefinito. Buon compromesso su gare fino a ~200 pagine di documentazione." },
    { id: "claude-opus-5", hint: "Per capitolati stratificati o quadri economici con molte varianti." },
  ];

  return {
    FASI, GATE_UMANO, STATO, STATO_GARA, CATEGORIE, EFFORT, EFFORT_HINT, MODELLI,
    ESTENSIONI_AMMESSE, LIMITE_BYTE,
    fase, corpoFase, statoFase, faseCorrente, statoGara, segmenti, normalizzaStato,
    categoriaProbabile, motivoRifiuto,
  };
})();
