// gara.js — guscio persistente della pagina gara + router per le viste
// (7 fasi, Grafo, Attività, Impostazioni), redesign "Liquid Glass".
//
// Architettura (vedi Schema Navigazione.dc.html nell'esportazione di
// design): un solo guscio (barra applicativa, intestazione gara,
// stepper, assistente flottante) che non si ricarica mai; un'area
// centrale che cambia in base all'hash dell'URL. Lo stream SSE si apre
// una volta sola qui, non per-vista.
//
// URL per vista (hash-routing, coerente con lo stack senza build):
//   #/fase/<n>
//   #/fase/5/proposta/<id>
//   #/fase/6/deliverable/<percorso-output-incodificato>
//   #/grafo[?tipo=<tipo>]
//   #/attivita
//   #/impostazioni

const params = new URLSearchParams(location.search);
const SLUG = params.get("slug");
if (!SLUG) {
  document.body.innerHTML = "<p style='padding:2rem'>Slug gara mancante nell'URL (?slug=...).</p>";
  throw new Error("slug mancante");
}

const NOMI_FASE = {
  1: "Acquisizione documenti", 2: "Estrazione requisiti", 3: "Analisi capitolato",
  4: "Ricerca soluzioni", 5: "Revisione proposte", 6: "Deliverables",
  7: "Audit e consegna",
};
const KICKER_FASE = {
  1: "Fase 1 · acquisizione", 2: "Fase 2 · requisiti", 3: "Fase 3 · analisi",
  4: "Fase 4 · gap e prove", 5: "Fase 5 · checkpoint umano", 6: "Fase 6 · deliverables",
  7: "Fase 7 · audit di consegna",
};
const SUB_FASE_FASI = {
  1: "Categorie separate perché la pipeline le tratta in modo diverso: il disciplinare guida i requisiti, gli elaborati l'analisi tecnica, i P7M richiedono verifica di firma.",
  2: "Ogni requisito porta con sé la provenienza puntuale. Da qui in avanti l'assistente conversazionale è attivo.",
  3: "Lettura critica del capitolato: cosa vincola l'offerta, cosa la premia, dove il testo è ambiguo.",
  4: "Distanza fra ciò che la gara richiede e ciò che l'offerta dimostra oggi, ancorata alle prove documentali.",
  5: "Decisione proposta per proposta: approvate entrano nei deliverable, rimandate tornano agli agenti con la tua nota, scartate restano nello storico.",
  6: "Elenco ricavato dal disciplinare di questa gara. Ogni deliverable ha agente e skill propri e può girare in parallelo.",
  7: "Verifica di completezza e consegnabilità del plico — non una seconda verifica delle prove, già svolta in Fase 4 e 5.",
};
// Prefissi di output/ associati a ciascuna fase (best-effort, coerente con
// DOC_TYPES di scripts/render/md_to_html.js — non tutte le fasi hanno una
// cartella propria).
const FASE_OUTPUT_PREFIX = {
  1: [], 2: ["02_graph/"], 3: ["03_criteria/"], 4: ["04_doc_summaries/"],
  5: ["05_criteria_outputs/", "06_registers/"], 6: ["10_offer/"], 7: ["07_questions/"],
};
const GATE_UMANO = new Set([3, 5, 7]);

const STATO_BADGE = { completata: "good", errore: "crit", da_rivedere: "accent", in_esecuzione: "info", da_eseguire: "na" };
const STATO_LABEL = { completata: "Completata", errore: "Errore", da_rivedere: "Da rivedere", in_esecuzione: "In esecuzione", da_eseguire: "Da eseguire" };

// ── Stato applicativo in memoria ────────────────────────────────────
const S = {
  dato: null,           // ultima risposta di Api.dettaglioGara
  route: null,           // { view, fase, sub, subId, query }
  assistantOpen: false,
  assistantMsgs: [],
  assistantBusy: false,
  sseOk: false,
  outputCache: null,
};

// ══════════════════════ ROUTER (hash) ═══════════════════════════════
function parseRoute() {
  let h = location.hash.replace(/^#\/?/, "");
  let query = new URLSearchParams();
  const qIdx = h.indexOf("?");
  if (qIdx >= 0) { query = new URLSearchParams(h.slice(qIdx + 1)); h = h.slice(0, qIdx); }
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "fase" && parts[1]) {
    const fase = Number(parts[1]);
    if (parts[2] === "proposta" && parts[3]) return { view: "fase", fase, sub: "proposta", subId: decodeURIComponent(parts[3]), query };
    if (parts[2] === "deliverable" && parts[3]) return { view: "fase", fase, sub: "deliverable", subId: decodeURIComponent(parts[3]), query };
    return { view: "fase", fase, query };
  }
  if (parts[0] === "grafo") return { view: "grafo", query };
  if (parts[0] === "attivita") return { view: "attivita", query };
  if (parts[0] === "impostazioni") return { view: "impostazioni", query };
  return null; // nessuna rotta esplicita: si va sulla fase corrente al primo load
}

function faseCorrenteNum(fasi) {
  for (let n = 1; n <= 7; n++) {
    const k = chiaveFase(fasi, n);
    if (k && fasi[k].stato !== "completata") return n;
  }
  return 7;
}

function chiaveFase(fasi, n) {
  return Object.keys(fasi || {}).find((k) => k.startsWith(`${n}_`));
}

function navigate(hash) { location.hash = hash; }

window.addEventListener("hashchange", () => { S.route = parseRoute() || S.route; renderAll(); });

// ══════════════════════ CARICAMENTO DATI ════════════════════════════
async function ricarica(mostraErrorePagina) {
  try {
    const d = await Api.dettaglioGara(SLUG);
    S.dato = d;
    S.outputCache = null;
    if (!S.route) {
      const fc = faseCorrenteNum(d.fasi.fasi || {});
      S.route = { view: "fase", fase: fc, query: new URLSearchParams() };
      location.hash = `#/fase/${fc}`;
    }
    renderAll();
  } catch (e) {
    if (mostraErrorePagina) {
      document.querySelector(".page").innerHTML = `
        <div class="error-state">
          <h3>Non riesco a caricare questa gara</h3>
          <p>${e.message}</p>
          <button type="button" class="ghost" onclick="location.reload()">Riprova</button>
        </div>`;
    }
  }
}

// ══════════════════════ GUSCIO: barra applicativa ═══════════════════
function renderCrumb() {
  document.getElementById("g-crumb-slug").textContent = SLUG;
  const r = S.route;
  const nomi = { grafo: "Grafo", attivita: "Attività", impostazioni: "Impostazioni" };
  let testo = "—";
  if (r) {
    if (r.view === "fase") {
      testo = `Fase ${r.fase}${r.sub === "proposta" ? ` / proposta ${r.subId}` : r.sub === "deliverable" ? ` / deliverable` : ""}`;
    } else testo = nomi[r.view] || r.view;
  }
  document.getElementById("g-crumb-vista").textContent = testo;
}

function renderTools() {
  const el = document.getElementById("g-tools");
  const r = S.route;
  const tools = [
    ["grafo", "Grafo", "#/grafo"],
    ["attivita", "Attività", "#/attivita"],
    ["impostazioni", "Impostazioni", "#/impostazioni"],
  ];
  el.innerHTML = "";
  tools.forEach(([key, label, hash]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tool-btn";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(r && r.view === key));
    b.onclick = () => navigate(hash);
    el.appendChild(b);
  });
}

function renderHeader() {
  const d = S.dato; if (!d) return;
  document.getElementById("g-nome").textContent = d.manifest.nome || SLUG;
  const esec = d.manifest.esecuzione || {};
  const prezz = d.manifest.prezzario || {};
  document.getElementById("g-meta").textContent = `job più recente pipeline ${d.manifest.pipeline_version || ""}`;

  const fc = faseCorrenteNum(d.fasi.fasi || {});
  const kCorr = chiaveFase(d.fasi.fasi, fc);
  const corpo = kCorr ? d.fasi.fasi[kCorr] : {};
  const tags = document.getElementById("g-tags");
  tags.innerHTML = "";
  const badgeStato = document.createElement("span");
  badgeStato.className = `status-badge ${STATO_BADGE[corpo.stato] || "na"}`;
  badgeStato.textContent = `${STATO_LABEL[corpo.stato] || "Da eseguire"} · Fase ${fc}`;
  tags.appendChild(badgeStato);
  [SLUG, `${prezz.regione || ""} · prezzario ${prezz.anno || ""}`, `${esec.modello || ""} · ${esec.effort || ""}`].forEach((t, i) => {
    const s = document.createElement("span");
    s.className = "tag" + (i === 2 ? " mono" : "");
    s.textContent = t;
    tags.appendChild(s);
  });

  document.getElementById("g-sintesi").innerHTML =
    `<span class="kicker">Sintesi ·</span> ${(corpo.sintesi && corpo.sintesi.trim()) || `Fase corrente: ${fc} — ${NOMI_FASE[fc]}. Nessuna sintesi ancora prodotta per questa fase.`}`;
}

function renderStepper() {
  const d = S.dato; if (!d) return;
  const el = document.getElementById("g-stepper");
  el.innerHTML = "";
  const r = S.route;
  for (let n = 1; n <= 7; n++) {
    const k = chiaveFase(d.fasi.fasi, n);
    const stato = k ? d.fasi.fasi[k].stato : "da_eseguire";
    const li = document.createElement("li");
    const attivo = r && r.view === "fase" && r.fase === n;
    li.innerHTML = `
      <button type="button" aria-current="${attivo}">
        <span class="bar ${stato}"></span>
        <span class="num">${String(n).padStart(2, "0")}</span>
        <span class="title">${NOMI_FASE[n]}</span>
        <span class="status">${STATO_LABEL[stato] || "—"}</span>
      </button>`;
    li.querySelector("button").onclick = () => navigate(`#/fase/${n}`);
    el.appendChild(li);
  }
}

function renderSse() {
  const el = document.getElementById("g-sse");
  el.className = "sse-pill " + (S.sseOk ? "ok" : "off");
  el.innerHTML = `<span class="dot"></span>${S.sseOk ? "SSE connesso" : "SSE non connesso"}`;
}

// ══════════════════════ ASSISTENTE (Sprint 7, sola lettura, reale) ══
function assistenteDisponibile() {
  const d = S.dato; if (!d) return false;
  const k2 = chiaveFase(d.fasi.fasi, 2);
  return !!(k2 && d.fasi.fasi[k2].stato === "completata");
}

function renderAssistantFab() {
  const btn = document.getElementById("g-assistant-fab");
  const ok = assistenteDisponibile();
  btn.disabled = !ok;
  btn.title = ok ? "" : "Disponibile dopo il completamento della Fase 2 (costruzione del grafo di conoscenza).";
  btn.onclick = () => { S.assistantOpen = !S.assistantOpen; renderAssistantPanel(); };
}

function renderAssistantMsg(m) {
  const div = document.createElement("div");
  div.className = `chat-msg ${m.ruolo}`;
  div.innerHTML = `<div class="who">${m.ruolo === "utente" ? "Tu" : "Assistente"}</div><div class="text"></div>`;
  div.querySelector(".text").textContent = m.testo;
  return div;
}

async function apriAssistente() {
  const log = document.getElementById("g-assistant-log");
  log.innerHTML = `<p style="color:var(--ink-3);font-size:var(--fs-xs)">Caricamento cronologia…</p>`;
  try {
    const storia = await Api.cronologiaAssistente(SLUG);
    log.innerHTML = "";
    if (storia.length === 0) {
      log.innerHTML = `<p style="color:var(--ink-3);font-size:var(--fs-xs)">Nessuna conversazione ancora. Fai una domanda sulla gara qui sotto.</p>`;
    } else {
      storia.forEach((m) => log.appendChild(renderAssistantMsg(m)));
      log.scrollTop = log.scrollHeight;
    }
  } catch (e) {
    log.innerHTML = `<p style="color:var(--crit);font-size:var(--fs-xs)">Errore nel caricare la cronologia: ${e.message}</p>`;
  }
}

function renderAssistantPanel() {
  const panel = document.getElementById("g-assistant-panel");
  panel.hidden = !S.assistantOpen;
  if (S.assistantOpen) apriAssistente();
}
document.getElementById("g-assistant-close").onclick = () => { S.assistantOpen = false; renderAssistantPanel(); };
document.getElementById("g-assistant-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = document.getElementById("g-assistant-input");
  const testo = input.value.trim();
  if (!testo) return;
  const log = document.getElementById("g-assistant-log");
  log.appendChild(renderAssistantMsg({ ruolo: "utente", testo }));
  input.value = ""; input.disabled = true;
  const thinking = document.createElement("div");
  thinking.className = "chat-msg assistente";
  thinking.innerHTML = `<div class="who">Assistente</div><div class="text">Sto leggendo la gara…</div>`;
  log.appendChild(thinking);
  log.scrollTop = log.scrollHeight;
  try {
    const r = await Api.chiediAssistente(SLUG, testo);
    thinking.querySelector(".text").textContent = r.risposta;
  } catch (e) {
    thinking.querySelector(".text").textContent = `Errore: ${e.message}`;
    thinking.style.borderColor = "var(--crit-edge)";
  } finally {
    input.disabled = false; input.focus();
    log.scrollTop = log.scrollHeight;
  }
});
document.getElementById("g-vai-attivita").onclick = () => navigate("#/attivita");

// ══════════════════════ OUTPUT (elaborati prodotti, reale) ══════════
async function elencoOutputCached() {
  if (S.outputCache) return S.outputCache;
  S.outputCache = await Api.elencoOutput(SLUG);
  return S.outputCache;
}

function outputListHtml(files) {
  const soloMd = files.filter((f) => f.endsWith(".md") && !f.startsWith("11_view/"));
  if (soloMd.length === 0) return `<p style="font-size:var(--fs-xs);color:var(--ink-3);margin:0">Nessun elaborato prodotto ancora per questa fase.</p>`;
  return `<div class="file-list">${soloMd.map((f) => {
    const gemello = `11_view/${f.replace(/\.md$/, ".html")}`;
    const href = Api.percorsoOutput(SLUG, files.includes(gemello) ? gemello : f);
    return `<a class="file-row" href="${href}" target="_blank" rel="noreferrer"><span class="name">${f}</span><span style="font-family:var(--font-mono);font-size:var(--fs-micro);color:var(--ink-4)">apri ↗</span></a>`;
  }).join("")}</div>`;
}

// ══════════════════════ VISTA: FASE (generica + fase 5 reale) ═══════
function pannelloAzione(n, corpo) {
  const div = document.createElement("div");
  div.className = "card glass-surface";
  div.innerHTML = `<h3 class="eyebrow">Azione</h3><p style="margin:0 0 var(--s-3);font-size:var(--fs-sm);color:var(--ink-2)">Stato attuale: <span class="status-badge ${STATO_BADGE[corpo.stato] || 'na'}">${STATO_LABEL[corpo.stato] || 'Da eseguire'}</span></p>`;
  const azioni = document.createElement("div");
  azioni.className = "azioni";
  if (GATE_UMANO.has(n) && corpo.richiede_approvazione) {
    const b = document.createElement("button");
    b.textContent = "Approva";
    b.onclick = async () => { b.disabled = true; try { await Api.approva(SLUG, n); await ricarica(); } catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; } };
    azioni.appendChild(b);
  } else if (corpo.stato === "da_eseguire" || corpo.stato === "da_rivedere") {
    const b = document.createElement("button");
    b.textContent = corpo.stato === "da_rivedere" ? "Riesegui" : "Esegui";
    b.onclick = async () => {
      b.disabled = true;
      try { if (corpo.stato === "da_rivedere") await Api.riesegui(SLUG, n); else await Api.esegui(SLUG, n); await ricarica(); }
      catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; }
    };
    azioni.appendChild(b);
  } else if (corpo.stato === "completata") {
    const b = document.createElement("button");
    b.className = "ghost"; b.textContent = "Riesegui";
    b.onclick = async () => {
      if (!confirm(`Rieseguire la fase ${n}? Le fasi successive completate verranno marcate "da rivedere".`)) return;
      try { await Api.riesegui(SLUG, n); await ricarica(); } catch (e) { alert(`Errore: ${e.message}`); }
    };
    azioni.appendChild(b);
  } else {
    azioni.innerHTML = `<p style="margin:0;font-size:var(--fs-xs);color:var(--ink-4)">In coda: attende che la fase precedente sia completata.</p>`;
  }
  div.appendChild(azioni);
  return div;
}

function pannelloElaborati(n) {
  const div = document.createElement("div");
  div.className = "card glass-surface";
  div.innerHTML = `<h3 class="eyebrow">Elaborati di questa fase</h3><div id="g-out-fase-${n}">Caricamento…</div>`;
  elencoOutputCached().then((files) => {
    const prefissi = FASE_OUTPUT_PREFIX[n] || [];
    const filtrati = prefissi.length ? files.filter((f) => prefissi.some((p) => f.startsWith(p))) : [];
    document.getElementById(`g-out-fase-${n}`).innerHTML = outputListHtml(filtrati);
  }).catch((e) => { document.getElementById(`g-out-fase-${n}`).innerHTML = `<p style="color:var(--crit);font-size:var(--fs-xs)">Errore: ${e.message}</p>`; });
  return div;
}

function notaNonDisponibile(testo) {
  const div = document.createElement("div");
  div.className = "card";
  div.style.border = "1px dashed var(--hairline-2)";
  div.style.background = "var(--glass-2)";
  div.innerHTML = `<span class="badge-pending">non ancora disponibile lato backend</span><p style="margin:var(--s-2) 0 0;font-size:var(--fs-xs);color:var(--ink-3)">${testo}</p>`;
  return div;
}

// Fase 5 — revisione proposte, parsing minimale del registro (reale,
// stesso approccio della Sprint 6: nessun endpoint strutturato dedicato).
function parseTabellaProposte(md) {
  const righe = md.split("\n").filter((r) => r.trim().startsWith("|"));
  if (righe.length < 2) return [];
  return righe.slice(2).map((r) => {
    const celle = r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    return { id: celle[0] || "", titolo: celle[1] || "", criterio: celle[2] || "", stato: celle[3] || "" };
  }).filter((p) => p.id);
}

async function caricaProposte() {
  const testo = await fetch(Api.percorsoOutput(SLUG, "06_registers/proposal_register.md")).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.text();
  });
  return parseTabellaProposte(testo);
}

function renderElencoProposte(container, proposte) {
  const decise = proposte.filter((p) => /approvat|scartat|modific/i.test(p.stato)).length;
  const pct = proposte.length ? Math.round((decise / proposte.length) * 100) : 0;
  const wrap = document.createElement("section");
  wrap.className = "card glass-surface";
  wrap.innerHTML = `
    <div class="proposal-progress" style="margin-bottom:var(--s-4)">
      <div style="display:flex;justify-content:space-between;font-size:var(--fs-micro);color:var(--ink-3);margin-bottom:6px"><span>Proposte decise</span><span style="color:var(--ink-1);font-weight:var(--fw-semibold)">${decise} / ${proposte.length}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>
    <p style="margin:0 0 var(--s-4);font-size:var(--fs-xs);color:var(--ink-4)">Le azioni per riga servono ai casi ovvi; per il dettaglio (gap di origine, prove, storico) apri la proposta.</p>
    <div class="file-list" id="g-proposte-list"></div>`;
  container.appendChild(wrap);
  const list = wrap.querySelector("#g-proposte-list");
  if (proposte.length === 0) {
    list.innerHTML = `<p style="font-size:var(--fs-xs);color:var(--ink-3)">Nessuna proposta trovata in proposal_register.md (o formato inatteso).</p>`;
    return;
  }
  proposte.forEach((p) => {
    const riga = document.createElement("article");
    riga.className = "proposal-item";
    riga.innerHTML = `<div class="row">
      <button type="button" class="proposal-open">
        <span style="font-family:var(--font-mono);font-size:var(--fs-micro);color:var(--ink-3)">${p.id}</span>
        <span class="title">${p.titolo}</span>
        <span style="font-size:var(--fs-xs);color:var(--ink-2)">${p.criterio} · <span class="status-badge na">${p.stato || "non decisa"}</span></span>
      </button>
      <div class="decision-group"></div>
    </div>`;
    riga.querySelector(".proposal-open").onclick = () => navigate(`#/fase/5/proposta/${encodeURIComponent(p.id)}`);
    const gruppo = riga.querySelector(".decision-group");
    const nota = document.createElement("input");
    nota.placeholder = "Nota (opzionale)"; nota.style.width = "10rem";
    const bottone = (label, decisione, classe) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; if (classe) b.className = classe;
      b.onclick = async () => {
        b.disabled = true;
        try { await Api.registraApprovazione(SLUG, { fase: 5, tipo: "proposta", riferimento: p.id, decisione, nota: nota.value || null }); b.textContent = "Registrato ✓"; }
        catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; }
      };
      return b;
    };
    gruppo.appendChild(nota);
    gruppo.appendChild(bottone("Approva", "approvata"));
    gruppo.appendChild(bottone("Da modificare", "da_modificare", "ghost"));
    gruppo.appendChild(bottone("Scarta", "scartata", "scarta"));
    list.appendChild(riga);
  });
}

async function renderDettaglioProposta(container, id) {
  const wrap = document.createElement("div");
  wrap.className = "two-col";
  container.appendChild(wrap);
  const main = document.createElement("section"); main.className = "col-main";
  const side = document.createElement("aside"); side.className = "col-side";
  wrap.appendChild(main); wrap.appendChild(side);
  main.innerHTML = `<div class="card glass-surface">Caricamento proposta…</div>`;

  let proposte = [];
  try { proposte = await caricaProposte(); } catch { /* gestito sotto */ }
  const p = proposte.find((x) => x.id === id);

  main.innerHTML = "";
  const contenuto = document.createElement("div");
  contenuto.className = "card glass-surface";
  if (!p) {
    contenuto.innerHTML = `<h3 class="eyebrow">Proposta ${id}</h3><p style="font-size:var(--fs-sm);color:var(--ink-3)">Proposta non trovata nel registro (06_registers/proposal_register.md), o registro non ancora disponibile.</p>`;
  } else {
    contenuto.innerHTML = `<h3 class="eyebrow">Contenuto della proposta</h3>
      <div style="display:flex;flex-wrap:wrap;gap:var(--s-2);margin-bottom:var(--s-3)">
        <span class="status-badge na">${p.stato || "non decisa"}</span>
        <span class="tag" style="padding:3px 9px;border-radius:var(--r-pill);background:var(--wash);border:1px solid var(--hairline);font-size:var(--fs-micro);color:var(--ink-3)">${p.criterio}</span>
      </div>
      <p style="margin:0;font-family:var(--font-serif);font-size:var(--fs-md);line-height:var(--lh-md);color:var(--ink-1)">${p.titolo}</p>`;
  }
  main.appendChild(contenuto);
  main.appendChild(notaNonDisponibile("Gap di origine, prove documentali collegate e storico decisioni richiedono dati strutturati non ancora esposti da un endpoint dedicato (oggi solo il registro tabellare in Markdown è leggibile)."));

  side.innerHTML = `<div class="card glass-surface">
    <h3 class="eyebrow">Decisione</h3>
    <div style="display:flex;flex-direction:column;gap:var(--s-2);margin-bottom:var(--s-3)" id="g-detail-azioni"></div>
    <textarea rows="3" placeholder="Nota (passata all'agente in caso di rimando, sempre nello storico)" id="g-detail-nota" style="width:100%"></textarea>
  </div>`;
  const azioni = side.querySelector("#g-detail-azioni");
  const nota = side.querySelector("#g-detail-nota");
  [["Approva così com'è", "approvata"], ["Rimanda con richiesta di modifica", "da_modificare"], ["Scarta la proposta", "scartata"]].forEach(([label, decisione]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.className = decisione === "approvata" ? "" : decisione === "scartata" ? "scarta" : "ghost";
    b.onclick = async () => {
      b.disabled = true;
      try {
        await Api.registraApprovazione(SLUG, { fase: 5, tipo: "proposta", riferimento: id, decisione, nota: nota.value || null });
        b.textContent = "Registrato ✓";
      } catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; }
    };
    azioni.appendChild(b);
  });

  const back = document.createElement("button");
  back.type = "button"; back.className = "view-back"; back.hidden = false;
  back.textContent = "← Torna a tutte le proposte";
  back.onclick = () => navigate("#/fase/5");
  document.getElementById("g-back").replaceWith(back);
  back.id = "g-back";
}

async function renderFase5(container) {
  const box = document.createElement("div");
  box.className = "card glass-surface";
  box.innerHTML = "Caricamento proposte…";
  container.appendChild(box);
  try {
    const proposte = await caricaProposte();
    box.remove();
    renderElencoProposte(container, proposte);
  } catch (e) {
    box.innerHTML = `<h3 class="eyebrow">Revisione proposte</h3><p style="font-size:var(--fs-sm);color:var(--ink-3)">Registro proposte non ancora disponibile (${e.message}). Compare qui non appena la Fase 5 produce <code>06_registers/proposal_register.md</code>.</p>`;
  }
}

async function renderFase(container, n, sub, subId) {
  const d = S.dato;
  const k = chiaveFase(d.fasi.fasi, n);
  const corpo = k ? d.fasi.fasi[k] : { stato: "da_eseguire", sintesi: "" };

  document.getElementById("g-view-kicker").textContent = KICKER_FASE[n];
  document.getElementById("g-view-title").textContent = sub === "proposta" ? `Proposta ${subId}` : NOMI_FASE[n];
  document.getElementById("g-view-sub").textContent = sub === "proposta" ? "Dettaglio: gap di origine, prove, decisione e storico." : SUB_FASE_FASI[n] || "";
  const statusEl = document.getElementById("g-view-status");
  statusEl.hidden = false;
  statusEl.className = `status-badge ${STATO_BADGE[corpo.stato] || "na"}`;
  statusEl.textContent = STATO_LABEL[corpo.stato] || "Da eseguire";
  document.getElementById("g-back").hidden = sub !== "proposta";
  if (sub !== "proposta") document.getElementById("g-back").onclick = null;

  if (n === 5 && sub === "proposta") {
    await renderDettaglioProposta(container, subId);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "two-col";
  const main = document.createElement("section"); main.className = "col-main";
  const side = document.createElement("aside"); side.className = "col-side";
  wrap.appendChild(main); wrap.appendChild(side);
  container.appendChild(wrap);

  if (n === 5) {
    await renderFase5(main);
  } else if (n === 1) {
    main.appendChild(pannelloUpload());
    main.appendChild(pannelloElaborati(n));
  } else {
    main.appendChild(notaNonDisponibile(
      n === 2 ? "L'elenco strutturato dei requisiti (id, testo, tipo vincolante/premiante, copertura, provenienza puntuale) e il collegamento al Grafo non sono ancora esposti da un endpoint dedicato: qui sotto trovi comunque gli elaborati reali prodotti dalla fase."
      : n === 3 ? "La sintesi e le sezioni annotate del capitolato non sono ancora esposte come dati strutturati: qui sotto trovi comunque gli elaborati reali prodotti dalla fase."
      : n === 4 ? "L'elenco dei gap con le prove documentali collegate e l'azione «suggerisci proposta» richiedono dati strutturati non ancora esposti da un endpoint dedicato: qui sotto trovi comunque gli elaborati reali prodotti dalla fase."
      : n === 6 ? "Le card per deliverable (agente, skill, avanzamento, dipendenze) e il workspace per singolo deliverable richiedono un modello dati non ancora esposto dal backend: qui sotto trovi comunque i file reali prodotti sotto output/10_offer/."
      : "La checklist di audit strutturata non è ancora esposta da un endpoint dedicato: qui sotto trovi comunque gli elaborati reali prodotti dalla fase."
    ));
    main.appendChild(pannelloElaborati(n));
  }

  side.appendChild(pannelloAzione(n, corpo));
}

function pannelloUpload() {
  const div = document.createElement("div");
  div.className = "card glass-surface";
  div.innerHTML = `<h3 class="eyebrow">Documenti</h3>
    <form id="form-upload">
      <div class="campo" style="margin-bottom:var(--s-3)">
        <label for="u-categoria">Categoria</label>
        <select id="u-categoria" name="categoria">
          <option value="disciplinare">Disciplinare</option>
          <option value="elaborati">Elaborati</option>
          <option value="p7m">P7M</option>
        </select>
      </div>
      <div class="campo" style="margin-bottom:var(--s-3)">
        <label for="u-file">File</label>
        <input id="u-file" name="file" type="file" required>
      </div>
      <button type="submit">Carica</button>
    </form>
    <div id="upload-esito-wrap"></div>`;
  div.querySelector("#form-upload").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const wrap = div.querySelector("#upload-esito-wrap");
    wrap.innerHTML = `<p class="esito">Caricamento…</p>`;
    try {
      const r = await Api.caricaDocumento(SLUG, form.get("categoria"), form.get("file"));
      wrap.innerHTML = `<p class="esito good">${r.messaggio || "Caricato."}</p>`;
      ev.target.reset();
      if (r.fasi_completate_da_valutare && r.fasi_completate_da_valutare.length) {
        const box = document.createElement("div");
        box.className = "approval-panel";
        box.style.marginTop = "var(--s-3)";
        box.innerHTML = `<strong>Rieseguire una fase già completata per tenere conto del nuovo documento?</strong>
          <p class="sub">Le fasi successive già completate verranno marcate "da rivedere", non cancellate.</p>`;
        r.fasi_completate_da_valutare.forEach((n) => {
          const b = document.createElement("button");
          b.textContent = `Riesegui Fase ${n} (${NOMI_FASE[n]})`; b.className = "ghost";
          b.onclick = async () => { b.disabled = true; try { await Api.riesegui(SLUG, n); await ricarica(); b.textContent = "Riesecuzione accodata ✓"; } catch (e) { alert(`Errore: ${e.message}`); b.disabled = false; } };
          box.appendChild(b);
        });
        wrap.appendChild(box);
      }
      S.outputCache = null;
    } catch (e) {
      wrap.innerHTML = `<p class="esito crit">Errore: ${e.message}</p>`;
    }
  });
  return div;
}

// ══════════════════════ VISTA: GRAFO (frontend-only, onesta) ════════
function renderGrafo(container, query) {
  document.getElementById("g-view-kicker").textContent = "Vista trasversale";
  document.getElementById("g-view-title").textContent = "Grafo";
  document.getElementById("g-view-sub").textContent = "Tracciabilità: da un deliverable si risale a proposta, gap, requisito e passaggio del documento che lo impone.";
  document.getElementById("g-view-status").hidden = true;
  document.getElementById("g-back").hidden = true;

  const tipo = query.get("tipo");
  const wrap = document.createElement("section");
  wrap.className = "card glass-surface";
  wrap.appendChild(notaNonDisponibile(
    "Il backend non espone ancora un endpoint /grafo con nodi e archi strutturati (requisiti, gap, proposte, deliverable e i loro collegamenti). Questa vista è pronta lato frontend — filtri, colonne per tipo di nodo, deep-link — e si attiverà collegandola a un endpoint futuro."
    + (tipo ? ` Filtro richiesto dal link di provenienza: «${tipo}» (verrà applicato non appena i dati sono disponibili).` : "")
  ));
  const cols = ["requisito", "gap", "proposta", "deliverable"];
  const colsWrap = document.createElement("div");
  colsWrap.className = "graph-cols";
  colsWrap.style.marginTop = "var(--s-4)";
  colsWrap.innerHTML = cols.map((c) => `<div><div class="graph-col-title">${c}</div><p style="font-size:var(--fs-micro);color:var(--ink-4);margin:0">0 nodi</p></div>`).join("");
  wrap.appendChild(colsWrap);
  container.appendChild(wrap);
}

// ══════════════════════ VISTA: ATTIVITÀ (reale + chat onesta) ═══════
function badgeEsito(esito) {
  const map = { completato: "good", errore: "crit", in_esecuzione: "info", in_coda: "na" };
  return map[esito] || "na";
}

async function renderAttivita(container) {
  document.getElementById("g-view-kicker").textContent = "Vista trasversale";
  document.getElementById("g-view-title").textContent = "Attività";
  document.getElementById("g-view-sub").textContent = "Storico esecuzioni, log grezzo e intervento diretto — un solo posto, non ripetuto nelle viste di fase.";
  document.getElementById("g-view-status").hidden = true;
  document.getElementById("g-back").hidden = true;

  const storico = document.createElement("section");
  storico.className = "card glass-surface";
  storico.innerHTML = `<h3 class="eyebrow">Storico esecuzioni</h3><table><thead><tr><th>Fase</th><th>Avviato</th><th>Esito</th><th>Pipeline</th><th>Prezzario</th></tr></thead><tbody id="g-runlog-body"><tr><td colspan="5">Caricamento…</td></tr></tbody></table>`;
  container.appendChild(storico);

  let runsGrezzo = { runs: [] };
  try {
    runsGrezzo = await Api.runLog(SLUG);
    const runs = (runsGrezzo.runs || []).slice().reverse();
    const tbody = document.getElementById("g-runlog-body");
    if (runs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><span style="color:var(--ink-3)">Nessuna esecuzione ancora.</span></td></tr>`;
    } else {
      tbody.innerHTML = runs.map((r) => `<tr>
        <td>${r.fase}</td><td style="font-family:var(--font-mono);font-size:var(--fs-xs)">${r.avviato_il || ""}</td>
        <td><span class="status-badge ${badgeEsito(r.esito)}">${r.esito}</span></td>
        <td style="font-family:var(--font-mono);font-size:var(--fs-xs)">${r.pipeline_version || ""}</td><td>${r.prezzario_version || "—"}</td>
      </tr>`).join("");
    }
  } catch (e) {
    document.getElementById("g-runlog-body").innerHTML = `<tr><td colspan="5"><span style="color:var(--crit)">Errore: ${e.message}</span></td></tr>`;
  }

  const dettagli = document.createElement("details");
  dettagli.className = "card glass-surface";
  dettagli.innerHTML = `<summary style="font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--ink-2)">Log grezzo (JSON) · sede unica</summary>
    <pre style="margin:var(--s-3) 0 0;font-family:var(--font-mono);font-size:var(--fs-micro);color:var(--ink-3);overflow-x:auto;white-space:pre-wrap">${JSON.stringify(runsGrezzo, null, 2)}</pre>`;
  container.appendChild(dettagli);

  const code = document.createElement("section");
  code.className = "card glass-surface";
  code.style.borderColor = "var(--info-edge)";
  code.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2);margin-bottom:var(--s-2)">
      <h3 style="margin:0;font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--ink-1)">Claude Code · intervento diretto</h3>
      <span class="badge info">lettura e scrittura</span>
    </div>
    <p style="margin:0 0 var(--s-3);font-size:var(--fs-xs);color:var(--ink-3)">Sta qui, e non nell'assistente, perché scrive sulla gara: corregge elaborati, riaccoda job, cambia parametri.</p>
    <div id="g-code-nota"></div>
    <form class="code-form" style="border:0;background:transparent;padding:0;margin-top:var(--s-3)">
      <input type="text" disabled placeholder="Non ancora disponibile lato backend">
      <button type="button" disabled aria-label="Invia">➤</button>
    </form>`;
  code.querySelector("#g-code-nota").appendChild(notaNonDisponibile(
    "Il backend non espone ancora un endpoint di scrittura per la chat operativa (lettura e scrittura sulla gara): resta distinto, per progetto, dall'assistente di sola lettura. Questa sezione è pronta lato frontend — storico, area messaggi, conferma azione — e si attiverà collegandola all'endpoint quando disponibile."
  ));
  container.appendChild(code);
}

// ══════════════════════ VISTA: IMPOSTAZIONI (mista) ══════════════════
async function renderImpostazioni(container) {
  document.getElementById("g-view-kicker").textContent = "Vista trasversale";
  document.getElementById("g-view-title").textContent = "Impostazioni";
  document.getElementById("g-view-sub").textContent = "Impostazioni di questa gara, separate da quelle di sistema e account.";
  document.getElementById("g-view-status").hidden = true;
  document.getElementById("g-back").hidden = true;

  const wrap = document.createElement("div");
  wrap.className = "settings-grid";
  container.appendChild(wrap);

  const m = S.dato.manifest || {};
  const esec = m.esecuzione || {};
  const prezz = m.prezzario || {};
  const garaCard = document.createElement("section");
  garaCard.className = "settings-card card glass-surface";
  garaCard.innerHTML = `
    <span class="badge accent" style="margin-bottom:var(--s-2)">Questa gara</span>
    <h3 style="margin:0 0 var(--s-4);font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--ink-1)">${SLUG}</h3>
    <div class="campo" style="margin-bottom:var(--s-3)"><label>Nome esteso</label><input type="text" value="${(m.nome || "").replace(/"/g, "&quot;")}" disabled></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--s-3);margin-bottom:var(--s-3)">
      <div class="campo"><label>Modello</label><input type="text" value="${esec.modello || "—"}" disabled></div>
      <div class="campo"><label>Effort</label><input type="text" value="${esec.effort || "—"}" disabled></div>
      <div class="campo"><label>Prezzario</label><input type="text" value="${prezz.regione || "—"} ${prezz.anno || ""}" disabled></div>
    </div>
    <div id="g-impostazioni-nota"></div>`;
  garaCard.querySelector("#g-impostazioni-nota").appendChild(notaNonDisponibile("La modifica di nome/modello/effort/prezzario e l'archiviazione della gara richiedono endpoint di scrittura (PATCH/DELETE) non ancora esposti dal backend: qui sotto i valori reali, in sola lettura."));
  wrap.appendChild(garaCard);

  const sysCard = document.createElement("section");
  sysCard.className = "settings-card system card";
  sysCard.style.background = "var(--glass-2)";
  sysCard.innerHTML = `<span class="badge na" style="margin-bottom:var(--s-2)">Sistema e account</span>
    <h3 style="margin:0 0 var(--s-2);font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--ink-1)">Vale per tutte le gare</h3>
    <p style="margin:0 0 var(--s-4);font-size:var(--fs-xs);color:var(--ink-3)">Sezione separata di proposito: qui una modifica ha effetto sull'intera installazione, non su questa gara.</p>
    <div id="g-sys-rows">Caricamento…</div>`;
  wrap.appendChild(sysCard);

  const rows = sysCard.querySelector("#g-sys-rows");
  try {
    const [auth, pipeline, prezzari] = await Promise.all([
      Api.sistemaAuth().catch((e) => ({ errore: e.message })),
      Api.sistemaPipeline().catch((e) => ({ errore: e.message })),
      Api.sistemaPrezzari().catch((e) => ({ errore: e.message })),
    ]);
    rows.innerHTML = "";
    const riga = (titolo, dettaglio, badge) => `<div class="settings-row"><span><strong style="display:block;font-size:var(--fs-xs);color:var(--ink-1)">${titolo}</strong><span style="font-size:var(--fs-micro);color:var(--ink-2)">${dettaglio}</span></span>${badge || ""}</div>`;
    rows.innerHTML += auth.errore
      ? riga("Autenticazione Claude", `Non raggiungibile: ${auth.errore}`)
      : riga("Autenticazione Claude", auth.disponibile ? "Attiva" + (auth.stima_scadenza ? ` · ${auth.stima_scadenza.nota || ""}` : "") : `Non disponibile: ${auth.motivo}`,
        `<span class="status-badge ${auth.disponibile ? "good" : "crit"}">${auth.disponibile ? "attiva" : "non disponibile"}</span>`);
    rows.innerHTML += pipeline.errore
      ? riga("Versione pipeline", `Non raggiungibile: ${pipeline.errore}`)
      : riga("Versione pipeline", `${pipeline.versione || "—"} · ${pipeline.git_ref || ""}`);
    rows.innerHTML += prezzari.errore
      ? riga("Prezzari installati", `Non raggiungibile: ${prezzari.errore}`)
      : riga("Prezzari installati", Array.isArray(prezzari) ? `${prezzari.length} regione/i` : JSON.stringify(prezzari));
  } catch (e) {
    rows.innerHTML = `<p style="color:var(--crit);font-size:var(--fs-xs)">Errore: ${e.message}</p>`;
  }
}

// ══════════════════════ DISPATCH VISTA CENTRALE ═════════════════════
async function renderView() {
  const container = document.getElementById("g-viewport");
  container.innerHTML = "";
  container.style.animation = "none"; void container.offsetWidth; container.style.animation = "";
  const r = S.route;
  if (!r) { container.innerHTML = `<div class="card glass-surface">Caricamento…</div>`; return; }

  if (r.view === "grafo") { renderGrafo(container, r.query); return; }
  if (r.view === "attivita") { await renderAttivita(container); return; }
  if (r.view === "impostazioni") { await renderImpostazioni(container); return; }
  if (r.view === "fase") {
    if (r.fase < 1 || r.fase > 7 || Number.isNaN(r.fase)) {
      container.innerHTML = `<div class="error-state"><h3>Fase non valida</h3><p>Le fasi vanno da 1 a 7.</p></div>`;
      return;
    }
    await renderFase(container, r.fase, r.sub, r.subId);
  }
}

function renderAll() {
  if (!S.dato) return;
  renderCrumb();
  renderTools();
  renderHeader();
  renderStepper();
  renderAssistantFab();
  renderView();
}

// ══════════════════════ SSE: aggiornamento live (aperto una sola volta) ══
function avviaStream() {
  const es = new EventSource(Api.streamUrl(SLUG));
  es.onopen = () => { S.sseOk = true; renderSse(); };
  es.onmessage = (ev) => {
    S.sseOk = true; renderSse();
    try {
      const payload = JSON.parse(ev.data);
      S.dato = S.dato ? { ...S.dato, fasi: payload.fasi, attivita: payload.attivita } : S.dato;
      if (S.dato) { renderHeader(); renderStepper(); renderAssistantFab(); }
    } catch { /* payload malformato: ignora questo evento, il prossimo arriverà */ }
  };
  es.onerror = () => { S.sseOk = false; renderSse(); };
}

// ── Tema chiaro/scuro (persistito) ──────────────────────────────────
function applicaTema(t) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  document.getElementById("tema-chiaro").setAttribute("aria-pressed", String(t === "light"));
  document.getElementById("tema-scuro").setAttribute("aria-pressed", String(t === "dark"));
}
document.getElementById("tema-chiaro").onclick = () => { localStorage.setItem("spada:tema", "light"); applicaTema("light"); };
document.getElementById("tema-scuro").onclick = () => { localStorage.setItem("spada:tema", "dark"); applicaTema("dark"); };
applicaTema(localStorage.getItem("spada:tema") || "");

S.route = parseRoute();
renderSse();
ricarica(true);
avviaStream();
