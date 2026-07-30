-- Schema applicativo (Sprint 4) — estende spada.db (che già contiene
-- le tabelle prezzario_* di Sprint 2) con stato gare, coda job,
-- documenti caricati, approvazioni e conversazioni assistente.
--
-- La fonte di verità sui DATI di gara resta il filesystem
-- (manifest.json, _state/fasi.json, output/): queste tabelle sono un
-- indice veloce per l'API, tenuto sincronizzato dal backend ad ogni
-- operazione — non l'unica copia dello stato.

CREATE TABLE IF NOT EXISTS gare (
  slug            TEXT PRIMARY KEY,
  nome            TEXT NOT NULL,
  regione         TEXT NOT NULL,
  anno_prezzario  INTEGER NOT NULL,
  modello         TEXT NOT NULL,
  effort          TEXT NOT NULL,
  creato_il       TEXT NOT NULL,
  stato           TEXT NOT NULL DEFAULT 'creata'
);

CREATE TABLE IF NOT EXISTS job (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gara_slug     TEXT NOT NULL REFERENCES gare(slug) ON DELETE CASCADE,
  fase          INTEGER NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('esegui', 'riesegui', 'approva')),
  stato         TEXT NOT NULL DEFAULT 'in_coda'
                CHECK (stato IN ('in_coda', 'in_esecuzione', 'completato', 'errore', 'annullato')),
  creato_il     TEXT NOT NULL,
  iniziato_il   TEXT,
  concluso_il   TEXT,
  run_id        TEXT,
  errore        TEXT,
  deliverable_id TEXT  -- Sprint 10.3: se valorizzato, il job esegue UN deliverable
                       -- (spada_deliverable.sh) invece della fase atomica (spada_fase.sh)
);
CREATE INDEX IF NOT EXISTS idx_job_stato ON job (stato, creato_il);
CREATE INDEX IF NOT EXISTS idx_job_gara ON job (gara_slug);

CREATE TABLE IF NOT EXISTS documenti (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gara_slug     TEXT NOT NULL REFERENCES gare(slug) ON DELETE CASCADE,
  nome_file     TEXT NOT NULL,
  percorso      TEXT NOT NULL,
  categoria     TEXT NOT NULL CHECK (categoria IN ('disciplinare', 'elaborati', 'p7m')),
  caricato_il   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documenti_gara ON documenti (gara_slug);

CREATE TABLE IF NOT EXISTS approvazioni (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gara_slug     TEXT NOT NULL REFERENCES gare(slug) ON DELETE CASCADE,
  fase          INTEGER NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('direttive', 'proposta', 'offerta')),
  riferimento   TEXT,               -- es. "P-C1-001", null per le direttive di fase 3
  decisione     TEXT CHECK (decisione IN ('approvata', 'da_modificare', 'scartata', NULL)),
  nota          TEXT,
  creato_il     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvazioni_gara ON approvazioni (gara_slug, fase);

CREATE TABLE IF NOT EXISTS conversazioni (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gara_slug     TEXT NOT NULL REFERENCES gare(slug) ON DELETE CASCADE,
  ruolo         TEXT NOT NULL CHECK (ruolo IN ('utente', 'assistente')),
  testo         TEXT NOT NULL,
  creato_il     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversazioni_gara ON conversazioni (gara_slug, creato_il);

-- Sprint 10.2 — proposte suggerite dal professionista, prima che il
-- sistema le valuti insieme alle proprie (criterion-agent le legge da
-- output/07_questions/proposte_operatore_Cx.md, questa tabella è solo
-- l'indice veloce per il frontend).
CREATE TABLE IF NOT EXISTS proposte_operatore (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gara_slug     TEXT NOT NULL REFERENCES gare(slug) ON DELETE CASCADE,
  criterio      TEXT NOT NULL,
  gap_id        TEXT,
  titolo        TEXT NOT NULL,
  descrizione   TEXT NOT NULL,
  stato         TEXT NOT NULL DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa', 'valutata')),
  esito_audit   TEXT,
  motivazione   TEXT,
  creato_il     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proposte_operatore_gara ON proposte_operatore (gara_slug, criterio);

-- Sprint 10.4 — chat a controllo pieno (scrittura consentita, a
-- differenza di conversazioni/assistente che è in sola lettura).
-- interventi_sessioni tiene il session_id di claude -p per la
-- continuità multi-turno (--resume), una sessione attiva per gara.
CREATE TABLE IF NOT EXISTS interventi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gara_slug     TEXT NOT NULL REFERENCES gare(slug) ON DELETE CASCADE,
  ruolo         TEXT NOT NULL CHECK (ruolo IN ('utente', 'claude')),
  testo         TEXT NOT NULL,
  creato_il     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interventi_gara ON interventi (gara_slug, creato_il);

CREATE TABLE IF NOT EXISTS interventi_sessioni (
  gara_slug     TEXT PRIMARY KEY REFERENCES gare(slug) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  aggiornato_il TEXT NOT NULL
);
