// ui.js — fondamenta condivise del frontend: costruzione DOM, icone SVG,
// tema, toast e formattazione. Nessuna dipendenza esterna, nessun build.
//
// Il DOM si costruisce con h(), non con innerHTML: i nomi di gara e i
// messaggi arrivano da file caricati dall'utente e non vanno mai
// interpretati come markup.

const UI = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Nodo DOM. props: attributi HTML + on<Event> + style/dataset oggetto. */
  function h(tag, props, ...figli) {
    const el = document.createElement(tag);
    applica(el, props);
    aggiungi(el, figli);
    return el;
  }

  /** Come h(), ma nel namespace SVG (necessario per <svg>, <path>, …). */
  function s(tag, props, ...figli) {
    const el = document.createElementNS(SVG_NS, tag);
    applica(el, props, true);
    aggiungi(el, figli);
    return el;
  }

  function applica(el, props, isSvg) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") { el.setAttribute("class", v); continue; }
      if (k === "style" && typeof v === "object") { Object.assign(el.style, v); continue; }
      if (k === "dataset") { Object.assign(el.dataset, v); continue; }
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
        continue;
      }
      if (!isSvg && (k === "value" || k === "checked" || k === "disabled" || k === "hidden")) {
        el[k] = v;
        if (k === "disabled" && v) el.setAttribute("disabled", "");
        if (k === "hidden" && v) el.setAttribute("hidden", "");
        continue;
      }
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }

  function aggiungi(el, figli) {
    for (const f of figli.flat(Infinity)) {
      if (f === null || f === undefined || f === false || f === "") continue;
      el.appendChild(f instanceof Node ? f : document.createTextNode(String(f)));
    }
  }

  /** Svuota un contenitore e ci mette i nodi passati. */
  function set(contenitore, ...figli) {
    contenitore.replaceChildren();
    aggiungi(contenitore, figli);
    return contenitore;
  }

  // ------------------------------------------------------------------
  // Icone. Tratto 1.3–1.7, viewBox stretti: il design le usa a 10–22 px,
  // dove un tratto sottile sparisce.
  // ------------------------------------------------------------------
  const I = {
    stella: (n = 13) => s("svg", { width: n, height: n, viewBox: "0 0 16 16", "aria-hidden": "true" },
      s("path", { d: "M8 1.5 L10 6 L14.5 8 L10 10 L8 14.5 L6 10 L1.5 8 L6 6 Z", fill: "var(--accent-ink)", opacity: "0.92" })),
    scintilla: (n = 11) => s("svg", { width: n, height: n, viewBox: "0 0 13 13", "aria-hidden": "true" },
      s("path", { d: "M6.5 1.4l1.5 3.6 3.6 1.5-3.6 1.5-1.5 3.6-1.5-3.6L1.4 6.5l3.6-1.5z", fill: "currentColor" })),
    piu: (n = 13) => s("svg", { width: n, height: n, viewBox: "0 0 13 13", "aria-hidden": "true" },
      s("path", { d: "M6.5 2v9M2 6.5h9", stroke: "currentColor", "stroke-width": "1.6" })),
    lente: (n = 13) => s("svg", { width: n, height: n, viewBox: "0 0 13 13", "aria-hidden": "true" },
      s("circle", { cx: "5.5", cy: "5.5", r: "3.8", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }),
      s("path", { d: "M8.4 8.4l3 3", stroke: "currentColor", "stroke-width": "1.4" })),
    chiudi: (n = 11) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("path", { d: "M2.4 2.4l6.2 6.2M8.6 2.4l-6.2 6.2", stroke: "currentColor", "stroke-width": "1.5" })),
    spunta: (n = 12) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("path", { d: "M1.6 6l2.6 2.6L9.4 3", fill: "none", stroke: "currentColor", "stroke-width": "1.7" })),
    croce: (n = 12) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("path", { d: "M2.4 2.4l6.2 6.2M8.6 2.4l-6.2 6.2", stroke: "currentColor", "stroke-width": "1.6" })),
    avviso: (n = 12) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("circle", { cx: "5.5", cy: "5.5", r: "4.4", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }),
      s("path", { d: "M5.5 3.2v2.6", stroke: "currentColor", "stroke-width": "1.3" })),
    info: (n = 14) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("circle", { cx: "5.5", cy: "5.5", r: "4.4", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }),
      s("path", { d: "M5.5 5v2.6", stroke: "currentColor", "stroke-width": "1.3" }),
      s("circle", { cx: "5.5", cy: "3.3", r: "0.7", fill: "currentColor" })),
    triangolo: (n = 15) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("path", { d: "M5.5 1l4.5 8.5H1z", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }),
      s("path", { d: "M5.5 4.2v2.2", stroke: "currentColor", "stroke-width": "1.3" })),
    tratteggio: (n = 12) => s("svg", { width: n, height: n, viewBox: "0 0 11 11", "aria-hidden": "true" },
      s("circle", { cx: "5.5", cy: "5.5", r: "4.2", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-dasharray": "2 2" })),
    freccia: (n = 10) => s("svg", { width: n, height: n, viewBox: "0 0 10 10", "aria-hidden": "true" },
      s("path", { d: "M3 1l4 4-4 4", fill: "none", stroke: "currentColor", "stroke-width": "1.5" })),
    indietro: (n = 10) => s("svg", { width: n, height: n, viewBox: "0 0 10 10", "aria-hidden": "true" },
      s("path", { d: "M6.5 1L2.5 5l4 4", fill: "none", stroke: "currentColor", "stroke-width": "1.5" })),
    grafo: (n = 11) => s("svg", { width: n, height: n, viewBox: "0 0 12 12", "aria-hidden": "true" },
      s("circle", { cx: "2.5", cy: "6", r: "1.6", fill: "currentColor" }),
      s("circle", { cx: "9.5", cy: "2.6", r: "1.6", fill: "currentColor" }),
      s("circle", { cx: "9.5", cy: "9.4", r: "1.6", fill: "currentColor" }),
      s("path", { d: "M4 5.2l4-2M4 6.8l4 2", stroke: "currentColor", "stroke-width": "1" })),
    codice: (n = 13) => s("svg", { width: n, height: n, viewBox: "0 0 14 14", "aria-hidden": "true" },
      s("path", { d: "M5 4.4L1.8 7 5 9.6M9 4.4L12.2 7 9 9.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3" })),
    invia: (n = 14) => s("svg", { width: n, height: n, viewBox: "0 0 14 14", "aria-hidden": "true" },
      s("path", { d: "M2 7h9M7.5 3.5L11 7l-3.5 3.5", fill: "none", stroke: "currentColor", "stroke-width": "1.5" })),
    chat: (n = 15) => s("svg", { width: n, height: n, viewBox: "0 0 14 14", "aria-hidden": "true" },
      s("path", { d: "M12.5 8.5a2 2 0 01-2 2H5l-3.5 2.5V3a2 2 0 012-2h7a2 2 0 012 2z", fill: "none", stroke: "currentColor", "stroke-width": "1.4" })),
    lucchetto: (n = 16) => s("svg", { width: n, height: n, viewBox: "0 0 14 14", "aria-hidden": "true" },
      s("rect", { x: "2.5", y: "6", width: "9", height: "6", rx: "1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }),
      s("path", { d: "M4.6 6V4.4a2.4 2.4 0 014.8 0V6", fill: "none", stroke: "currentColor", "stroke-width": "1.3" })),
    carica: (n = 22) => s("svg", { width: n, height: n, viewBox: "0 0 22 22", "aria-hidden": "true" },
      s("path", { d: "M11 15V4m0 0L7 8m4-4l4 4", fill: "none", stroke: "currentColor", "stroke-width": "1.5" }),
      s("path", { d: "M3 14v3a2 2 0 002 2h12a2 2 0 002-2v-3", fill: "none", stroke: "currentColor", "stroke-width": "1.5" })),
    scarica: (n = 11) => s("svg", { width: n, height: n, viewBox: "0 0 12 12", "aria-hidden": "true" },
      s("path", { d: "M6 1.5v6m0 0L3.4 5M6 7.5L8.6 5", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }),
      s("path", { d: "M2 9.2h8", stroke: "currentColor", "stroke-width": "1.4" })),
    documento: (n = 20) => s("svg", { width: n, height: n, viewBox: "0 0 20 20", "aria-hidden": "true" },
      s("rect", { x: "3", y: "2.5", width: "14", height: "15", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }),
      s("path", { d: "M6.5 7h7M6.5 10h7M6.5 13h4", stroke: "currentColor", "stroke-width": "1.4" })),
    pagina: (n = 9) => s("svg", { width: n, height: n, viewBox: "0 0 10 10", "aria-hidden": "true" },
      s("rect", { x: "1.5", y: "0.8", width: "7", height: "8.4", rx: "1", fill: "none", stroke: "currentColor", "stroke-width": "1" })),
    tabella: (n = 18) => s("svg", { width: n, height: n, viewBox: "0 0 18 18", "aria-hidden": "true" },
      s("rect", { x: "2", y: "3", width: "14", height: "12", rx: "1.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }),
      s("path", { d: "M2 7h14M7 7v8M11.5 7v8", stroke: "currentColor", "stroke-width": "1.3" })),
  };

  /** Pallino di stato. Non compare mai da solo: sta accanto a un'etichetta. */
  const punto = (pulse) => h("span", { class: pulse ? "dot dot--pulse" : "dot", "aria-hidden": "true" });

  // ------------------------------------------------------------------
  // Tema. data-theme sull'<html>, preferenza in localStorage. "auto"
  // significa nessun attributo: decide prefers-color-scheme.
  // ------------------------------------------------------------------
  const Tema = {
    CHIAVE: "spada.tema",
    leggi() {
      try { return localStorage.getItem(this.CHIAVE) || "auto"; } catch { return "auto"; }
    },
    applica(valore) {
      const r = document.documentElement;
      if (valore === "auto") r.removeAttribute("data-theme");
      else r.setAttribute("data-theme", valore);
      try { localStorage.setItem(this.CHIAVE, valore); } catch { /* storage negato: tema solo per questa sessione */ }
      document.querySelectorAll("[data-tema-btn]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.temaBtn === this.effettivo()));
      });
    },
    /** Quale dei due temi è realmente in uso adesso. */
    effettivo() {
      const v = this.leggi();
      if (v !== "auto") return v;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    /** Da chiamare prima del primo paint per non mostrare il tema sbagliato. */
    init() {
      const v = this.leggi();
      if (v !== "auto") document.documentElement.setAttribute("data-theme", v);
    },
    /** Il controllo segmentato Chiaro/Scuro presente in ogni barra. */
    controllo() {
      const attuale = this.effettivo();
      const btn = (id, label) => h("button", {
        type: "button",
        class: "seg__btn",
        "data-tema-btn": id,
        "aria-pressed": String(attuale === id),
        onClick: () => Tema.applica(id),
      }, label);
      return h("div", { class: "seg", role: "group", "aria-label": "Tema" },
        btn("light", "Chiaro"), btn("dark", "Scuro"));
    },
  };

  // ------------------------------------------------------------------
  // Toast: conferme non bloccanti. Sostituiscono alert(), che interrompe
  // il lavoro e non si può leggere accanto a ciò che è appena cambiato.
  // ------------------------------------------------------------------
  const Toast = {
    contenitore() {
      let c = document.querySelector(".toasts");
      if (!c) {
        c = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
        document.body.appendChild(c);
      }
      return c;
    },
    mostra(testo, tono = "ok", durata = 5000) {
      const icona = tono === "crit" ? I.croce(13) : tono === "warn" ? I.avviso(13) : I.spunta(13);
      icona.style.flex = "none";
      icona.style.marginTop = "2px";
      icona.style.color = `var(--${tono === "ok" ? "ok" : tono})`;
      const t = h("div", { class: `toast toast--${tono}` }, icona, h("span", null, testo));
      this.contenitore().appendChild(t);
      setTimeout(() => t.remove(), durata);
      return t;
    },
    ok: (t) => Toast.mostra(t, "ok"),
    errore: (t) => Toast.mostra(t, "crit", 9000),
    avviso: (t) => Toast.mostra(t, "warn", 7000),
  };

  // ------------------------------------------------------------------
  // Formattazione
  // ------------------------------------------------------------------

  /** "18 min fa", "ieri", "3 h fa". Torna "—" su input non parsabile. */
  function quandoRelativo(iso) {
    if (!iso) return "—";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "—";
    const sec = Math.round((Date.now() - t) / 1000);
    if (sec < 0) return "tra poco";
    if (sec < 60) return `${sec} s fa`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min fa`;
    const ore = Math.round(min / 60);
    if (ore < 24) return `${ore} h fa`;
    const gg = Math.round(ore / 24);
    if (gg === 1) return "ieri";
    if (gg < 30) return `${gg} g fa`;
    return new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /** "29/07 10:02" — il formato usato nello storico esecuzioni. */
  function quandoBreve(iso) {
    if (!iso) return "—";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return String(iso);
    return new Date(t).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    }).replace(",", "");
  }

  /** Scadenza in forma di distanza: "scade in 14 g", "scaduta da 2 g". */
  function scadenza(iso) {
    if (!iso) return "scadenza non indicata";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return String(iso);
    const gg = Math.ceil((t - Date.now()) / 86400000);
    if (gg < 0) return `scaduta da ${Math.abs(gg)} g`;
    if (gg === 0) return "scade oggi";
    return `scade in ${gg} g`;
  }

  function byte(n) {
    if (!Number.isFinite(n)) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  }

  /** Durata in secondi → "13m 41s". */
  function durata(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    const m = Math.floor(sec / 60);
    const s2 = Math.round(sec % 60);
    return m > 0 ? `${m}m ${String(s2).padStart(2, "0")}s` : `${s2}s`;
  }

  /** Plurale semplice: 1 prova / 2 prove. */
  const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

  /** Slug dal nome: minuscolo, senza accenti, trattini singoli, max 48. */
  function slugify(t) {
    return String(t || "").toLowerCase()
      .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
      .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }

  /** Tiene il focus dentro un overlay e invoca `alEsc` su Escape.
      Restituisce `rilascia()`: stacca il listener e riporta il focus dov'era.
      Chiudere davvero l'overlay spetta a chi chiama — la trappola non sa
      come si chiude, e non deve deciderlo. */
  function trappolaFocus(elemento, alEsc) {
    const precedente = document.activeElement;
    const focusabili = () => elemento.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); if (alEsc) alEsc(); return; }
      if (e.key !== "Tab") return;
      const f = focusabili();
      if (!f.length) return;
      const primo = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    const primo = focusabili()[0];
    if (primo) primo.focus();

    return function rilascia() {
      document.removeEventListener("keydown", onKey, true);
      if (precedente && precedente.focus) precedente.focus();
    };
  }

  return { h, s, set, I, punto, Tema, Toast, quandoRelativo, quandoBreve, scadenza, byte, durata, plurale, slugify, trappolaFocus };
})();

// Il tema va deciso prima del primo paint: questo file è caricato in <head>.
UI.Tema.init();
