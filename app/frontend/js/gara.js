// gara.js — logica di gara.html: stato fasi, vista agenti, output,
// approvazioni, upload, SSE.

const params = new URLSearchParams(location.search);
const SLUG = params.get("slug");
if (!SLUG) {
  document.body.innerHTML = "<p>Slug gara mancante nell'URL (?slug=...).</p>";
  throw new Error("slug mancante");
}

const NOMI_FASE = {
  1: "Acquisizione documenti", 2: "Costruzione grafo", 3: "Analisi strategica",
  4: "Elaborazione criteri", 5: "Revisione proposte", 6: "Stesura offerta",
  7: "Approvazione finale",
};
// Unità di lavoro mostrata nella vista agenti: cambia con la fase
// (documenti nelle fasi 1-2, criteri nelle 4-5, elaborati nella 6).
const UNITA_PER_FASE = {
  1: "documento", 2: "documento", 3: "analisi", 4: "criterio",
  5: "proposta", 6: "elaborato", 7: "approvazione",
};
const GATE_UMANO = new Set([3, 5, 7]);

function chiaveFase(fasi, n) {
  return Object.keys(fasi || {}).find((k) => k.startsWith(`${n}_`));
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
    el.appendChild(div);
  }
}

function renderFasi(fasi, slug) {
  const el = document.getElementById("g-fasi");
  el.innerHTML = "";
  for (let n = 1; n <= 7; n++) {
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
    } else if (corpo.stato === "da_eseguire" || corpo.stato === "da_rivedere") {
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
    } else if (corpo.stato === "completata") {
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
    el.appendChild(card);
  }
}

function badgeClasse(stato) {
  return { completata: "good", errore: "crit", da_rivedere: "warn", in_esecuzione: "info" }[stato] || "na";
}

function renderAgenti(fasi, attivita) {
  const faseCorrente = Object.keys(fasi || {}).length ? faseCorrenteNum(fasi) : 1;
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

async function renderOutput(slug) {
  const el = document.getElementById("g-output");
  try {
    const file = await Api.elencoOutput(slug);
    if (file.length === 0) { el.textContent = "Nessun output prodotto ancora."; return; }
    el.innerHTML = "";
    // Preferisci il gemello HTML in 11_view/ quando esiste (design system incluso).
    const soloMd = file.filter((f) => f.endsWith(".md") && !f.startsWith("11_view/"));
    soloMd.forEach((f) => {
      const gemello = `11_view/${f.replace(/\.md$/, ".html")}`;
      const href = Api.percorsoOutput(slug, file.includes(gemello) ? gemello : f);
      const a = document.createElement("a");
      a.href = href; a.target = "_blank"; a.textContent = f;
      const div = document.createElement("div");
      div.appendChild(a);
      el.appendChild(div);
    });
  } catch (e) {
    el.textContent = `Errore: ${e.message}`;
  }
}

async function renderRunLog(slug) {
  const tbody = document.querySelector("#g-runlog tbody");
  try {
    const log = await Api.runLog(slug);
    const runs = (log.runs || []).slice().reverse();
    if (runs.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>Nessuna esecuzione ancora.</td></tr>";
      return;
    }
    tbody.innerHTML = `<tr><th>Fase</th><th>Avviato</th><th>Esito</th><th>Pipeline</th><th>Prezzario</th></tr>` +
      runs.map((r) => `<tr>
        <td>${r.fase}</td><td>${r.avviato_il || ""}</td>
        <td><span class="status-badge ${badgeClasse(r.esito === 'completato' ? 'completata' : r.esito)}">${r.esito}</span></td>
        <td>${r.pipeline_version || ""}</td><td>${r.prezzario_version || "—"}</td>
      </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Errore: ${e.message}</td></tr>`;
  }
}

// Fase 5 — revisione proposte: elenco navigabile riga-per-riga, non un
// blocco unico (requisito esplicito, a differenza del gate generico
// "Approva" delle fasi 3/7). Parsing minimale della tabella markdown
// di output/06_registers/proposal_register.md (formato fisso, vedi
// _pipeline/agents/evidence-auditor.md).
function parseTabellaProposte(md) {
  const righe = md.split("\n").filter((r) => r.trim().startsWith("|"));
  if (righe.length < 2) return [];
  const dati = righe.slice(2); // salta intestazione + separatore ---|---
  return dati.map((r) => {
    const celle = r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    return { id: celle[0] || "", titolo: celle[1] || "", criterio: celle[2] || "", stato: celle[3] || "" };
  }).filter((p) => p.id);
}

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
      riga.innerHTML = `
        <span class="agente">${p.id}</span>
        <span class="unita">${p.titolo} — ${p.criterio} <span class="status-badge na">${p.stato}</span></span>
      `;
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

function aggiornaUploadProminenza(fasi) {
  const el = document.getElementById("g-upload");
  const k1 = chiaveFase(fasi, 1);
  const primaFaseAvviata = k1 && fasi[k1].stato !== "da_eseguire";
  el.classList.toggle("secondario", !!primaFaseAvviata);
  if (primaFaseAvviata) document.querySelector(".wrap").appendChild(el); // sposta in fondo
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
    renderFasi(d.fasi.fasi, SLUG);
    renderAgenti(d.fasi.fasi, d.attivita);
    renderRevisioneProposte(SLUG, d.fasi.fasi);
    aggiornaUploadProminenza(d.fasi.fasi);
    document.getElementById("g-json-grezzo").textContent = JSON.stringify(d, null, 2);
  } catch (e) {
    document.getElementById("g-sintesi").textContent = `Errore nel caricare la gara: ${e.message}`;
  }
}

document.getElementById("form-upload").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  const esito = document.getElementById("upload-esito");
  esito.hidden = false; esito.className = "esito"; esito.textContent = "Caricamento…";
  try {
    await Api.caricaDocumento(SLUG, form.get("categoria"), form.get("file"));
    esito.textContent = "Caricato."; esito.classList.add("good");
    ev.target.reset();
  } catch (e) {
    esito.textContent = `Errore: ${e.message}`; esito.classList.add("crit");
  }
});

// SSE: aggiornamento live di fasi/attivita senza ricaricare la pagina.
function avviaStream() {
  const es = new EventSource(Api.streamUrl(SLUG));
  es.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      renderBarraFasi(payload.fasi.fasi || {});
      renderFasi(payload.fasi.fasi || {}, SLUG);
      renderAgenti(payload.fasi.fasi || {}, payload.attivita);
    } catch { /* payload malformato: ignora questo evento, il prossimo arriverà */ }
  };
  es.onerror = () => { /* riconnessione automatica gestita dal browser (EventSource) */ };
}

ricarica();
renderOutput(SLUG);
renderRunLog(SLUG);
avviaStream();
