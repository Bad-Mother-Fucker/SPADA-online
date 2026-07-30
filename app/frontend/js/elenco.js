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
  let regioniDisponibili = [];
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

  const valido = () => validazioneSlug().ok && form.nome.trim().length > 3 && !!form.regione && !form.inCorso;

  function anniPer(regione) {
    const anni = regioniDisponibili.filter((p) => p.regione === regione).map((p) => p.anno).sort();
    if (!anni.length) return null;
    return anni.length === 1 ? String(anni[0]) : `${anni[0]} → ${anni[anni.length - 1]}`;
  }

  async function invia() {
    form.inCorso = true;
    disegnaModale();
    try {
      await Api.creaGara({
        slug: slugCorrente(),
        nome: form.nome.trim(),
        regione: form.regione,
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
      disegnaModale();
      Toast.errore(`Creazione non riuscita: ${e.message}`);
    }
  }

  function disegnaModale() {
    const v = validazioneSlug();
    const sl = slugCorrente();

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
        // Nome
        h("label", { class: "field" },
          h("span", { class: "field__label" }, "Nome esteso della gara",
            h("span", { style: { fontWeight: "var(--fw-regular)", color: "var(--ink-4)" } },
              `${form.nome.length} / 180`)),
          h("input", {
            type: "text", class: "input", maxlength: "180", value: form.nome,
            placeholder: "Es. Servizio di manutenzione degli impianti elevatori — ASL…",
            onInput: (e) => {
              form.nome = e.target.value;
              // Ridisegna solo ciò che dipende dal nome: riscrivere il
              // modale a ogni tasto sposterebbe il cursore.
              aggiornaDerivatiDalNome();
            },
          }),
          h("span", { class: "field__hint" }, "Come compare nell'oggetto del disciplinare — viene riportato negli elaborati prodotti.")),

        // Slug
        h("label", { class: "field" },
          h("span", { class: "field__label" }, "Slug"),
          h("span", { class: `input-group${v.crit ? " input-group--invalid" : ""}`, id: "slug-group" },
            h("span", { class: "input-group__prefix" }, "/gare/"),
            h("input", {
              type: "text", class: "input-group__input", id: "slug-input", value: sl,
              placeholder: "manutenzione-elevatori-asl-na3",
              onInput: (e) => { form.slug = e.target.value; form.slugAuto = false; aggiornaDerivatiDalNome(); },
            }),
            form.slugAuto && sl ? h("span", { class: "chip", style: { flex: "none" } }, "generato") : null),
          h("span", {
            class: `field__hint${v.crit ? " field__hint--crit" : ""}`, id: "slug-msg",
          }, v.msg)),

        // Prezzario
        h("div", { class: "grid-auto" },
          h("label", { class: "field" },
            h("span", { class: "field__label" }, "Regione del prezzario"),
            h("select", {
              class: "select", id: "sel-regione",
              onChange: (e) => { form.regione = e.target.value; aggiornaAnni(); },
            }, opzioniRegione()),
            h("span", { class: "field__hint", id: "hint-prezzari" },
              regioniDisponibili.length ? "" : "Lettura dei prezzari installati…")),
          h("label", { class: "field" },
            h("span", { class: "field__label" }, "Anno prezzario"),
            h("select", {
              class: "select mono", id: "sel-anno",
              onChange: (e) => { form.anno = e.target.value; },
            }, opzioniAnno()),
            h("span", { class: "field__hint", id: "hint-anni" },
              form.regione ? `Disponibile per ${form.regione}: ${anniPer(form.regione) || "—"}` : "Scegli prima la regione."))),

        // Modello
        h("fieldset", null,
          h("legend", null, "Modello"),
          h("div", { class: "grid-auto--md", style: { display: "grid" } },
            Dominio.MODELLI.map((m) => h("button", {
              type: "button", class: "choice",
              "aria-pressed": String(form.modello === m.id),
              onClick: () => { form.modello = m.id; disegnaModale(); },
            },
              h("span", { class: "choice__head" },
                h("span", { class: "choice__radio", "aria-hidden": "true" }),
                h("span", { class: "choice__id" }, m.id)),
              h("span", { class: "choice__hint" }, m.hint))))),

        // Effort
        h("fieldset", null,
          h("legend", null, "Effort"),
          h("div", { class: "seg seg--wash", role: "group", "aria-label": "Effort" },
            Dominio.EFFORT.map((id) => h("button", {
              type: "button", class: "seg__btn",
              "aria-pressed": String(form.effort === id),
              onClick: () => { form.effort = id; disegnaModale(); },
            }, id))),
          h("p", { style: { margin: "var(--s-2) 0 0", fontSize: "var(--fs-micro)", color: "var(--ink-3)" } },
            Dominio.EFFORT_HINT[form.effort])),

        h("div", { class: "note" }, I.info(14),
          h("p", null, "Modello ed effort restano modificabili fino all'avvio della Fase 1 e per ogni riesecuzione successiva."))),

      h("footer", { class: "modal__foot" },
        h("span", { style: { fontSize: "var(--fs-micro)", color: "var(--ink-3)" } },
          "Passo successivo: caricamento di Disciplinare, Elaborati e P7M."),
        h("span", { class: "row row--tight" },
          h("button", { type: "button", class: "btn", onClick: chiudi }, "Annulla"),
          h("button", {
            type: "button", class: "btn btn--primary", id: "btn-crea",
            disabled: !valido(), onClick: invia,
          }, form.inCorso ? "Creazione in corso…" : "Crea e carica documenti"))));

    set(overlay, modale);
  }

  function opzioniRegione() {
    const regioni = [...new Set(regioniDisponibili.map((p) => p.regione))].sort();
    const opts = [h("option", { value: "" }, regioni.length ? "Scegli una regione" : "Nessun prezzario installato")];
    for (const r of regioni) {
      opts.push(h("option", { value: r, selected: form.regione === r }, r));
    }
    return opts;
  }

  function opzioniAnno() {
    const anni = [...new Set(regioniDisponibili
      .filter((p) => !form.regione || p.regione === form.regione)
      .map((p) => p.anno))].sort((a, b) => b - a);
    if (!anni.length) return [h("option", { value: form.anno }, form.anno)];
    return anni.map((a) => h("option", { value: String(a), selected: String(a) === form.anno }, String(a)));
  }

  /** Aggiorna in posto ciò che dipende da nome e slug, senza ricostruire il
      modale: il campo attivo deve conservare cursore e selezione. */
  function aggiornaDerivatiDalNome() {
    const v = validazioneSlug();
    const gruppo = document.getElementById("slug-group");
    const msg = document.getElementById("slug-msg");
    const input = document.getElementById("slug-input");
    if (gruppo) gruppo.classList.toggle("input-group--invalid", v.crit);
    if (msg) { msg.textContent = v.msg; msg.classList.toggle("field__hint--crit", v.crit); }
    if (input && form.slugAuto && document.activeElement !== input) input.value = slugCorrente();
    const conteggio = overlay.querySelector(".field__label span");
    if (conteggio) conteggio.textContent = `${form.nome.length} / 180`;
    const crea = document.getElementById("btn-crea");
    if (crea) crea.disabled = !valido();
  }

  function aggiornaAnni() {
    const selAnno = document.getElementById("sel-anno");
    if (selAnno) {
      set(selAnno, opzioniAnno());
      form.anno = selAnno.value;
    }
    const hint = document.getElementById("hint-anni");
    if (hint) hint.textContent = form.regione ? `Disponibile per ${form.regione}: ${anniPer(form.regione) || "—"}` : "Scegli prima la regione.";
    const crea = document.getElementById("btn-crea");
    if (crea) crea.disabled = !valido();
  }

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  disegnaModale();
  rilasciaFocus = UI.trappolaFocus(overlay, chiudi);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) chiudi(); });

  // I prezzari installati decidono le regioni proponibili: chiederli è più
  // onesto che offrire un elenco fisso di regioni che poi la pipeline rifiuta.
  Api.sistemaPrezzari().then((p) => {
    regioniDisponibili = Array.isArray(p) ? p : [];
    if (!form.regione && regioniDisponibili.length) form.regione = regioniDisponibili[0].regione;
    disegnaModale();
    aggiornaAnni();
  }).catch(() => {
    const hint = document.getElementById("hint-prezzari");
    if (hint) hint.textContent = "Elenco prezzari non disponibile: la regione va scritta a mano.";
    // Il campo diventa libero: meglio un input che un menu vuoto.
    const sel = document.getElementById("sel-regione");
    if (sel) {
      const input = h("input", {
        type: "text", class: "input", value: form.regione,
        placeholder: "Campania",
        onInput: (e) => { form.regione = e.target.value; aggiornaAnni(); },
      });
      sel.replaceWith(input);
    }
  });
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
