// md.js — lettura dei registri markdown prodotti dalla pipeline.
//
// I registri (gap_register.md, proposal_register.md, criteria_matrix.md,
// audit_summary.md) sono scritti da agenti: le intestazioni di colonna
// variano nella forma ma non nel significato. Il parsing è quindi
// tollerante — si cercano le colonne per sinonimi, non per posizione — e
// non fallisce mai in modo silenzioso: se una tabella non si riconosce,
// chi chiama riceve una lista vuota e mostra lo stato "non disponibile".

const Md = (() => {

  /** Tutte le tabelle pipe presenti nel documento. */
  function tabelle(testo) {
    const righe = String(testo || "").split("\n");
    const out = [];
    let corrente = null;
    for (const riga of righe) {
      const r = riga.trim();
      if (r.startsWith("|") && r.length > 1) {
        (corrente ||= []).push(r);
      } else if (corrente) {
        out.push(corrente); corrente = null;
      }
    }
    if (corrente) out.push(corrente);

    return out.map((blocco) => {
      const celle = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const intestazioni = celle(blocco[0]);
      // La seconda riga è il separatore ---|--- solo se fatta di trattini.
      const inizio = blocco[1] && /^[\s|:-]+$/.test(blocco[1]) ? 2 : 1;
      const righeDati = blocco.slice(inizio).map(celle).filter((c) => c.some((x) => x));
      return { intestazioni, righe: righeDati };
    }).filter((t) => t.righe.length > 0);
  }

  const normalizza = (s) => String(s || "").toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]/g, "");

  /** Indice della prima colonna il cui titolo contiene uno dei sinonimi. */
  function colonna(intestazioni, sinonimi) {
    const norm = intestazioni.map(normalizza);
    for (const sin of sinonimi) {
      const s = normalizza(sin);
      const esatto = norm.indexOf(s);
      if (esatto !== -1) return esatto;
    }
    for (const sin of sinonimi) {
      const s = normalizza(sin);
      const parziale = norm.findIndex((h) => h.includes(s));
      if (parziale !== -1) return parziale;
    }
    return -1;
  }

  /** Righe della tabella come oggetti, secondo una mappa {campo: [sinonimi]}. */
  function righeMappate(tabella, mappa) {
    const indici = {};
    for (const [campo, sinonimi] of Object.entries(mappa)) {
      indici[campo] = colonna(tabella.intestazioni, sinonimi);
    }
    return tabella.righe.map((celle) => {
      const o = {};
      for (const [campo, i] of Object.entries(indici)) {
        o[campo] = i >= 0 ? ripulisci(celle[i] || "") : "";
      }
      o._celle = celle;
      return o;
    });
  }

  /** La prima tabella che contiene tutte le colonne obbligatorie. */
  function tabellaCon(testo, obbligatorie) {
    for (const t of tabelle(testo)) {
      if (obbligatorie.every((sin) => colonna(t.intestazioni, sin) !== -1)) return t;
    }
    return null;
  }

  /** Toglie enfasi, wikilink e link markdown, lasciando il testo leggibile. */
  function ripulisci(s) {
    return String(s || "")
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a, b) => (b ? b.slice(1) : a))
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*([^*]*)\*\*/g, "$1")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
      .replace(/<!--.*?-->/g, "")
      .trim();
  }

  /** Sezioni di primo/secondo livello: { livello, titolo, corpo }. */
  function sezioni(testo) {
    const righe = String(testo || "").split("\n");
    const out = [];
    let corrente = null;
    for (const riga of righe) {
      const m = /^(#{1,4})\s+(.*)$/.exec(riga);
      if (m) {
        if (corrente) out.push(corrente);
        corrente = { livello: m[1].length, titolo: ripulisci(m[2]), corpo: [] };
      } else if (corrente) {
        corrente.corpo.push(riga);
      }
    }
    if (corrente) out.push(corrente);
    return out.map((s) => ({ ...s, corpo: s.corpo.join("\n").trim() }));
  }

  /** Primi paragrafi di prosa di un documento, saltando titoli e tabelle. */
  function paragrafi(testo, max = 3) {
    const blocchi = String(testo || "").split(/\n\s*\n/);
    const out = [];
    for (const b of blocchi) {
      const t = b.trim();
      if (!t || t.startsWith("#") || t.startsWith("|") || t.startsWith("---") || t.startsWith("```")) continue;
      out.push(ripulisci(t.replace(/\n/g, " ")));
      if (out.length >= max) break;
    }
    return out;
  }

  /** Citazioni in virgolette caporali: il formato usato dagli agenti per
      riportare il testo letterale di capitolato e disciplinare. */
  function citazione(testo) {
    const m = /«([^»]{10,400})»/.exec(String(testo || ""));
    return m ? m[1].trim() : null;
  }

  /** Frontmatter YAML piatto in testa al file (solo coppie chiave: valore). */
  function frontmatter(testo) {
    const m = /^---\n([\s\S]*?)\n---/.exec(String(testo || "").trim());
    if (!m) return {};
    const out = {};
    for (const riga of m[1].split("\n")) {
      const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(riga);
      if (kv) out[kv[1]] = ripulisci(kv[2].replace(/^["']|["']$/g, ""));
    }
    return out;
  }

  /** Prima parola-chiave di severità riconosciuta nel testo. */
  function severita(s) {
    const n = normalizza(s);
    if (/alta|critica|high|bloccante/.test(n)) return "alta";
    if (/media|medium|presidiare/.test(n)) return "media";
    if (/bassa|low|conforme|minore/.test(n)) return "bassa";
    return null;
  }

  /** Decisione umana riconosciuta in una cella di stato. */
  function decisione(s) {
    const n = normalizza(s);
    if (/approvat|accettat|ok/.test(n)) return "approvata";
    if (/modific|rimandat|revision/.test(n)) return "da_modificare";
    if (/scartat|respint|rifiutat/.test(n)) return "scartata";
    return null;
  }

  // ------------------------------------------------------------------
  // Rendering completo di un documento (gara brief, audit strategico):
  // markdown → nodi DOM costruiti con UI.h, mai innerHTML — il testo
  // arriva da documenti di gara, non è fidato. Copre ciò che gli agenti
  // scrivono davvero: titoli, paragrafi, tabelle pipe, elenchi (anche a
  // due livelli), citazioni-avviso (> ALERT / > ATTENZIONE), separatori,
  // grassetto, corsivo, codice, link http(s) e wikilink [[C1]].
  // ------------------------------------------------------------------

  const RE_TAB = /^\s*\|.*\|\s*$/;
  const RE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  const RE_VOCE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const RE_TITOLO = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RE_HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
  const RE_INLINE = /(\*\*[^*]+?\*\*|\[\[[^\]]+\]\]|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|(?<![\w*])\*[^*\s][^*]*?\*(?![\w*])|(?<![\w])_[^_\s][^_]*?_(?![\w]))/g;

  /** Blocchi del documento (frontmatter escluso). */
  function blocchi(testo) {
    const righe = String(testo || "").replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/<!--[\s\S]*?-->/g, "")   // istruzioni per gli agenti, non per chi legge
      .split("\n");
    const out = [];
    let i = 0;
    const inizioBlocco = (r, succ) =>
      RE_TITOLO.test(r) || /^\s*>/.test(r) || RE_VOCE.test(r) || RE_HR.test(r) ||
      (RE_TAB.test(r) && RE_SEP.test(succ || ""));

    while (i < righe.length) {
      const r = righe[i];
      if (!r.trim()) { i++; continue; }
      let m;
      if ((m = RE_TITOLO.exec(r))) {
        out.push({ tipo: "titolo", livello: m[1].length, testo: m[2] });
        i++;
      } else if (RE_HR.test(r)) {
        out.push({ tipo: "hr" });
        i++;
      } else if (RE_TAB.test(r) && RE_SEP.test(righe[i + 1] || "")) {
        const celle = (x) => x.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const intestazioni = celle(r);
        const corpo = [];
        i += 2;
        while (i < righe.length && RE_TAB.test(righe[i])) corpo.push(celle(righe[i++]));
        out.push({ tipo: "tabella", intestazioni, corpo });
      } else if (/^\s*>/.test(r)) {
        const q = [];
        while (i < righe.length && /^\s*>/.test(righe[i])) q.push(righe[i++].replace(/^\s*>\s?/, ""));
        out.push({ tipo: "citazione", testo: q.join(" "), figli: blocchi(q.join("\n")) });
      } else if (RE_VOCE.test(r)) {
        const ordinata = /^\s*\d/.test(r);
        const voci = [];
        while (i < righe.length) {
          const x = righe[i];
          const mv = RE_VOCE.exec(x);
          if (mv) voci.push({ livello: mv[1].replace(/\t/g, "  ").length >= 2 ? 1 : 0, testo: mv[3] });
          else if (voci.length && /^\s{2,}\S/.test(x)) voci[voci.length - 1].testo += " " + x.trim();
          else break;
          i++;
        }
        out.push({ tipo: "lista", ordinata, voci });
      } else {
        const righeP = [];
        while (i < righe.length && righe[i].trim() && !inizioBlocco(righe[i], righe[i + 1])) righeP.push(righe[i++].trim());
        out.push({ tipo: "paragrafo", righe: righeP });
      }
    }
    return out;
  }

  /** Testo in linea senza formattazione markdown: per copiare o
      scaricare testo semplice da condividere. */
  function testoSemplice(t) {
    return String(t || "")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, alias) => alias || id)
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1$2").replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1$2");
  }

  /** Testo con formattazione in linea → nodi. */
  function inline(testo) {
    const { h } = UI;
    const out = [];
    let ultimo = 0;
    for (const m of String(testo || "").matchAll(RE_INLINE)) {
      if (m.index > ultimo) out.push(testo.slice(ultimo, m.index));
      const t = m[0];
      if (t.startsWith("**")) out.push(h("strong", null, inline(t.slice(2, -2))));
      else if (t.startsWith("[[")) out.push(h("span", { class: "md__ref" }, t.slice(2, -2).split("|").pop()));
      else if (t.startsWith("`")) out.push(h("code", { class: "md__code" }, t.slice(1, -1)));
      else if (t.startsWith("[")) {
        const ml = /^\[([^\]]+)\]\((.+)\)$/.exec(t);
        out.push(h("a", { href: ml[2], target: "_blank", rel: "noopener" }, ml[1]));
      } else out.push(h("em", null, inline(t.slice(1, -1))));
      ultimo = m.index + t.length;
    }
    if (ultimo < String(testo || "").length) out.push(testo.slice(ultimo));
    return out;
  }

  /** Tono di una citazione-avviso, dalla prima parola in grassetto. */
  function tonoCitazione(testo) {
    const t = String(testo || "").replace(/^[\s*_]+/, "").toUpperCase();
    if (/^(ALERT|URGENTE|BLOCCANTE)/.test(t)) return "crit";
    if (/^(ATTENZIONE|⚠|AVVISO)/.test(t)) return "warn";
    return "info";
  }

  /** Un blocco → un nodo. I separatori si omettono: dove servono, la
      separazione la fanno già le card della vista. */
  function rendiBlocco(b, opz = {}) {
    const { h, I } = UI;
    switch (b.tipo) {
      case "titolo":
        return h(`h${Math.min(6, b.livello + 1)}`, { class: `md__h md__h${b.livello}` }, inline(b.testo));
      case "hr":
        return null;
      case "tabella":
        return h("div", { class: "table-wrap md__table" },
          h("table", { class: "table" },
            h("thead", null, h("tr", null, b.intestazioni.map((c) => h("th", null, inline(c))))),
            h("tbody", null, b.corpo.map((r) =>
              h("tr", null, b.intestazioni.map((_, j) => h("td", null, inline(r[j] || ""))))))));
      case "citazione": {
        const tono = tonoCitazione(b.testo);
        return h("div", { class: `note note--${tono} md__note` },
          tono === "info" ? I.info(14) : I.triangolo(14),
          h("div", { class: "md__note-body" }, rendiBlocchi(b.figli, opz)));
      }
      case "lista": {
        const tag = b.ordinata ? "ol" : "ul";
        const radice = h(tag, { class: "md__list" });
        let ultimoLi = null;
        for (const v of b.voci) {
          const li = h("li", null, inline(v.testo));
          if (v.livello === 1 && ultimoLi) {
            let sotto = ultimoLi.querySelector(":scope > ul, :scope > ol");
            if (!sotto) { sotto = h(tag, { class: "md__list" }); ultimoLi.append(sotto); }
            sotto.append(li);
          } else {
            radice.append(li);
            ultimoLi = li;
          }
        }
        return radice;
      }
      case "paragrafo": {
        const statoAnalisi = /^\*\*Stato analisi:\*\*\s*(.*)$/i.exec(b.righe.join(" "));
        if (statoAnalisi) {
          const valore = statoAnalisi[1].trim();
          const tono = /non ancora|da analizzare|tbd/i.test(valore) ? "neu" : "ok";
          return h("p", { class: "md__stato" },
            h("span", { class: "md__stato-label" }, "Stato analisi"),
            h("span", { class: `badge badge--${tono}` }, inline(valore)));
        }
        // Righe «**Etichetta:** valore» (intestazioni dei documenti): una per riga.
        const aRighe = b.righe.length > 1 && b.righe.every((r) => /^\*\*[^*]+:\*\*/.test(r));
        const figli = [];
        b.righe.forEach((r, k) => {
          // Nelle risposte della chat (aCapo) ogni riga resta una riga.
          if (k) figli.push(aRighe || opz.aCapo ? h("br") : " ");
          figli.push(...inline(r));
        });
        return h("p", { class: aRighe ? "md__meta" : null }, figli);
      }
      default:
        return null;
    }
  }

  /** opz.aCapo: le righe di un paragrafo vanno a capo (chat), invece di
      scorrere come prosa (documenti). */
  function rendiBlocchi(lista, opz = {}) {
    return (lista || []).map((b) => rendiBlocco(b, opz)).filter(Boolean);
  }

  /** Il documento diviso per sezioni di secondo livello, ciascuna con le
      sue sottosezioni di terzo livello: la forma che le viste trasformano
      in card. `intro` è ciò che sta tra il titolo e la prima sezione. */
  function documento(testo) {
    const bs = blocchi(testo);
    let titolo = "";
    const intro = [];
    const sezioni = [];
    let sez = null, sotto = null;
    for (const b of bs) {
      if (b.tipo === "titolo" && b.livello === 1 && !titolo) { titolo = b.testo; continue; }
      if (b.tipo === "titolo" && b.livello === 2) {
        sez = { titolo: b.testo, blocchi: [], sottosezioni: [] };
        sezioni.push(sez);
        sotto = null;
        continue;
      }
      if (b.tipo === "titolo" && b.livello === 3 && sez) {
        sotto = { titolo: b.testo, blocchi: [] };
        sez.sottosezioni.push(sotto);
        continue;
      }
      if (b.tipo === "hr") continue;
      (sotto ? sotto.blocchi : sez ? sez.blocchi : intro).push(b);
    }
    return { titolo, intro, sezioni };
  }

  return {
    tabelle, tabellaCon, righeMappate, colonna, ripulisci, sezioni, paragrafi, citazione, frontmatter, severita, decisione,
    blocchi, inline, rendiBlocchi, documento, testoSemplice,
  };
})();
