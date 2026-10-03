// config.js — un solo punto da cambiare per puntare al backend.
// Versione locale: il frontend è servito dallo stesso FastAPI che espone
// l'API (http://localhost:8000), quindi la base è la stessa origine.
// Per un backend su un altro indirizzo: window.SPADA_API_BASE = "http://…".
window.SPADA_API_BASE = window.SPADA_API_BASE || "";
