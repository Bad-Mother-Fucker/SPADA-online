// api.js — client minimale per il backend FastAPI (Sprint 4).
const Api = (() => {
  const base = () => window.SPADA_API_BASE || "";

  async function richiesta(percorso, opzioni = {}) {
    const resp = await fetch(base() + percorso, {
      headers: { "Content-Type": "application/json", ...(opzioni.headers || {}) },
      ...opzioni,
    });
    if (!resp.ok) {
      let dettaglio = "";
      try { dettaglio = JSON.stringify(await resp.json()); } catch { /* corpo non-JSON */ }
      throw new Error(`${resp.status} ${resp.statusText} — ${dettaglio}`);
    }
    const tipo = resp.headers.get("content-type") || "";
    return tipo.includes("application/json") ? resp.json() : resp.text();
  }

  return {
    elencoGare: () => richiesta("/gare"),
    creaGara: (dati) => richiesta("/gare", { method: "POST", body: JSON.stringify(dati) }),
    dettaglioGara: (slug) => richiesta(`/gare/${slug}`),
    runLog: (slug) => richiesta(`/gare/${slug}/run-log`),
    elencoOutput: (slug) => richiesta(`/gare/${slug}/output`),
    percorsoOutput: (slug, p) => `${base()}/gare/${slug}/output/${p}`,
    esegui: (slug, fase) => richiesta(`/gare/${slug}/fasi/${fase}/esegui`, { method: "POST" }),
    riesegui: (slug, fase) => richiesta(`/gare/${slug}/fasi/${fase}/riesegui`, { method: "POST" }),
    approva: (slug, fase) => richiesta(`/gare/${slug}/fasi/${fase}/approva`, { method: "POST" }),
    registraApprovazione: (slug, body) =>
      richiesta(`/gare/${slug}/approvazioni`, { method: "POST", body: JSON.stringify(body) }),
    caricaDocumento: async (slug, categoria, file) => {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`${base()}/gare/${slug}/documenti?categoria=${categoria}`, {
        method: "POST", body: form,
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      return resp.json();
    },
    streamUrl: (slug) => `${base()}/gare/${slug}/stream`,
    sistemaAuth: () => richiesta("/sistema/auth"),
    sistemaPrezzari: () => richiesta("/sistema/prezzari"),
    sistemaPipeline: () => richiesta("/sistema/pipeline"),
  };
})();
