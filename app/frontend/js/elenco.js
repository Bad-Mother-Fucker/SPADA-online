// elenco.js — logica di index.html: elenco gare, filtri, creazione,
// tema chiaro/scuro. Redesign "Liquid Glass".

const NOMI_FASE = {
  1: "Acquisizione documenti", 2: "Estrazione requisiti", 3: "Analisi capitolato",
  4: "Ricerca soluzioni", 5: "Revisione proposte", 6: "Deliverables",
  7: "Audit e consegna",
};

// Stato "di riga" per una gara: se una qualunque fase è in errore, la gara
// è in errore; altrimenti riflette lo stato della fase corrente.
function statoGara(g) {
  if (g.fasi && Object.values(g.fasi).some((f) => f.stato === "errore")) return "errore";
  const chiave = Object.keys(g.fasi || {}).find((k) => k.startsWith(`${g.fase_corrente}_`));
  const corpo = chiave ? g.fasi[chiave] : null;
  if (!corpo) return "in_coda";
  if (corpo.stato === "da_eseguire") return "in_coda";
  return corpo.stato;
}

const STATO_LABEL = {
  da_rivedere: "Da rivedere", in_esecuzione: "In esecuzione", completata: "Completata",
  errore: "Errore", in_coda: "In coda",
};
const STATO_BADGE = {
  da_rivedere: "accent", in_esecuzione: "info", completata: "good", errore: "crit", in_coda: "na",
};

let stato = { filtro: "tutte", ricerca: "", gare: null, errore: null };

function miniStepper(g) {
  const faseCorrente = g.fase_corrente || 1;
  const st = statoGara(g);
  const spans = [];
  for (let n = 1; n <= 7; n++) {
    let cls = "";
    if (n < faseCorrente) cls = "background:var(--ok)";
    else if (n === faseCorrente) {
      cls = st === "errore" ? "background:var(--crit)" : st === "in_esecuzione"
        ? "background:linear-gradient(90deg,var(--info) 60%,var(--info-soft) 60%)" : "background:var(--accent)";
    }
    spans.push(`<span style="${cls}"></span>`);
  }
  return `<div class="mini-stepper">${spans.join("")}</div>`;
}

function cardGara(g) {
  const a = document.createElement("a");
  const st = statoGara(g);
  a.className = "tender-card";
  a.href = `gara.html?slug=${encodeURIComponent(g.slug)}`;
  const colorVar = { da_rivedere: "var(--accent)", in_esecuzione: "var(--info)", completata: "var(--ok)", errore: "var(--crit)", in_coda: "var(--neu)" }[st];
  a.innerHTML = `
    <span class="accent-bar" style="background:${colorVar}"></span>
    <div class="row">
      <span class="status-badge ${STATO_BADGE[st]}">${STATO_LABEL[st]}</span>
      <span class="slug">${g.slug}</span>
    </div>
    <span class="name">${g.nome}</span>
    <div class="tags">
      <span>${g.regione} ${g.anno_prezzario}</span>
      <span style="font-family:var(--font-mono)">${g.modello}</span>
      <span>${g.effort}</span>
    </div>
    <div>
      ${miniStepper(g)}
      <div class="foot">
        <span><strong style="color:var(--ink-1)">Fase ${g.fase_corrente || 1}</strong> · ${NOMI_FASE[g.fase_corrente] || ""}</span>
      </div>
    </div>
  `;
  return a;
}

function aggiornaFiltri() {
  const el = document.getElementById("filtri-stato");
  const conteggi = { tutte: (stato.gare || []).length };
  (stato.gare || []).forEach((g) => { const s = statoGara(g); conteggi[s] = (conteggi[s] || 0) + 1; });
  const voci = [["tutte", "Tutte"], ["da_rivedere", "Da rivedere"], ["in_esecuzione", "In esecuzione"], ["errore", "Errore"], ["completata", "Completate"]];
  el.innerHTML = "";
  voci.forEach(([k, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "filter-chip";
    b.setAttribute("aria-pressed", String(stato.filtro === k));
    b.textContent = `${label} ${conteggi[k] || 0}`;
    b.onclick = () => { stato.filtro = k; renderElenco(); };
    el.appendChild(b);
  });
}

function renderElenco() {
  aggiornaFiltri();
  const contenitore = document.getElementById("lista-gare");
  const riepilogo = document.getElementById("riepilogo-gare");

  if (stato.errore) {
    contenitore.innerHTML = "";
    const div = document.createElement("div");
    div.className = "error-state";
    div.style.gridColumn = "1 / -1";
    div.innerHTML = `<h3>Non riesco a caricare le gare</h3><p>${stato.errore}</p>`;
    const retry = document.createElement("button");
    retry.textContent = "Riprova"; retry.className = "ghost";
    retry.onclick = caricaElenco;
    div.appendChild(retry);
    contenitore.appendChild(div);
    riepilogo.textContent = "—";
    return;
  }
  if (stato.gare === null) return; // ancora in caricamento: skeleton già in DOM

  if (stato.gare.length === 0) {
    contenitore.innerHTML = `<div class="empty-state" style="grid-column:1 / -1">
      <h3>Nessuna gara ancora registrata</h3>
      <p>Crea la prima gara con il modulo qui sopra: slug, nome, regione/anno del prezzario, modello ed effort.</p>
    </div>`;
    riepilogo.textContent = "0 gare";
    return;
  }

  const daRivedere = stato.gare.filter((g) => statoGara(g) === "da_rivedere").length;
  const inErrore = stato.gare.filter((g) => statoGara(g) === "errore").length;
  riepilogo.innerHTML = `${stato.gare.length} gare` +
    (daRivedere ? ` · <strong style="color:var(--accent)">${daRivedere} richiedono la tua revisione</strong>` : "") +
    (inErrore ? ` · ${inErrore} in errore` : "");

  let lista = stato.filtro === "tutte" ? stato.gare : stato.gare.filter((g) => statoGara(g) === stato.filtro);
  const q = stato.ricerca.trim().toLowerCase();
  if (q) lista = lista.filter((g) => g.nome.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q));

  contenitore.innerHTML = "";
  if (lista.length === 0) {
    contenitore.innerHTML = `<div class="empty-state" style="grid-column:1 / -1"><h3>Nessun risultato</h3><p>Nessuna gara corrisponde al filtro o alla ricerca attuali.</p></div>`;
    return;
  }
  lista.forEach((g, i) => {
    const el = cardGara(g);
    el.style.setProperty("--i", i);
    el.style.animationDelay = `calc(var(--i) * 40ms)`;
    contenitore.appendChild(el);
  });
}

async function caricaElenco() {
  const contenitore = document.getElementById("lista-gare");
  contenitore.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;
  stato.errore = null; stato.gare = null;
  try {
    stato.gare = await Api.elencoGare();
  } catch (e) {
    stato.errore = e.message;
  }
  renderElenco();
}

async function caricaVersionePipeline() {
  try {
    const p = await Api.sistemaPipeline();
    document.getElementById("stato-pipeline").textContent =
      `Versione pipeline: ${p.versione} (${p.git_ref})`;
  } catch {
    document.getElementById("stato-pipeline").textContent = "Versione pipeline: non disponibile";
  }
}

async function caricaStatoAuth() {
  try {
    const a = await Api.sistemaAuth();
    if (!a.disponibile) {
      const b = document.createElement("p");
      b.className = "esito crit";
      b.textContent = `Autenticazione Claude non disponibile: ${a.motivo}`;
      document.querySelector(".page").insertBefore(b, document.querySelector(".list-header"));
      return;
    }
    const stima = a.stima_scadenza;
    if (stima && stima.giorni_alla_scadenza_stimata < 30) {
      const b = document.createElement("p");
      b.className = "esito warn";
      b.textContent = stima.giorni_alla_scadenza_stimata < 0
        ? `Il token OAuth potrebbe essere scaduto (stima). ${stima.nota}`
        : `Il token OAuth scade tra circa ${stima.giorni_alla_scadenza_stimata} giorni (stima). ${stima.nota}`;
      document.querySelector(".page").insertBefore(b, document.querySelector(".list-header"));
    }
  } catch { /* endpoint non raggiungibile: nessun avviso, non bloccante */ }
}

document.getElementById("form-nuova-gara").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const esito = document.getElementById("crea-esito");
  esito.hidden = false;
  esito.textContent = "Creazione in corso…";
  esito.className = "esito";
  try {
    await Api.creaGara({
      slug: form.get("slug"),
      nome: form.get("nome"),
      regione: form.get("regione"),
      anno_prezzario: Number(form.get("anno_prezzario")),
      modello: form.get("modello"),
      effort: form.get("effort"),
    });
    esito.textContent = "Gara creata.";
    esito.classList.add("good");
    ev.target.reset();
    caricaElenco();
  } catch (e) {
    esito.textContent = `Errore: ${e.message}`;
    esito.classList.add("crit");
  }
});

document.getElementById("cerca-gare").addEventListener("input", (ev) => {
  stato.ricerca = ev.target.value;
  renderElenco();
});

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

caricaVersionePipeline();
caricaStatoAuth();
caricaElenco();
