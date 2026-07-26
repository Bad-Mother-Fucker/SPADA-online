// elenco.js — logica di index.html: elenco gare + creazione.

function statoLeggibile(g) {
  const fase = g.fase_corrente;
  const chiave = Object.keys(g.fasi || {}).find((k) => k.startsWith(`${fase}_`));
  const corpo = chiave ? g.fasi[chiave] : null;
  if (!corpo) return "—";
  const nomi = {
    1: "Acquisizione documenti", 2: "Costruzione grafo", 3: "Analisi strategica",
    4: "Elaborazione criteri", 5: "Revisione proposte", 6: "Stesura offerta",
    7: "Approvazione finale",
  };
  return `Fase ${fase} — ${nomi[fase] || ""} (${corpo.stato})`;
}

function cardGara(g) {
  const div = document.createElement("a");
  div.className = "gara-card phase-card";
  div.href = `gara.html?slug=${encodeURIComponent(g.slug)}`;
  div.dataset.stato = (g.fasi && Object.values(g.fasi).some((f) => f.stato === "errore")) ? "errore" : "";
  div.innerHTML = `
    <div>
      <div class="titolo">${g.nome}</div>
      <div class="sintesi">${statoLeggibile(g)} · ${g.regione} ${g.anno_prezzario} · ${g.modello}/${g.effort}</div>
    </div>
  `;
  return div;
}

async function caricaElenco() {
  const contenitore = document.getElementById("lista-gare");
  try {
    const gare = await Api.elencoGare();
    contenitore.innerHTML = "";
    if (gare.length === 0) {
      contenitore.textContent = "Nessuna gara ancora. Creane una qui sopra.";
      return;
    }
    gare.forEach((g, i) => {
      const el = cardGara(g);
      el.style.setProperty("--i", i);
      el.style.animationDelay = `calc(var(--i) * 40ms)`;
      contenitore.appendChild(el);
    });
  } catch (e) {
    contenitore.textContent = `Errore nel caricare le gare: ${e.message}`;
  }
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

caricaVersionePipeline();
caricaElenco();
