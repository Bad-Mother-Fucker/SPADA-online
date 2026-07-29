// config.js — un solo punto da cambiare per puntare al backend.
// In sviluppo locale: stessa origine del backend (FastAPI serve anche
// i file statici, vedi app/frontend/README.md) o localhost:8000.
// In produzione (Sprint 9): hostname del Cloudflare Tunnel.
window.SPADA_API_BASE = window.SPADA_API_BASE || "https://api.prometheus-spada.it";
