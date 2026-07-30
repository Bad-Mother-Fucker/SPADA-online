// impostazioni.js — Sprint 10.1: sezione impostazioni, con le
// informazioni prima sparse in fondo a gara.html (storico esecuzioni,
// stato grezzo) piu' stato di sistema (autenticazione, prezzari,
// versione pipeline) e i dati statici della gara (manifest).

const params = new URLSearchParams(location.search);
const SLUG = params.get("slug");
if (!SLUG) {
  document.body.innerHTML = "<p>Slug gara mancante nell'URL (?slug=...).</p>";
  throw new Error("slug mancante");
}

function badgeClasse(stato) {
  return { completata: "good", errore: "crit", da_rivedere: "warn", in_esecuzione: "info" }[stato] || "na";
}

async function renderGara() {
  const el = document.getElementById("i-gara");
  try {
    const d = await Api.dettaglioGara(SLUG);
    const m = d.manifest;
    el.innerHTML = `
      <p><span class="kind">Nome</span><br>${m.nome || SLUG}</p>
      <p><span class="kind">CIG</span><br>${m.gara?.CIG || "—"} · <span class="kind">CUP</span> ${m.gara?.CUP || "—"}</p>
      <p><span class="kind">Stazione appaltante</span><br>${m.gara?.stazione_appaltante || "—"}</p>
      <p><span class="kind">Scadenza offerta</span><br>${m.gara?.scadenza_offerta || "—"}</p>
      <p><span class="kind">Modello / effort</span><br>${m.esecuzione?.modello || "—"} · ${m.esecuzione?.effort || "—"}</p>
      <p><span class="kind">Prezzario</span><br>${m.prezzario?.regione || "—"} ${m.prezzario?.anno || ""}</p>
      <p><span class="kind">Creata il</span><br>${m.creato_il || "—"}</p>
    `;
    document.getElementById("i-json-grezzo").textContent = JSON.stringify(d, null, 2);
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

async function renderSistema() {
  const el = document.getElementById("i-sistema");
  try {
    const [auth, pipeline] = await Promise.all([Api.sistemaAuth(), Api.sistemaPipeline()]);
    el.innerHTML = `
      <p><span class="kind">Autenticazione Claude</span><br>
        <span class="status-badge ${auth.disponibile ? "good" : "crit"}">${auth.disponibile ? "disponibile" : "non disponibile"}</span>
        ${auth.disponibile ? "" : ` — ${auth.motivo || ""}`}</p>
      ${auth.stima_scadenza ? `<p><span class="kind">Stima scadenza token</span><br>
        ~${auth.stima_scadenza.giorni_alla_scadenza_stimata} giorni (${auth.stima_scadenza.nota})</p>` : ""}
      <p><span class="kind">Versione pipeline</span><br>${pipeline.versione} (${pipeline.git_ref})</p>
    `;
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

async function renderPrezzari() {
  const el = document.getElementById("i-prezzari");
  try {
    const prezzari = await Api.sistemaPrezzari();
    if (prezzari.length === 0) { el.textContent = "Nessun prezzario importato."; return; }
    el.innerHTML = prezzari.map((p) =>
      `<p>${p.regione} ${p.anno} — ${p.totale_voci} voci, importato il ${p.importato_il}</p>`
    ).join("");
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

async function renderRunLog() {
  const tbody = document.querySelector("#i-runlog tbody");
  try {
    const log = await Api.runLog(SLUG);
    const runs = (log.runs || []).slice().reverse();
    if (runs.length === 0) {
      tbody.innerHTML = "<tr><td colspan='6'>Nessuna esecuzione ancora.</td></tr>";
      return;
    }
    tbody.innerHTML = `<tr><th>Fase</th><th>Deliverable</th><th>Avviato</th><th>Esito</th><th>Pipeline</th><th>Prezzario</th></tr>` +
      runs.map((r) => `<tr>
        <td>${r.fase}</td><td>${r.deliverable_id || "—"}</td><td>${r.avviato_il || ""}</td>
        <td><span class="status-badge ${badgeClasse(r.esito === 'completato' ? 'completata' : r.esito)}">${r.esito}</span></td>
        <td>${r.pipeline_version || ""}</td><td>${r.prezzario_version || "—"}</td>
      </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6">Errore: ${e.message}</td></tr>`;
  }
}

renderGara();
renderSistema();
renderPrezzari();
renderRunLog();
