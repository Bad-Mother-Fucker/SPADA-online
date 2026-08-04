// api.js — client del backend FastAPI.
//
// Gli errori portano con sé stato HTTP e percorso: gli stati di errore del
// design li mostrano testualmente ("Il servizio ha risposto 503 per …"), e
// senza questi campi il messaggio si ridurrebbe a "qualcosa è andato storto".

class ApiError extends Error {
  constructor(messaggio, { stato = 0, percorso = "", dettaglio = "" } = {}) {
    super(messaggio);
    this.name = "ApiError";
    this.stato = stato;
    this.percorso = percorso;
    this.dettaglio = dettaglio;
  }
}

const Api = (() => {
  const base = () => window.SPADA_API_BASE || "";

  async function richiesta(percorso, opzioni = {}) {
    let resp;
    try {
      resp = await fetch(base() + percorso, {
        headers: { "Content-Type": "application/json", ...(opzioni.headers || {}) },
        ...opzioni,
      });
    } catch (e) {
      // Rete irraggiungibile: nessuno stato HTTP da mostrare.
      throw new ApiError("Servizio non raggiungibile", { percorso, dettaglio: e.message });
    }
    if (!resp.ok) {
      let dettaglio = "";
      try {
        const corpo = await resp.json();
        dettaglio = typeof corpo?.detail === "string" ? corpo.detail : JSON.stringify(corpo);
      } catch { /* corpo non-JSON: resta il solo stato */ }
      throw new ApiError(dettaglio || `${resp.status} ${resp.statusText}`, {
        stato: resp.status, percorso, dettaglio,
      });
    }
    const tipo = resp.headers.get("content-type") || "";
    return tipo.includes("application/json") ? resp.json() : resp.text();
  }

  return {
    ApiError,
    base,

    elencoGare: () => richiesta("/gare"),
    creaGara: (dati) => richiesta("/gare", { method: "POST", body: JSON.stringify(dati) }),
    dettaglioGara: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}`),
    eliminaGara: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}`, { method: "DELETE" }),
    runLog: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/run-log`),
    elencoOutput: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/output`),
    percorsoOutput: (slug, p) => `${base()}/gare/${encodeURIComponent(slug)}/output/${p}`,

    /** Testo grezzo di un elaborato: serve alle viste che ne fanno il parsing. */
    async testoOutput(slug, p) {
      const url = `${base()}/gare/${encodeURIComponent(slug)}/output/${p}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new ApiError(`${resp.status} ${resp.statusText}`, { stato: resp.status, percorso: `/gare/${slug}/output/${p}` });
      }
      return resp.text();
    },

    esegui: (slug, fase) => richiesta(`/gare/${encodeURIComponent(slug)}/fasi/${fase}/esegui`, { method: "POST" }),
    riesegui: (slug, fase) => richiesta(`/gare/${encodeURIComponent(slug)}/fasi/${fase}/riesegui`, { method: "POST" }),
    approva: (slug, fase) => richiesta(`/gare/${encodeURIComponent(slug)}/fasi/${fase}/approva`, { method: "POST" }),
    registraApprovazione: (slug, body) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/approvazioni`, { method: "POST", body: JSON.stringify(body) }),

    elencoDocumenti: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/documenti`),

    caricaDocumento: async (slug, categoria, file) => {
      const form = new FormData();
      form.append("file", file);
      const percorso = `/gare/${encodeURIComponent(slug)}/documenti?categoria=${encodeURIComponent(categoria)}`;
      let resp;
      try {
        resp = await fetch(base() + percorso, { method: "POST", body: form });
      } catch (e) {
        throw new ApiError("Servizio non raggiungibile", { percorso, dettaglio: e.message });
      }
      if (!resp.ok) {
        let dettaglio = "";
        try { const c = await resp.json(); dettaglio = c?.detail || ""; } catch { /* corpo non-JSON */ }
        throw new ApiError(dettaglio || `${resp.status} ${resp.statusText}`, { stato: resp.status, percorso, dettaglio });
      }
      return resp.json();
    },

    // Assistente di gara: sola lettura, risponde solo su ciò che la pipeline
    // ha già prodotto (vedi app/backend/assistente.py).
    chiediAssistente: (slug, messaggio) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/assistente`, {
        method: "POST", body: JSON.stringify({ messaggio }),
      }),
    cronologiaAssistente: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/assistente`),

    // ---- Sprint 10 -------------------------------------------------
    // Dati strutturati che sostituiscono il parsing dei registri: dove
    // esiste un endpoint, la vista usa quello e non il markdown.

    /** {nodi:[{id,tipo,etichetta,…}], archi:[{da,a,tipo}], orfani, nodi_senza_frontmatter} */
    grafo: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/grafo`),

    /** [{id,criterio,nome,vincolo_formato,fonte,tipo,agente,stato}] */
    elencoDeliverables: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/deliverables`),
    eseguiDeliverable: (slug, id) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/deliverables/${encodeURIComponent(id)}/esegui`, { method: "POST" }),
    rieseguiDeliverable: (slug, id) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/deliverables/${encodeURIComponent(id)}/riesegui`, { method: "POST" }),

    /** {frontmatter, corpo} — esiste solo per proposte già elaborate da
        feedback-processor: prima di allora la proposta non è un nodo. */
    dettaglioProposta: (slug, id) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/proposte/${encodeURIComponent(id)}`),

    /** Proposte del professionista, ancorate a un gap (Sprint 10.2). */
    elencoProposteOperatore: (slug, criterio) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/proposte-operatore${criterio ? `?criterio=${encodeURIComponent(criterio)}` : ""}`),
    creaPropostaOperatore: (slug, body) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/proposte-operatore`, {
        method: "POST", body: JSON.stringify(body),
      }),

    // Chat a controllo pieno (Sprint 10.4): legge *e scrive* sulla gara.
    // Volutamente distinta dall'assistente in sola lettura.
    cronologiaInterventi: (slug) => richiesta(`/gare/${encodeURIComponent(slug)}/interventi`),
    intervieni: (slug, messaggio) =>
      richiesta(`/gare/${encodeURIComponent(slug)}/interventi`, {
        method: "POST", body: JSON.stringify({ messaggio }),
      }),

    streamUrl: (slug) => `${base()}/gare/${encodeURIComponent(slug)}/stream`,
    sistemaAuth: () => richiesta("/sistema/auth"),
    sistemaPrezzari: () => richiesta("/sistema/prezzari"),
    sistemaPipeline: () => richiesta("/sistema/pipeline"),
  };
})();
