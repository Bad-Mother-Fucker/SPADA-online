// elenco.js — pagina delle gare: filtri, ricerca, griglia di card e il
// modale di creazione. Il modale è un overlay sull'elenco, non una pagina:
// si crea una gara guardando quelle che ci sono già.

const { h, s, set, I, punto, Tema, Toast } = UI;

const stato = {
  gare: [],          // dal backend, arricchite in un secondo momento
  filtro: "tutte",
  ricerca: "",
  caricamento: true,
  errore: null,
};

// ---------------------------------------------------------------------------
// Barra applicativa
// ---------------------------------------------------------------------------

document.getElementById("brand-mark").appendChild(I.stella(13));
document.getElementById("slot-tema").appendChild(Tema.controllo());
set(document.getElementById("apri-nuova-gara"), I.piu(13), "Nuova gara");
document.getElementById("apri-nuova-gara").addEventListener("click", apriNuovaGara);

/** Il design mostra qui lo stato dello stream. L'elenco non ne apre uno:
    il segnale onesto è la raggiungibilità del backend. */
function segnalaBackend(ok, dettaglio) {
  const el = document.getElementById("stato-backend");
  el.className = ok ? "badge badge--ok" : "badge badge--crit";
  set(el, h("span", { class: ok ? "dot dot--slow" : "dot", "aria-hidden": "true" }),
    ok ? "Backend connesso" : (dettaglio || "Backend non raggiungibile"));
}

// ---------------------------------------------------------------------------
// Card di gara
// ---------------------------------------------------------------------------

/** Ultimo momento in cui è successo qualcosa su questa gara. */
function ultimoMovimento(g) {
  const fasi = g.fasi || {};
  let max = g.creato_il || null;
  for (const corpo of Object.values(fasi)) {
    for (const campo of ["conclusa_il", "iniziata_il"]) {
      const v = corpo && corpo[campo];
      if (v && (!max || Date.parse(v) > Date.parse(max))) max = v;
    }
  }
  return max;
}

/** L'avviso in fondo alla card: cosa richiede attenzione, in una riga. */
function avvisoGara(g) {
  const fasi = g.fasi || {};
  for (let n = 1; n <= 7; n++) {
    if (Dominio.statoFase(fasi, n) === "errore") {
      return { testo: `errore in Fase ${n}`, tono: "crit" };
    }
  }
  for (let n = 1; n <= 7; n++) {
    if (Dominio.statoFase(fasi, n) === "da_rivedere") {
      const corpo = Dominio.corpoFase(fasi, n);
      const da = corpo && corpo.conclusa_il;
      const gg = da ? Math.floor((Date.now() - Date.parse(da)) / 86400000) : 0;
      return {
        testo: gg >= 1 ? `checkpoint fermo da ${gg} g` : `checkpoint Fase ${n} in attesa`,
        tono: "accent",
      };
    }
  }
  return null;
}

function cardGara(g, indice) {
  const fasi = g.fasi || {};
  const st = Dominio.statoGara(fasi);
  const meta = Dominio.STATO_GARA[st];
  const faseN = Dominio.faseCorrente(fasi);
  const fase = Dominio.fase(faseN);
  const avviso = avvisoGara(g);

  const segmenti = Dominio.segmenti(fasi).map((seg) =>
    h("span", { class: "ministepper__seg", dataset: { st: seg } }));

  const card = h("a", {
    class: `tender tender--${meta.tono}`,
    href: `gara.html?slug=${encodeURIComponent(g.slug)}`,
    style: { animationDelay: `${Math.min(indice, 8) * 55}ms` },
  },
    h("span", { class: "sheen sheen--short", "aria-hidden": "true" }),
    h("span", { class: `rail rail--${meta.tono}`, "aria-hidden": "true" }),

    h("span", { class: "tender__row" },
      h("span", { class: `badge badge--${meta.tono}` },
        punto(st === "in_esecuzione"), meta.etichetta),
      h("span", { class: "tender__slug", title: g.slug }, g.slug)),

    h("span", { class: "tender__name" }, g.nome || g.slug),

    h("span", { class: "tender__tags" },
      h("span", { class: "chip chip--sq" }, `${g.regione} ${g.anno_prezzario}`),
      h("span", { class: "chip chip--sq chip--mono" }, g.modello),
      h("span", { class: "chip chip--sq" }, `effort ${g.effort}`)),

    h("span", { class: "ministepper" },
      h("span", { class: "ministepper__bars", "aria-hidden": "true" }, segmenti),
      h("span", { class: "ministepper__legend" },
        h("span", null,
          h("strong", { class: "strong" }, `Fase ${faseN}`), " · ", fase.titolo),
        h("span", { class: "faint", style: { flex: "none" } }, UI.quandoRelativo(ultimoMovimento(g))))),

    h("span", { class: "tender__foot" },
      h("span", { "data-elaborati": g.slug }, "elaborati…"),
      h("span", { "aria-hidden": "true", class: "faint" }, "·"),
      h("span", { "data-scadenza": g.slug }, "scadenza…"),
      avviso && h("span", {
        style: { color: `var(--${avviso.tono})`, fontWeight: "var(--fw-semibold)" },
      }, avviso.testo)));

  // aria-label esplicito: il contenuto della card è ricco di frammenti, un
  // lettore di schermo li leggerebbe come una sequenza senza gerarchia.
  card.setAttribute("aria-label",
    `${g.nome || g.slug} — ${meta.etichetta}, fase ${faseN} ${fase.titolo}`);
  return card;
}

/** Scheletro: stessa altezza della card reale, così l'arrivo dei dati non
    sposta nulla in pagina. */
function scheletro(i) {
  return h("div", { class: "skeleton", "aria-hidden": "true" },
    h("div", { class: "row row--between", style: { flexWrap: "nowrap" } },
      h("div", { class: "sk sk--pill" }),
      h("div", { class: "sk sk--flat", style: { height: "14px", width: "130px" } })),
    h("div", { class: "sk", style: { width: i === 0 ? "88%" : "74%" } }),
    h("div", { class: "sk", style: { width: i === 0 ? "56%" : "40%" } }),
    h("div", { class: "sk-bars" }, Array.from({ length: 7 }, () => h("i", null))));
}

function vistaCaricamento() {
  return h("div", { class: "tenders", "aria-busy": "true" },
    scheletro(0), scheletro(1), scheletro(2));
}

function vistaVuota() {
  return h("div", { class: "empty" },
    h("div", { class: "empty__icon" }, I.documento(20)),
    h("h3", null, "Nessuna gara ancora registrata"),
    h("p", null, "Una gara nasce da tre documenti: disciplinare, elaborati tecnici e, se presenti, i PDF firmati P7M. Il resto lo produce la pipeline."),
    h("div", { class: "empty__actions" },
      h("button", { type: "button", class: "btn btn--primary", onClick: apriNuovaGara }, "Crea la prima gara"),
      h("a", { class: "btn", href: "https://github.com/", target: "_blank", rel: "noopener" }, "Come funzionano le 7 fasi")));
}

/** Vuoto da filtro: diverso dal vuoto assoluto — qui i dati ci sono, è la
    selezione a non produrre risultati, e la via d'uscita è azzerarla. */
function vistaNessunRisultato() {
  return h("div", { class: "empty" },
    h("div", { class: "empty__icon" }, I.lente(20)),
    h("h3", null, "Nessuna gara corrisponde"),
    h("p", null, "Nessuna gara soddisfa insieme il filtro di stato e il testo cercato."),
    h("div", { class: "empty__actions" },
      h("button", {
        type: "button", class: "btn",
        onClick: () => {
          stato.filtro = "tutte";
          stato.ricerca = "";
          document.getElementById("ricerca").value = "";
          disegna();
        },
      }, "Azzera i filtri")));
}

function vistaErrore(err) {
  return h("div", { class: "pageerror" },
    h("div", null,
      h("div", { class: "empty__icon empty__icon--crit" }, I.triangolo(20)),
      h("h3", null, "Non riesco a caricare l'elenco delle gare"),
      h("p", null,
        "Il servizio ha risposto ",
        h("code", { class: "mono" }, err.stato ? String(err.stato) : "nessuna risposta"),
        " per ", h("code", { class: "mono" }, err.percorso || "/gare"),
        ". Nessuna gara è stata modificata: non è stato avviato né interrotto alcun job."),
      h("div", { class: "empty__actions" },
        h("button", { type: "button", class: "btn btn--primary", onClick: carica }, "Riprova"),
        h("a", { class: "btn", href: Api.base() + "/docs", target: "_blank", rel: "noopener" }, "Stato del servizio"))));
}

// ---------------------------------------------------------------------------
// Filtri e disegno
// ---------------------------------------------------------------------------

const FILTRI = [
  ["tutte", "Tutte", null],
  ["da_rivedere", "Da rivedere", "accent"],
  ["in_esecuzione", "In esecuzione", "info"],
  ["errore", "Errore", "crit"],
  ["completata", "Completate", "ok"],
];

function disegnaFiltri() {
  const conteggi = { tutte: stato.gare.length };
  for (const g of stato.gare) {
    const st = Dominio.statoGara(g.fasi || {});
    conteggi[st] = (conteggi[st] || 0) + 1;
  }
  set(document.getElementById("filtri"), FILTRI.map(([k, label, tono]) =>
    h("button", {
      type: "button",
      class: "pill",
      dataset: tono ? { tone: tono } : {},
      "aria-pressed": String(stato.filtro === k),
      onClick: () => { stato.filtro = k; disegna(); },
    }, label, h("span", { class: "pill__count" }, String(conteggi[k] || 0)))));
}

function gareFiltrate() {
  const q = stato.ricerca.trim().toLowerCase();
  return stato.gare.filter((g) => {
    if (stato.filtro !== "tutte" && Dominio.statoGara(g.fasi || {}) !== stato.filtro) return false;
    if (!q) return true;
    return `${g.nome || ""} ${g.slug}`.toLowerCase().includes(q);
  });
}

/** Prima ciò che richiede una persona, poi per ultimo aggiornamento: è la
    regola dichiarata in fondo alla pagina, non un ordinamento implicito. */
const PRIORITA = { errore: 0, da_rivedere: 1, in_esecuzione: 2, in_coda: 3, completata: 4 };

function ordinate(lista) {
  return lista.slice().sort((a, b) => {
    const pa = PRIORITA[Dominio.statoGara(a.fasi || {})] ?? 9;
    const pb = PRIORITA[Dominio.statoGara(b.fasi || {})] ?? 9;
    if (pa !== pb) return pa - pb;
    return Date.parse(ultimoMovimento(b) || 0) - Date.parse(ultimoMovimento(a) || 0);
  });
}

function sommario() {
  const el = document.getElementById("sommario-gare");
  if (stato.caricamento) { el.textContent = "Caricamento dell'elenco…"; return; }
  if (stato.errore) { el.textContent = "Elenco non disponibile."; return; }
  const n = stato.gare.length;
  if (n === 0) { el.textContent = "Nessuna gara registrata."; return; }
  const daRivedere = stato.gare.filter((g) => Dominio.statoGara(g.fasi || {}) === "da_rivedere").length;
  const inErrore = stato.gare.filter((g) => Dominio.statoGara(g.fasi || {}) === "errore").length;
  const pezzi = [h("span", null, UI.plurale(n, "gara", "gare"))];
  if (daRivedere) {
    pezzi.push(" · ", h("strong", { style: { color: "var(--accent)" } },
      `${daRivedere === 1 ? "1 richiede" : daRivedere + " richiedono"} la tua revisione`));
  }
  if (inErrore) pezzi.push(" · ", `${inErrore} in errore`);
  set(el, pezzi);
}

function disegna() {
  sommario();
  disegnaFiltri();
  const c = document.getElementById("elenco");
  if (stato.errore) { set(c, vistaErrore(stato.errore)); return; }
  if (stato.caricamento) { set(c, vistaCaricamento()); return; }
  if (stato.gare.length === 0) { set(c, vistaVuota()); return; }
  const lista = ordinate(gareFiltrate());
  if (lista.length === 0) { set(c, vistaNessunRisultato()); return; }
  set(c, h("div", { class: "tenders" }, lista.map(cardGara)));
  arricchisci(lista);
}

document.getElementById("ricerca").addEventListener("input", (e) => {
  stato.ricerca = e.target.value;
  disegna();
});

// ---------------------------------------------------------------------------
// Arricchimento differito
//
// Numero di elaborati e scadenza non stanno in GET /gare: richiedono una
// chiamata per gara. Si fanno dopo il primo disegno, a quattro alla volta,
// e riempiono i due segnaposto già presenti nella card — così la griglia
// compare subito e non si muove più.
// ---------------------------------------------------------------------------

const cacheArricchimento = new Map();

async function arricchisci(lista) {
  const coda = lista.filter((g) => !cacheArricchimento.has(g.slug));
  lista.filter((g) => cacheArricchimento.has(g.slug))
    .forEach((g) => applicaArricchimento(g.slug, cacheArricchimento.get(g.slug)));

  const lavoratore = async () => {
    while (coda.length) {
      const g = coda.shift();
      const dati = { elaborati: null, scadenza: null };
      const [out, det] = await Promise.allSettled([
        Api.elencoOutput(g.slug),
        Api.dettaglioGara(g.slug),
      ]);
      if (out.status === "fulfilled") {
        // Si contano gli elaborati, non tutti i file: le viste HTML in
        // 11_view/ sono gemelli degli stessi documenti.
        dati.elaborati = out.value.filter((p) => p.endsWith(".md") && !p.startsWith("11_view/")).length;
      }
      if (det.status === "fulfilled") {
        dati.scadenza = det.value?.manifest?.gara?.scadenza_offerta || null;
      }
      cacheArricchimento.set(g.slug, dati);
      applicaArricchimento(g.slug, dati);
    }
  };
  await Promise.all(Array.from({ length: 4 }, lavoratore));
}

function applicaArricchimento(slug, dati) {
  const sel = (attr) => document.querySelector(`[data-${attr}="${CSS.escape(slug)}"]`);
  const e = sel("elaborati");
  if (e) {
    e.textContent = dati.elaborati === null
      ? "elaborati non leggibili"
      : UI.plurale(dati.elaborati, "elaborato", "elaborati");
  }
  const s2 = sel("scadenza");
  if (s2) s2.textContent = UI.scadenza(dati.scadenza);
}

// ---------------------------------------------------------------------------
// Modale · nuova gara
// ---------------------------------------------------------------------------

function apriNuovaGara() {
  const overlay = document.getElementById("overlay-nuova-gara");
  const form = {
    nome: "",
    slug: "",
    slugAuto: true,
    regione: "",
    anno: String(new Date().getFullYear()),
    modello: Dominio.MODELLI[0].id,
    effort: "high",
    inCorso: false,
  };
  const slugPresi = new Set(stato.gare.map((g) => g.slug));
  // null = non ancora chiesti; [] = chiesti e nessuno installato. Sono due
  // cose diverse: la seconda non deve impedire di creare la gara.
  let prezzari = null;
  let rilasciaFocus = null;
  let chiuso = false;

  const chiudi = () => {
    if (chiuso) return;
    chiuso = true;
    if (rilasciaFocus) rilasciaFocus();
    overlay.hidden = true;
    overlay.replaceChildren();
    document.body.style.overflow = "";
  };

  const slugCorrente = () => (form.slugAuto ? UI.slugify(form.nome) : form.slug);

  function validazioneSlug() {
    const sl = slugCorrente();
    if (!sl) return { ok: false, msg: "Serve uno slug: si genera dal nome o lo scrivi tu.", crit: false };
    if (sl.length < 6) return { ok: false, msg: "Almeno 6 caratteri: minuscolo, senza spazi.", crit: true };
    if (slugPresi.has(sl)) return { ok: false, msg: "Slug già usato da un'altra gara: aggiungi un riferimento (anno, lotto).", crit: true };
    if (!/^[a-z0-9-]{1,64}$/.test(sl)) return { ok: false, msg: "Solo minuscole, cifre e trattini.", crit: true };
    return { ok: true, msg: "Derivato dal nome. Modificabile finché la gara non è avviata.", crit: false };
  }

  /* Il prezzario serve alla pipeline quando valorizza le voci, non per
     registrare la gara: un'installazione senza prezzari importati deve
     comunque poter creare una gara. Regione e anno restano obbligatori
     per il backend, ma si possono scrivere a mano. */
  function validazionePrezzario() {
    const r = form.regione.trim();
    const a = Number(form.anno);
    if (!r) return { ok: false, msg: "Indica la regione del prezzario di riferimento." };
    if (!Number.isInteger(a) || a < 2000 || a > 2100) return { ok: false, msg: "L'anno deve essere fra 2000 e 2100." };
    if (prezzari && prezzari.length && !prezzari.some((p) => p.regione === r && p.anno === a)) {
      return { ok: true, msg: `Nessun prezzario ${r} ${a} è installato: la gara si crea comunque, ma le fasi che valorizzano le voci lo richiederanno.`, avviso: true };
    }
    if (prezzari && !prezzari.length) {
      return { ok: true, msg: "Nessun prezzario installato su questa istanza: la gara si crea comunque. Il prezzario serve dalla Fase 4 in poi.", avviso: true };
    }
    return { ok: true, msg: "" };
  }

  const valido = () =>
    validazioneSlug().ok && form.nome.trim().length > 3 && validazionePrezzario().ok && !form.inCorso;

  function anniPer(regione) {
    if (!prezzari) return null;
    const anni = prezzari.filter((p) => p.regione === regione).map((p) => p.anno).sort();
    if (!anni.length) return null;
    return anni.length === 1 ? String(anni[0]) : `${anni[0]} → ${anni[anni.length - 1]}`;
  }

  async function invia() {
    form.inCorso = true;
    aggiorna();
    try {
      await Api.creaGara({
        slug: slugCorrente(),
        nome: form.nome.trim(),
        regione: form.regione.trim(),
        anno_prezzario: Number(form.anno),
        modello: form.modello,
        effort: form.effort,
      });
      Toast.ok("Gara creata. Il prossimo passo è caricare i documenti.");
      chiudi();
      // Si atterra direttamente sulla Fase 1: la gara appena creata non ha
      // altro da mostrare che la dropzone.
      location.href = `gara.html?slug=${encodeURIComponent(slugCorrente())}#/fase/1`;
    } catch (e) {
      form.inCorso = false;
      aggiorna();
      Toast.errore(`Creazione non riuscita: ${e.message}`);
    }
  }

  // -------------------------------------------------------------------
  // Il modale si costruisce UNA volta. Ogni interazione aggiorna in posto
  // i pochi elementi che dipendono davvero dallo stato: ricostruirlo a
  // ogni clic rigiocherebbe l'animazione d'ingresso e farebbe perdere il
  // punto di inserimento nel campo attivo.
  // -------------------------------------------------------------------
  const el = {};

  function costruisci() {
    el.contatoreNome = h("span", { style: { fontWeight: "var(--fw-regular)", color: "var(--ink-4)" } }, "0 / 180");
    el.inputNome = h("input", {
      type: "text", class: "input", maxlength: "180", value: form.nome,
      placeholder: "Es. Servizio di manutenzione degli impianti elevatori — ASL…",
      onInput: (e) => { form.nome = e.target.value; aggiorna(); },
    });

    el.gruppoSlug = h("span", { class: "input-group" });
    el.inputSlug = h("input", {
      type: "text", class: "input-group__input", id: "slug-input", value: slugCorrente(),
      placeholder: "manutenzione-elevatori-asl-na3",
      onInput: (e) => { form.slug = e.target.value; form.slugAuto = false; aggiorna(); },
    });
    el.chipGenerato = h("span", { class: "chip", style: { flex: "none" } }, "generato");
    el.gruppoSlug.append(
      h("span", { class: "input-group__prefix" }, "/gare/"),
      el.inputSlug, el.chipGenerato);
    el.msgSlug = h("span", { class: "field__hint", id: "slug-msg" });

    el.campoRegione = h("div");
    el.msgPrezzario = h("span", { class: "field__hint" });
    el.hintAnni = h("span", { class: "field__hint" });
    el.campoAnno = h("div");

    el.modelli = Dominio.MODELLI.map((m) => h("button", {
      type: "button", class: "choice",
      "aria-pressed": String(form.modello === m.id),
      onClick: () => { form.modello = m.id; aggiorna(); },
    },
      h("span", { class: "choice__head" },
        h("span", { class: "choice__radio", "aria-hidden": "true" }),
        h("span", { class: "choice__id" }, m.id)),
      h("span", { class: "choice__hint" }, m.hint)));

    el.efforts = Dominio.EFFORT.map((id) => h("button", {
      type: "button", class: "seg__btn",
      "aria-pressed": String(form.effort === id),
      onClick: () => { form.effort = id; aggiorna(); },
    }, id));
    el.hintEffort = h("p", { style: { margin: "var(--s-2) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-3)" } });

    el.crea = h("button", {
      type: "button", class: "btn btn--primary", id: "btn-crea", onClick: invia,
    }, "Crea e carica documenti");

    const modale = h("div", {
      class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "h-nuova",
    },
      h("div", { class: "sheen sheen--tall", "aria-hidden": "true" }),

      h("header", { class: "modal__head" },
        h("div", null,
          h("div", { class: "kicker", style: { marginBottom: "6px" } }, "Nuova gara"),
          h("h1", { id: "h-nuova" }, "Registra un appalto da analizzare"),
          h("p", null, "La pipeline parte solo dopo il caricamento dei documenti: qui definisci soltanto identificativi e parametri del modello.")),
        h("button", {
          type: "button", class: "icon-btn icon-btn--md",
          "aria-label": "Chiudi", onClick: chiudi,
        }, I.chiudi(12))),

      h("div", { class: "modal__body" },
        h("label", { class: "field" },
          h("span", { class: "field__label" }, "Nome esteso della gara", el.contatoreNome),
          el.inputNome,
          h("span", { class: "field__hint" }, "Come compare nell'oggetto del disciplinare — viene riportato negli elaborati prodotti.")),

        h("label", { class: "field" },
          h("span", { class: "field__label" }, "Slug"),
          el.gruppoSlug,
          el.msgSlug),

        h("div", null,
          h("div", { class: "grid-auto" },
            h("label", { class: "field" },
              h("span", { class: "field__label" }, "Regione del prezzario"),
              el.campoRegione),
            h("label", { class: "field" },
              h("span", { class: "field__label" }, "Anno prezzario"),
              el.campoAnno,
              el.hintAnni)),
          el.msgPrezzario),

        h("fieldset", null,
          h("legend", null, "Modello"),
          h("div", { class: "grid-auto grid-auto--md" }, el.modelli)),

        h("fieldset", null,
          h("legend", null, "Effort"),
          h("div", { class: "seg seg--wash", role: "group", "aria-label": "Effort" }, el.efforts),
          el.hintEffort),

        h("div", { class: "note" }, I.info(14),
          h("p", null, "Modello ed effort restano modificabili fino all'avvio della Fase 1 e per ogni riesecuzione successiva."))),

      h("footer", { class: "modal__foot" },
        h("span", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } },
          "Passo successivo: caricamento di Disciplinare, Elaborati e P7M."),
        h("span", { class: "row row--tight" },
          h("button", { type: "button", class: "btn", onClick: chiudi }, "Annulla"),
          el.crea)));

    set(overlay, modale);
    costruisciCampiPrezzario();
    aggiorna();
  }

  /** Con i prezzari installati si sceglie da un elenco; senza, si scrive.
      In entrambi i casi la gara si può creare. */
  function costruisciCampiPrezzario() {
    const conElenco = Array.isArray(prezzari) && prezzari.length > 0;

    if (conElenco) {
      const regioni = [...new Set(prezzari.map((p) => p.regione))].sort();
      if (!form.regione) form.regione = regioni[0];
      el.selRegione = h("select", {
        class: "select",
        onChange: (e) => { form.regione = e.target.value; sincronizzaAnni(); aggiorna(); },
      }, regioni.map((r) => h("option", { value: r, selected: form.regione === r }, r)));
      el.selAnno = h("select", {
        class: "select mono",
        onChange: (e) => { form.anno = e.target.value; aggiorna(); },
      });
      set(el.campoRegione, el.selRegione);
      set(el.campoAnno, el.selAnno);
      sincronizzaAnni();
    } else {
      el.selRegione = h("input", {
        type: "text", class: "input", value: form.regione, placeholder: "Es. Campania",
        onInput: (e) => { form.regione = e.target.value; aggiorna(); },
      });
      el.selAnno = h("input", {
        type: "number", class: "input mono", value: form.anno, min: "2000", max: "2100",
        onInput: (e) => { form.anno = e.target.value; aggiorna(); },
      });
      set(el.campoRegione, el.selRegione);
      set(el.campoAnno, el.selAnno);
    }
  }

  function sincronizzaAnni() {
    if (!el.selAnno || el.selAnno.tagName !== "SELECT") return;
    const anni = [...new Set(prezzari.filter((p) => p.regione === form.regione).map((p) => p.anno))]
      .sort((a, b) => b - a);
    set(el.selAnno, anni.map((a) => h("option", { value: String(a) }, String(a))));
    if (anni.length) {
      if (!anni.some((a) => String(a) === form.anno)) form.anno = String(anni[0]);
      el.selAnno.value = form.anno;
    }
  }

  /** Aggiorna in posto ciò che dipende dallo stato. Non ricostruisce nulla:
      niente animazione rigiocata, niente cursore che salta. */
  function aggiorna() {
    const vs = validazioneSlug();
    const vp = validazionePrezzario();

    el.contatoreNome.textContent = `${form.nome.length} / 180`;
    el.gruppoSlug.classList.toggle("input-group--invalid", !!vs.crit);
    el.msgSlug.textContent = vs.msg;
    el.msgSlug.classList.toggle("field__hint--crit", !!vs.crit);
    el.chipGenerato.hidden = !(form.slugAuto && slugCorrente());
    if (form.slugAuto && document.activeElement !== el.inputSlug) {
      el.inputSlug.value = slugCorrente();
    }

    el.msgPrezzario.textContent = vp.msg;
    el.msgPrezzario.classList.toggle("field__hint--crit", !vp.ok);
    el.msgPrezzario.style.color = vp.avviso ? "var(--warn)" : "";
    // Senza alcun prezzario installato il messaggio sotto i due campi dice
    // già tutto: ripeterlo qui sarebbe rumore.
    el.hintAnni.textContent = prezzari === null
      ? "Lettura dei prezzari installati…"
      : !prezzari.length
        ? ""
        : anniPer(form.regione)
          ? `Disponibile per ${form.regione}: ${anniPer(form.regione)}`
          : "Nessuna annualità installata per questa regione.";

    el.modelli.forEach((b, i) =>
      b.setAttribute("aria-pressed", String(Dominio.MODELLI[i].id === form.modello)));
    el.efforts.forEach((b, i) =>
      b.setAttribute("aria-pressed", String(Dominio.EFFORT[i] === form.effort)));
    el.hintEffort.textContent = Dominio.EFFORT_HINT[form.effort];

    el.crea.disabled = !valido();
    el.crea.textContent = form.inCorso ? "Creazione in corso…" : "Crea e carica documenti";
  }

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  costruisci();
  rilasciaFocus = UI.trappolaFocus(overlay, chiudi);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) chiudi(); });

  // I prezzari installati decidono se il campo è un elenco o un testo
  // libero. Finché non arrivano, il modale è già usabile.
  Api.sistemaPrezzari()
    .then((p) => { prezzari = Array.isArray(p) ? p : []; })
    .catch(() => { prezzari = []; })
    .finally(() => { costruisciCampiPrezzario(); aggiorna(); });
}


// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------

async function carica() {
  stato.caricamento = true;
  stato.errore = null;
  disegna();
  try {
    stato.gare = await Api.elencoGare();
    stato.caricamento = false;
    segnalaBackend(true);
    disegna();
  } catch (e) {
    stato.caricamento = false;
    stato.errore = e;
    segnalaBackend(false, e.stato ? `Backend: ${e.stato}` : "Backend non raggiungibile");
    disegna();
  }
}

/** Il token OAuth scaduto blocca ogni esecuzione: va detto qui, non alla
    prima fase che fallisce. */
async function controllaAuth() {
  try {
    const a = await Api.sistemaAuth();
    if (!a.disponibile) {
      Toast.errore(`Autenticazione Claude non disponibile: ${a.motivo}`);
      return;
    }
    const stima = a.stima_scadenza;
    if (stima && stima.giorni_alla_scadenza_stimata < 30) {
      Toast.avviso(stima.giorni_alla_scadenza_stimata < 0
        ? `Il token OAuth potrebbe essere scaduto (stima). ${stima.nota}`
        : `Il token OAuth scade tra circa ${stima.giorni_alla_scadenza_stimata} giorni (stima). ${stima.nota}`);
    }
  } catch { /* endpoint non raggiungibile: l'errore dell'elenco basta */ }
}

carica();
controllaAuth();
