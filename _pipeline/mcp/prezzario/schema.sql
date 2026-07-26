-- Schema SQLite per il prezzario regionale (Sprint 2).
--
-- Sostituisce gli indici JSON caricati in contesto (modello precedente,
-- skill `prezzario` in _riferimento/): qui il prezzario e' dato
-- interrogabile, mai caricato per intero in un prompt.
--
-- Chiave composta (regione, anno, codice_completo): piu' annualita' e
-- regioni convivono nello stesso file spada.db senza interferire.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS prezzario_versioni (
  regione        TEXT NOT NULL,
  anno           INTEGER NOT NULL,
  fonte          TEXT,
  riferimento_normativo TEXT,
  vigenza        TEXT,
  totale_voci_articoli INTEGER,
  totale_voci_analisi  INTEGER,
  importato_il   TEXT NOT NULL,          -- ISO 8601
  hash_sorgente  TEXT NOT NULL,          -- sha256 dei due file sorgente concatenati: identifica univocamente l'edizione per run_log.json
  PRIMARY KEY (regione, anno)
);

-- ── Articoli ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prezzario_articoli (
  regione        TEXT NOT NULL,
  anno           INTEGER NOT NULL,
  codice_completo TEXT NOT NULL,
  tipologia_famiglia TEXT,
  capitolo       TEXT,
  voce           TEXT,
  articolo       TEXT,                   -- descrizione estesa, mai troncata
  unita_misura   TEXT,
  prezzo_base    REAL,
  prezzo         REAL,                   -- campo di riferimento per i confronti (comprende S.G. + U.I.)
  spese_generali_pct REAL,
  spese_generali REAL,
  utili_impresa_pct REAL,
  utili_impresa  REAL,
  oneri_sicurezza_impresa_pct REAL,
  oneri_sicurezza_impresa REAL,
  manodopera_indiretta_incidenza REAL,
  manodopera_indiretta REAL,
  manodopera_diretta_incidenza REAL,
  manodopera_diretta REAL,
  oneri_sicurezza_incidenza_su_prezzo REAL,
  PRIMARY KEY (regione, anno, codice_completo),
  FOREIGN KEY (regione, anno) REFERENCES prezzario_versioni(regione, anno) ON DELETE CASCADE
);

-- Full-text search sulle descrizioni (voce + articolo), per cerca_voce().
-- Tabella esterna (contentless=no, content-linked) per poter risalire
-- alla riga di prezzario_articoli col rowid.
CREATE VIRTUAL TABLE IF NOT EXISTS prezzario_articoli_fts USING fts5(
  regione UNINDEXED,
  anno UNINDEXED,
  codice_completo UNINDEXED,
  voce,
  articolo,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ── Analisi (scomposizione) ──────────────────────────────────────────
-- "componenti" e' una LISTA ORDINATA nel JSON sorgente, non un
-- dizionario per categoria: la stessa categoria puo' comparire piu'
-- volte come sotto-gruppi indipendenti di fasi distinte della stessa
-- voce composita. La colonna `ordine` preserva l'ordine originale:
-- un parser a dizionario che aggrega per categoria corromperebbe i
-- subtotali silenziosamente (vedi validazione in import_prezzario.py).
CREATE TABLE IF NOT EXISTS prezzario_analisi_componenti (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  regione        TEXT NOT NULL,
  anno           INTEGER NOT NULL,
  codice_completo TEXT NOT NULL,
  ordine         INTEGER NOT NULL,        -- posizione nella lista "componenti" originale, a partire da 0
  categoria      TEXT,
  totale         REAL,                    -- subtotale dichiarato dalla fonte per QUESTO sotto-gruppo
  totale_calcolato REAL,                  -- somma delle voci figlie, calcolata in importazione — deve combaciare con `totale` entro tolleranza
  FOREIGN KEY (regione, anno, codice_completo)
    REFERENCES prezzario_articoli(regione, anno, codice_completo) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prezzario_analisi_voci (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  componente_id  INTEGER NOT NULL,
  ordine         INTEGER NOT NULL,        -- posizione nella lista "voci" originale
  codice         TEXT,
  descrizione    TEXT,
  codice_collegato TEXT,                  -- nullable per contratto (skill prezzario)
  unita_misura   TEXT,
  quantita       REAL,
  prezzo_unitario REAL,
  scostamento_pct REAL,
  importo        REAL,
  FOREIGN KEY (componente_id) REFERENCES prezzario_analisi_componenti(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analisi_componenti_voce
  ON prezzario_analisi_componenti (regione, anno, codice_completo);
CREATE INDEX IF NOT EXISTS idx_analisi_voci_componente
  ON prezzario_analisi_voci (componente_id);
