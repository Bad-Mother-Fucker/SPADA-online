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

  return { tabelle, tabellaCon, righeMappate, colonna, ripulisci, sezioni, paragrafi, citazione, frontmatter, severita, decisione };
})();
