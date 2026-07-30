// gara.js — logica di gara.html: stato fasi, viste per fase (Sprint
// 10.1), vista agenti, approvazioni, upload, SSE, dettaglio proposta,
// gap/proposte operatore (Sprint 10.2), deliverables (Sprint 10.3),
// chat a controllo pieno (Sprint 10.4).

const params = new URLSearchParams(location.search);
const SLUG = params.get("slug");
if (!SLUG) {
  document.body.innerHTML = "<p>Slug gara mancante nell'URL (?slug=...).</p>";
  throw new Error("slug mancante");
}
document.getElementById("g-link-grafo").href = `grafo.html?slug=${encodeURIComponent(SLUG)}`;
document.getElementById("g-link-impostazioni").href = `impostazioni.html?slug=${encodeURIComponent(SLUG)}`;

const NOMI_FASE = {
  1: "Acquisizione documenti", 2: "Estrazione requisiti", 3: "Analisi capitolato",
  4: "Ricerca soluzioni", 5: "Revisione proposte", 6: "Deliverables",
  7: "Audit e consegna",
};
const UNITA_PER_FASE = {
  1: "documento", 2: "documento", 3: "analisi", 4: "criterio",
  5: "proposta", 6: "deliverable", 7: "approvazione",
};
const GATE_UMANO = new Set([3, 5, 7]);
// Prefissi di output/ rilevanti per ogni vista (Sprint 10.1): filtra
// l'elenco file grezzo in qualcosa di leggibile per fase, senza
// duplicare la logica di generazione — resta un filtro sull'elenco già
// esposto da GET /gare/{slug}/output.
const PREFISSI_OUTPUT_PER_FASE = {
  2: ["03_criteria/criteria_matrix", "03_criteria/criteria_checklist", "03_criteria/gara_brief"],
  3: ["03_criteria/strategy_audit"],
  7: ["10_offer/"],
};

let VISTA_ATTIVA = null;

function chiaveFase(fasi, n) {
  return Object.keys(fasi || {}).find((k) => k.startsWith(`${n}_`));
}

function badgeClasse(stato) {
  return { completata: "good", errore: "crit", da_rivedere: "warn", in_esecuzione: "info" }[stato] || "na";
}

function renderBarraFasi(fasi) {
  const el = document.getElementById("g-barra");
  el.innerHTML = "";
  for (let n = 1; n <= 7; n++) {
    const k = chiaveFase(fasi, n);
    const stato = k ? fasi[k].stato : "da_eseguire";
    const div = document.createElement("div");
    div.className = "step";
    div.dataset.stato = stato;
    div.textContent = `${n}. ${NOMI_FASE[n]}`;
    div.onclick = () => mostraVista(n);
    el.appendChild(div);
  }
}

const ID_VISTA = {
  1: "v-1-acquisizione", 2: "v-2-estrazione", 3: "v-3-analisi",
  4: "v-4-soluzioni", 5: "v-5-revisione", 6: "v-6-deliverables", 7: "v-7-audit",
};

function mostraVista(n) {
  VISTA_ATTIVA = n;
  for (let i = 1; i <= 7; i++) {
    document.getElementById(ID_VISTA[i]).hidden = (i !== n);
  }
  document.querySelectorAll("#g-barra .step").forEach((el, i) => {
    el.classList.toggle("attivo", i + 1 === n);
  });
}

function renderPhaseCard(n, fasi, slug) {
  const slot = document.getElementById(`pc-${n}`);
  if (!slot) return;
  const k = chiaveFase(fasi, n);
  const corpo = k ? fasi[k] : { stato: "da_eseguire", sintesi: "" };

  const card = document.createElement("div");
  card.className = "phase-card";
  card.dataset.stato = corpo.stato;

  const azioni = document.createElement("div");
  azioni.className = "azioni";

  if (GATE_UMANO.has(n) && corpo.richiede_approvazione) {
    const bApprova = document.createElement("button");
    bApprova.textContent = "Approva";
    bApprova.onclick = async () => {
      bApprova.disabled = true;
      try { await Api.approva(slug, n); await ricarica(); }
      catch (e) { alert(`Errore: ${e.message}`); bApprova.disabled = false; }
    };
    azioni.appendChild(bApprova);
  } else if (n !== 6 && (corpo.stato === "da_eseguire" || corpo.stato === "da_rivedere")) {
    // La fase 6 (Deliverables) non ha un unico bottone esegui: ogni
    // deliverable si esegue dalla propria scheda (Sprint 10.3).
    const bEsegui = document.createElement("button");
    bEsegui.textContent = corpo.stato === "da_rivedere" ? "Riesegui" : "Esegui";
    bEsegui.onclick = async () => {
      bEsegui.disabled = true;
      try {
        if (corpo.stato === "da_rivedere") await Api.riesegui(slug, n);
        else await Api.esegui(slug, n);
        await ricarica();
      } catch (e) { alert(`Errore: ${e.message}`); bEsegui.disabled = false; }
    };
    azioni.appendChild(bEsegui);
  } else if (n !== 6 && corpo.stato === "completata") {
    const bRiesegui = document.createElement("button");
    bRiesegui.className = "ghost";
    bRiesegui.textContent = "Riesegui";
    bRiesegui.onclick = async () => {
      if (!confirm(`Rieseguire la fase ${n}? Le fasi successive completate verranno marcate "da rivedere".`)) return;
      try { await Api.riesegui(slug, n); await ricarica(); }
      catch (e) { alert(`Errore: ${e.message}`); }
    };
    azioni.appendChild(bRiesegui);
  }

  card.innerHTML = `
    <div class="numero">${n}</div>
    <div>
      <div class="titolo">${NOMI_FASE[n]} <span class="status-badge ${badgeClasse(corpo.stato)}">${corpo.stato}</span></div>
      <div class="sintesi">${corpo.sintesi || ""}</div>
    </div>
  `;
  card.appendChild(azioni);
  slot.innerHTML = "";
  slot.appendChild(card);
}

function renderAgenti(fasi, attivita) {
  const faseCorrente = VISTA_ATTIVA || (Object.keys(fasi || {}).length ? faseCorrenteNum(fasi) : 1);
  const unita = UNITA_PER_FASE[faseCorrente] || "unità";
  document.getElementById("g-agenti-titolo").textContent =
    `Agenti al lavoro — unità: ${unita}`;

  const el = document.getElementById("g-agenti");
  el.innerHTML = "";
  const attivi = (attivita && attivita.agenti_attivi) || [];
  const conclusi = ((attivita && attivita.agenti_conclusi) || []).slice(-10).reverse();

  if (attivi.length === 0 && conclusi.length === 0) {
    el.innerHTML = `<div class="agent-row"><span class="unita">Nessuna attività registrata per questa fase.</span></div>`;
    return;
  }
  [...attivi.map((a) => ({ ...a, stato: "in_corso" })),
   ...conclusi.map((a) => ({ ...a, stato: "completato" }))].forEach((a, i) => {
    const row = document.createElement("div");
    row.className = "agent-row";
    row.dataset.stato = a.stato;
    row.style.setProperty("--i", i);
    row.style.animationDelay = `calc(var(--i) * 40ms)`;
    row.innerHTML = `
      <span class="stato-dot"></span>
      <span class="agente">${a.agente}</span>
      <span class="unita">${a.descrizione || ""}</span>
    `;
    el.appendChild(row);
  });
}

function faseCorrenteNum(fasi) {
  for (let n = 1; n <= 7; n++) {
    const k = chiaveFase(fasi, n);
    if (k && fasi[k].stato !== "completata") return n;
  }
  return 7;
}

function renderElencoFile(el, file, vuoto) {
  if (file.length === 0) { el.textContent = vuoto; return; }
  el.innerHTML = "";
  file.forEach((f) => {
    const a = document.createElement("a");
    a.href = Api.percorsoOutput(SLUG, f); a.target = "_blank"; a.textContent = f;
    const div = document.createElement("div");
    div.appendChild(a);
    el.appendChild(div);
  });
}

async function renderOutput(slug) {
  let file;
  try {
    file = await Api.elencoOutput(slug);
  } catch (e) {
    document.getElementById("g-output-estrazione").textContent = `Errore: ${e.message}`;
    return;
  }
  // Preferisci il gemello HTML in 11_view/ quando esiste (design system incluso).
  const soloMd = file.filter((f) => f.endsWith(".md") && !f.startsWith("11_view/"));
  const conGemello = soloMd.map((f) => {
    const gemello = `11_view/${f.replace(/\.md$/, ".html")}`;
    return file.includes(gemello) ? gemello : f;
  });

  const perPrefisso = (prefissi) => conGemello.filter((f) =>
    prefissi.some((p) => f.replace(/^11_view\//, "").startsWith(p)));

  renderElencoFile(document.getElementById("g-output-estrazione"),
    perPrefisso(PREFISSI_OUTPUT_PER_FASE[2]), "Nessun output ancora — esegui la Fase 1/2.");
  renderElencoFile(document.getElementById("g-output-analisi"),
    perPrefisso(PREFISSI_OUTPUT_PER_FASE[3]), "Nessun output ancora — esegui l'analisi strategica.");
  renderElencoFile(document.getElementById("g-output-finale"),
    perPrefisso(PREFISSI_OUTPUT_PER_FASE[7]), "Nessun elaborato prodotto ancora.");
}

async function renderDocumenti(slug) {
  const el = document.getElementById("g-documenti");
  try {
    const doc = await Api.elencoDocumenti(slug);
    if (doc.length === 0) { el.textContent = "Nessun documento caricato ancora."; return; }
    el.innerHTML = "";
    doc.forEach((d) => {
      const div = document.createElement("div");
      div.innerHTML = `<span class="status-badge na">${d.categoria}</span> ${d.nome_file} <span class="sub">${d.caricato_il}</span>`;
      el.appendChild(div);
    });
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

// ── Sprint 10.2 — gap list + proposte del professionista ────────────
function parseTabellaGap(md) {
  const righe = md.split("\n").filter((r) => r.trim().startsWith("|"));
  if (righe.length < 2) return [];
  return righe.slice(2).map((r) => {
    const celle = r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    return { id: celle[0] || "", titolo: celle[1] || "", criterio: celle[2] || "",
      fonte: celle[3] || "", confidenza: celle[4] || "", proposta: celle[5] || "" };
  }).filter((g) => g.id);
}

async function renderGapLista(slug) {
  const el = document.getElementById("g-gap-lista");
  try {
    const testo = await fetch(Api.percorsoOutput(slug, "06_registers/gap_register.md")).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    });
    const gap = parseTabellaGap(testo);
    if (gap.length === 0) { el.textContent = "Nessun gap trovato in gap_register.md."; return; }
    el.innerHTML = "";
    gap.forEach((g) => {
      const div = document.createElement("div");
      div.className = "agent-row";
      div.innerHTML = `
        <span class="agente">${g.id}</span>
        <span class="unita">${g.titolo} — ${g.criterio} · <span class="sub">${g.fonte}</span> ·
          confidenza ${g.confidenza} ·
          ${g.proposta && g.proposta !== "—" ? `proposta <strong>${g.proposta}</strong>` : "nessuna proposta collegata"}
        </span>
      `;
      el.appendChild(div);
    });
  } catch (e) {
    el.textContent = `Registro gap non ancora disponibile (${e.message}).`;
  }
}

async function renderProposteOperatore(slug) {
  const el = document.getElementById("g-proposte-operatore");
  try {
    const proposte = await Api.elencoProposteOperatore(slug);
    if (proposte.length === 0) { el.textContent = "Nessuna proposta suggerita ancora."; return; }
    el.innerHTML = "";
    proposte.forEach((p) => {
      const div = document.createElement("div");
      div.className = "agent-row";
      const statoBadge = p.stato === "valutata"
        ? `<span class="status-badge ${badgeClasse(p.esito_audit === 'scartata' ? 'errore' : 'completata')}">${p.esito_audit || p.stato}</span>`
        : `<span class="status-badge info">in attesa di analisi</span>`;
      div.innerHTML = `
        <span class="agente">${p.criterio}${p.gap_id ? ` · ${p.gap_id}` : ""}</span>
        <span class="unita">${p.titolo} ${statoBadge}</span>
      `;
      el.appendChild(div);
    });
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

document.getElementById("form-proposta-operatore").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const esito = document.getElementById("proposta-operatore-esito");
  esito.hidden = false; esito.className = "esito"; esito.textContent = "Invio…";
  try {
    await Api.creaPropostaOperatore(SLUG, {
      criterio: form.get("criterio"),
      gap_id: form.get("gap_id") || null,
      titolo: form.get("titolo"),
      descrizione: form.get("descrizione"),
    });
    esito.textContent = "Proposta inviata. Verrà valutata insieme a quelle del sistema alla prossima analisi del criterio.";
    esito.classList.add("good");
    ev.target.reset();
    renderProposteOperatore(SLUG);
  } catch (e) {
    esito.textContent = `Errore: ${e.message}`; esito.classList.add("crit");
  }
});

// ── Sprint 10.3 — deliverables come workspace separati ──────────────
function badgeStatoDeliverable(stato) {
  return { completata: "good", errore: "crit", da_rivedere: "warn", in_esecuzione: "info" }[stato] || "na";
}

async function renderDeliverables(slug) {
  const el = document.getElementById("g-deliverables");
  try {
    const deliverables = await Api.elencoDeliverables(slug);
    if (deliverables.length === 0) {
      el.textContent = "Nessun deliverable ancora — disponibile dopo l'analisi del disciplinare (Fase 1).";
      return;
    }
    el.innerHTML = "";
    deliverables.forEach((d) => {
      const card = document.createElement("div");
      card.className = "deliverable-card";
      card.dataset.stato = d.stato;

      const azioni = document.createElement("div");
      azioni.className = "azioni";
      if (d.stato === "da_eseguire" || d.stato === "da_rivedere") {
        const b = document.createElement("button");
        b.textContent = d.stato === "da_rivedere" ? "Riesegui" : "Esegui";
        b.onclick = async () => {
          b.disabled = true;
          try { await Api.eseguiDeliverable(slug, d.id); await ricarica(); }
          catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; }
        };
        azioni.appendChild(b);
      } else if (d.stato === "completata" || d.stato === "errore") {
        const b = document.createElement("button");
        b.className = "ghost";
        b.textContent = "Riesegui";
        b.onclick = async () => {
          try { await Api.rieseguiDeliverable(slug, d.id); await ricarica(); }
          catch (e) { alert(`Errore: ${e.message}`); }
        };
        azioni.appendChild(b);
      }

      card.innerHTML = `
        <div class="titolo">${d.nome} <span class="status-badge ${badgeStatoDeliverable(d.stato)}">${d.stato}</span></div>
        <div class="sub">Tipo: ${d.tipo} · Criterio: ${d.criterio} · Agente: ${d.agente}</div>
        <div class="sub">Vincolo formato: ${d.vincolo_formato || "—"} · Fonte: ${d.fonte || "—"}</div>
      `;
      card.appendChild(azioni);
      el.appendChild(card);
    });
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

// ── Fase 5 — revisione proposte (Sprint 10.1: click → dettaglio) ────
function parseTabellaProposte(md) {
  const righe = md.split("\n").filter((r) => r.trim().startsWith("|"));
  if (righe.length < 2) return [];
  const dati = righe.slice(2);
  return dati.map((r) => {
    const celle = r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    return { id: celle[0] || "", titolo: celle[1] || "", criterio: celle[2] || "", stato: celle[3] || "" };
  }).filter((p) => p.id);
}

async function apriDettaglioProposta(id) {
  const overlay = document.getElementById("modale-proposta");
  const corpo = document.getElementById("modale-proposta-corpo");
  overlay.hidden = false;
  corpo.innerHTML = "Caricamento…";
  try {
    const d = await Api.dettaglioProposta(SLUG, id);
    const fm = d.frontmatter || {};
    corpo.innerHTML = `
      <h2>${fm.id || id} — ${fm.titolo || ""}</h2>
      <p class="sub">Criterio ${fm.criterio || "—"}${fm.sottocriterio ? ` · Sottocriterio ${fm.sottocriterio}` : ""} ·
        Stato <span class="status-badge ${badgeClasse(fm.stato === 'approvata' ? 'completata' : fm.stato)}">${fm.stato || "—"}</span> ·
        Confidenza ${fm.confidence || "—"} ·
        Punteggio stimato ${fm.punteggio_stimato ?? "—"}</p>
      <pre class="output-block">${(d.corpo || "").replace(/</g, "&lt;")}</pre>
      ${fm.feedback_professionista ? `<p><strong>Nota del professionista:</strong> ${fm.feedback_professionista}</p>` : ""}
    `;
  } catch (e) {
    corpo.innerHTML = `<p class="sub">Dettaglio non ancora disponibile (${e.message}). Sarà consultabile dopo l'elaborazione del feedback (/process_feedback).</p>`;
  }
}

document.getElementById("modale-chiudi").addEventListener("click", () => {
  document.getElementById("modale-proposta").hidden = true;
});
document.getElementById("modale-proposta").addEventListener("click", (ev) => {
  if (ev.target.id === "modale-proposta") ev.currentTarget.hidden = true;
});

async function renderRevisioneProposte(slug, fasi) {
  const sezione = document.getElementById("g-revisione");
  const k5 = chiaveFase(fasi, 5);
  const richiedeApprovazione = k5 && fasi[k5].richiede_approvazione;
  if (!richiedeApprovazione) { sezione.hidden = true; return; }
  sezione.hidden = false;

  const contenitore = document.getElementById("g-proposte");
  try {
    const testo = await fetch(Api.percorsoOutput(slug, "06_registers/proposal_register.md")).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    });
    const proposte = parseTabellaProposte(testo);
    if (proposte.length === 0) {
      contenitore.textContent = "Nessuna proposta trovata in proposal_register.md (o formato inatteso).";
      return;
    }
    contenitore.innerHTML = "";
    proposte.forEach((p) => {
      const riga = document.createElement("div");
      riga.className = "agent-row";
      const link = document.createElement("a");
      link.href = "javascript:void(0)"; link.className = "agente"; link.textContent = p.id;
      link.onclick = () => apriDettaglioProposta(p.id);
      riga.appendChild(link);
      const unita = document.createElement("span");
      unita.className = "unita";
      unita.innerHTML = `${p.titolo} — ${p.criterio} <span class="status-badge na">${p.stato}</span>`;
      riga.appendChild(unita);

      const nota = document.createElement("input");
      nota.placeholder = "Nota (opzionale)";
      nota.style.width = "12rem";

      const bottone = (label, decisione, classe) => {
        const b = document.createElement("button");
        b.textContent = label; b.className = classe || "";
        b.onclick = async () => {
          b.disabled = true;
          try {
            await Api.registraApprovazione(slug, {
              fase: 5, tipo: "proposta", riferimento: p.id, decisione, nota: nota.value || null,
            });
            b.textContent = "Registrato ✓";
          } catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; }
        };
        return b;
      };
      riga.appendChild(nota);
      riga.appendChild(bottone("Approva", "approvata"));
      riga.appendChild(bottone("Da modificare", "da_modificare", "ghost"));
      riga.appendChild(bottone("Scarta", "scartata", "scarta"));
      contenitore.appendChild(riga);
    });
  } catch (e) {
    contenitore.textContent = `Registro proposte non ancora disponibile (${e.message}).`;
  }
}

async function ricarica() {
  try {
    const d = await Api.dettaglioGara(SLUG);
    document.getElementById("g-nome").textContent = d.manifest.nome || SLUG;
    document.getElementById("g-meta").textContent =
      `${d.manifest.esecuzione?.modello || ""} · effort ${d.manifest.esecuzione?.effort || ""} · ` +
      `prezzario ${d.manifest.prezzario?.regione || ""} ${d.manifest.prezzario?.anno || ""}`;

    const faseN = faseCorrenteNum(d.fasi.fasi);
    const kCorr = chiaveFase(d.fasi.fasi, faseN);
    document.getElementById("g-sintesi").textContent =
      (kCorr && d.fasi.fasi[kCorr].sintesi) || `Fase corrente: ${faseN} — ${NOMI_FASE[faseN]}`;

    renderBarraFasi(d.fasi.fasi);
    if (VISTA_ATTIVA === null) mostraVista(faseN); else mostraVista(VISTA_ATTIVA);
    for (let n = 1; n <= 7; n++) renderPhaseCard(n, d.fasi.fasi, SLUG);
    renderAgenti(d.fasi.fasi, d.attivita);
    renderRevisioneProposte(SLUG, d.fasi.fasi);
  } catch (e) {
    document.getElementById("g-sintesi").textContent = `Errore nel caricare la gara: ${e.message}`;
  }
}

function chiediRiesecuzione(slug, fasiCompletate) {
  const esito = document.getElementById("upload-esito");
  if (!fasiCompletate || fasiCompletate.length === 0) return;
  const box = document.createElement("div");
  box.className = "approval-panel";
  box.style.marginTop = "0.75rem";
  box.innerHTML = `<strong>Rieseguire una fase già completata per tenere conto del nuovo documento?</strong>
    <p class="sub">Le fasi successive già completate verranno marcate "da rivedere", non cancellate.</p>`;
  fasiCompletate.forEach((n) => {
    const b = document.createElement("button");
    b.textContent = `Riesegui Fase ${n} (${NOMI_FASE[n]})`;
    b.className = "ghost";
    b.onclick = async () => {
      b.disabled = true;
      try { await Api.riesegui(slug, n); await ricarica(); b.textContent = "Riesecuzione accodata ✓"; }
      catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; }
    };
    box.appendChild(b);
  });
  esito.after(box);
}

document.getElementById("form-upload").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const esito = document.getElementById("upload-esito");
  document.querySelectorAll(".doc-upload .approval-panel").forEach((el) => el.remove());
  esito.hidden = false; esito.className = "esito"; esito.textContent = "Caricamento…";
  try {
    const r = await Api.caricaDocumento(SLUG, form.get("categoria"), form.get("file"));
    esito.textContent = r.messaggio || "Caricato."; esito.classList.add("good");
    ev.target.reset();
    chiediRiesecuzione(SLUG, r.fasi_completate_da_valutare);
    renderDocumenti(SLUG);
  } catch (e) {
    esito.textContent = `Errore: ${e.message}`; esito.classList.add("crit");
  }
});

// ── Sprint 10.4 — chat a controllo pieno ────────────────────────────
function renderMessaggioChat(ruolo, testo) {
  const storico = document.getElementById("chat-storico");
  const div = document.createElement("div");
  div.className = `chat-msg chat-msg-${ruolo}`;
  div.textContent = testo;
  storico.appendChild(div);
  storico.scrollTop = storico.scrollHeight;
}

async function caricaCronologiaChat() {
  try {
    const storia = await Api.cronologiaInterventi(SLUG);
    storia.forEach((m) => renderMessaggioChat(m.ruolo === "claude" ? "claude" : "utente", m.testo));
  } catch { /* nessuna cronologia ancora, non è un errore da mostrare */ }
}

document.getElementById("chat-toggle").addEventListener("click", () => {
  const pannello = document.getElementById("chat-pannello");
  pannello.hidden = !pannello.hidden;
});

document.getElementById("chat-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = document.getElementById("chat-input");
  const messaggio = input.value.trim();
  if (!messaggio) return;
  renderMessaggioChat("utente", messaggio);
  input.value = ""; input.disabled = true;
  const attesa = document.createElement("div");
  attesa.className = "chat-msg chat-msg-claude chat-attesa";
  attesa.textContent = "Sto lavorando…";
  document.getElementById("chat-storico").appendChild(attesa);
  try {
    const r = await Api.intervento(SLUG, messaggio);
    attesa.remove();
    renderMessaggioChat("claude", r.risposta);
  } catch (e) {
    attesa.remove();
    renderMessaggioChat("claude", `Errore: ${e.message}`);
  } finally {
    input.disabled = false;
    input.focus();
  }
});

// SSE: aggiornamento live di fasi/attivita senza ricaricare la pagina.
function avviaStream() {
  const es = new EventSource(Api.streamUrl(SLUG));
  es.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      renderBarraFasi(payload.fasi.fasi || {});
      for (let n = 1; n <= 7; n++) renderPhaseCard(n, payload.fasi.fasi || {}, SLUG);
      renderAgenti(payload.fasi.fasi || {}, payload.attivita);
    } catch { /* payload malformato: ignora questo evento, il prossimo arriverà */ }
  };
  es.onerror = () => { /* riconnessione automatica gestita dal browser (EventSource) */ };
}

ricarica();
renderOutput(SLUG);
renderDocumenti(SLUG);
renderGapLista(SLUG);
renderProposteOperatore(SLUG);
renderDeliverables(SLUG);
caricaCronologiaChat();
avviaStream();
