#!/usr/bin/env node
/**
 * graph_lint.js — check meccanici sul knowledge graph di gara.
 *
 * Esegue i controlli deterministici che i grep della skill graph-lint
 * non possono fare in modo affidabile: liste vuote, wikilink rotti,
 * frontmatter mancante, disallineamento index <-> nodi.
 *
 * Il giudizio di merito ("questo orfano e' giustificato?") NON e' qui:
 * resta alla skill .claude/skills/graph-lint/SKILL.md, che invoca questo
 * script e poi valuta i findings.
 *
 *   node scripts/graph/graph_lint.js            # report leggibile
 *   node scripts/graph/graph_lint.js --json     # output JSON
 *
 * Exit code: 0 nessun ERROR, 1 almeno un ERROR, 2 grafo assente.
 */

const fs = require('fs');
const path = require('path');

const GRAPH_DIR = '02_graph';
const NODES_DIR = path.join(GRAPH_DIR, 'nodes');
const CRITERIA_DIR = path.join('output', '03_criteria', 'criteria');
const PROPOSALS_DIR = path.join(GRAPH_DIR, 'proposals');
const INDEX_FILE = path.join(GRAPH_DIR, 'index.md');

const SUBTYPES = new Set([
  'relazione_generale', 'relazione_tecnica', 'tavola', 'computo_metrico',
  'elenco_prezzi', 'quadro_economico', 'stima_sicurezza', 'PSC',
  'cronoprogramma', 'capitolato', 'piano_esproprio', 'quadro_manodopera',
  'altro',
]);

const CONFIDENCE = new Set(['verificato', 'inferito', 'parziale', 'TBD']);

// Campi obbligatori per tipo nodo (references/graph-schema.md)
const REQUIRED = {
  document: ['type', 'gara', 'date', 'ai-first', 'codice', 'file', 'section',
             'status', 'confidence', 'supports_criteria'],
  scope: ['type', 'gara', 'date', 'ai-first', 'fonte_lavorazioni', 'confidence'],
  economic_framework: ['type', 'gara', 'date', 'ai-first', 'confidence'],
  proposal: ['type', 'gara', 'date', 'ai-first', 'id', 'criterio', 'titolo',
             'stato', 'evidence_documents', 'confidence'],
};

const findings = [];
const add = (level, check, file, message) =>
  findings.push({ level, check, file, message });

/** Estrae il blocco frontmatter grezzo. Ritorna null se assente. */
function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  return text.slice(3, end);
}

/**
 * Parser YAML minimale: sufficiente per il frontmatter piatto dello schema.
 * Non gestisce YAML annidato — ritorna le chiavi di primo livello con il
 * loro valore grezzo, e i wikilink trovati per chiave.
 */
function parseFrontmatter(fm) {
  const fields = {};
  let currentKey = null;
  for (const line of fm.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (top) {
      currentKey = top[1];
      fields[currentKey] = { raw: top[2].trim(), lines: [] };
    } else if (currentKey && /^\s+\S/.test(line)) {
      fields[currentKey].lines.push(line.trim());
    }
  }
  return fields;
}

/** Una lista YAML e' vuota se e' `[]` o non ha righe figlie. */
function isEmptyList(field) {
  if (!field) return true;
  if (field.raw === '[]') return true;
  return field.raw === '' && field.lines.length === 0;
}

function wikilinks(text) {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}

// ---------------------------------------------------------------------------

if (!fs.existsSync(GRAPH_DIR) || !fs.existsSync(NODES_DIR)) {
  console.error(
    `Grafo assente: ${NODES_DIR} non esiste.\n` +
    `Esegui graph-builder (CLAUDE.md §3 Fase 1 Step 3) prima del lint.`
  );
  process.exit(2);
}

const nodeFiles = walk(NODES_DIR);
const criterionFiles = walk(CRITERIA_DIR);
const proposalFiles = walk(PROPOSALS_DIR);
const allFiles = [...nodeFiles, ...criterionFiles, ...proposalFiles];

// Target risolvibili da un wikilink: basename senza estensione.
const linkTargets = new Set(
  allFiles.map((f) => path.basename(f, '.md'))
);
// Le pagine criterio sono linkate come [[C1]] ma il file e' criterion_C1.md
for (const f of criterionFiles) {
  const m = path.basename(f, '.md').match(/^criterion_(C\d+(?:\.\d+)?)$/);
  if (m) linkTargets.add(m[1]);
}
// Pagine speciali
for (const special of ['scope', 'economic_framework', 'index']) {
  if (fs.existsSync(path.join(GRAPH_DIR, `${special}.md`))) {
    linkTargets.add(special);
  }
}

const parsed = new Map();
for (const file of allFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const fm = frontmatter(text);
  parsed.set(file, { text, fm, fields: fm ? parseFrontmatter(fm) : null });
}

// --- Check 1: orfani (inclusa lista vuota) ---------------------------------
for (const file of nodeFiles) {
  const { fields } = parsed.get(file);
  if (!fields) continue; // segnalato dal check 3
  if (isEmptyList(fields.supports_criteria)) {
    add('ERROR', 'orfano', file,
      'supports_criteria assente o vuoto: il documento non e\' collegato ad ' +
      'alcun criterio e restera\' fuori da ogni analisi');
  }
}

// --- Check 2: archi ereditati e reason vuoti -------------------------------
for (const file of nodeFiles) {
  const { fields } = parsed.get(file);
  if (!fields) continue;
  const arcFields = ['supports_criteria', 'related_documents'];
  let inheritedOnly = !isEmptyList(fields.supports_criteria);
  for (const key of arcFields) {
    const field = fields[key];
    if (isEmptyList(field)) continue;
    for (const line of field.lines) {
      if (!line.startsWith('-')) continue;
      if (!/reason:\s*\S/.test(line)) {
        add('ERROR', 'arco-senza-reason', file,
          `arco in ${key} senza reason: "${line.slice(0, 80)}"`);
      }
      if (key === 'supports_criteria' && !/confidence:\s*inferito/.test(line)) {
        inheritedOnly = false;
      }
    }
  }
  if (inheritedOnly && !isEmptyList(fields.supports_criteria)) {
    add('WARN', 'archi-solo-ereditati', file,
      'tutti gli archi supports_criteria hanno confidence: inferito ' +
      '(ereditati per sezione, senza supporto testuale): il documento passa ' +
      'il check orfani ma il collegamento non e\' verificato');
  }
}

// --- Check 3: frontmatter ---------------------------------------------------
for (const file of allFiles) {
  const { fm, fields } = parsed.get(file);
  if (!fm) {
    add('ERROR', 'frontmatter-assente', file,
      'la pagina non ha frontmatter YAML delimitato da ---');
    continue;
  }
  const type = fields.type ? fields.type.raw : null;
  const required = REQUIRED[type];
  if (!type) {
    add('ERROR', 'frontmatter-campo', file, 'campo type mancante');
  } else if (required) {
    for (const key of required) {
      if (!(key in fields)) {
        add('ERROR', 'frontmatter-campo', file,
          `campo obbligatorio mancante per type: ${type} → ${key}`);
      }
    }
  }
  if (fields.subtype && !SUBTYPES.has(fields.subtype.raw)) {
    add('ERROR', 'subtype-non-valido', file,
      `subtype "${fields.subtype.raw}" fuori dal set ammesso ` +
      `(references/graph-schema.md)`);
  }
  if (fields.confidence && !CONFIDENCE.has(fields.confidence.raw)) {
    add('ERROR', 'confidence-non-valido', file,
      `confidence "${fields.confidence.raw}" non ammesso ` +
      `(${[...CONFIDENCE].join(' | ')})`);
  }
  // Anti-pattern esplicito nello schema: tavola estratta
  if (fields.subtype && fields.subtype.raw === 'tavola' &&
      fields.status && fields.status.raw === 'estratto') {
    add('WARN', 'tavola-estratta', file,
      'tavola con status: estratto — le tavole sono immagini, ' +
      'la lettura e\' differita a drawing-reader');
  }
}

// --- Check 4: wikilink risolvibili -----------------------------------------
for (const file of allFiles) {
  const { text } = parsed.get(file);
  const seen = new Set();
  for (const target of wikilinks(text)) {
    // I placeholder di template non sono link reali
    if (/^(PROJECT_CONFIG|codice_descrizione|altro_codice_descrizione)/.test(target)) continue;
    if (/^\[?[a-z_]+\]?$/.test(target) && target.includes('[')) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    if (!linkTargets.has(target)) {
      add('ERROR', 'wikilink-rotto', file,
        `[[${target}]] non risolve ad alcun file in ${NODES_DIR}/, ` +
        `${CRITERIA_DIR}/ o ${PROPOSALS_DIR}/`);
    }
  }
}

// --- Check 5: coerenza index.md <-> nodi -----------------------------------
if (!fs.existsSync(INDEX_FILE)) {
  add('ERROR', 'index-assente', INDEX_FILE,
    'index.md non esiste: e\' il file che ogni agente legge per primo');
} else {
  const indexText = fs.readFileSync(INDEX_FILE, 'utf8');
  const indexed = new Set(wikilinks(indexText));
  for (const file of nodeFiles) {
    const stem = path.basename(file, '.md');
    if (!indexed.has(stem)) {
      add('ERROR', 'nodo-non-indicizzato', file,
        `la pagina nodo esiste ma non compare in ${INDEX_FILE}: ` +
        `gli agenti che partono dall'index non la troveranno`);
    }
  }
  for (const target of indexed) {
    if (/^(PROJECT_CONFIG|C\d|scope|economic_framework|P-C)/.test(target)) continue;
    if (!fs.existsSync(path.join(NODES_DIR, `${target}.md`))) {
      add('ERROR', 'index-nodo-fantasma', INDEX_FILE,
        `[[${target}]] e' nell'index ma non esiste in ${NODES_DIR}/`);
    }
  }
}

// --- Check 6: copertura estrazione dei documenti economici ------------------
// Il check orfani (1) intercetta un documento presente ma non collegato.
// Questo intercetta il caso opposto e distinto: un documento collegato e
// indicizzato, ma il cui contenuto non e' mai stato estratto — quindi
// invisibile a ogni analisi che legge il testo (gap prezzi, budget
// sicurezza). Senza questo check un audit puo' concludere su una frazione
// del progetto senza che nulla lo segnali.
const ECONOMIC_SUBTYPES = new Set([
  'computo_metrico', 'elenco_prezzi', 'quadro_economico', 'stima_sicurezza',
  'quadro_manodopera',
]);

const notExtractedEconomic = [];
for (const file of nodeFiles) {
  const { fields } = parsed.get(file);
  if (!fields || !fields.subtype) continue;
  const sub = fields.subtype.raw;
  const status = fields.status ? fields.status.raw : null;
  if (sub === 'tavola') continue; // le tavole sono immagini: non_estratto e' la norma
  if (status !== 'non_estratto') continue;
  if (fields.is_latest && /false/i.test(fields.is_latest.raw)) continue;

  if (ECONOMIC_SUBTYPES.has(sub)) {
    notExtractedEconomic.push(path.basename(file, '.md'));
    add('ERROR', 'copertura-estrazione', file,
      `documento economico (subtype: ${sub}) con status: non_estratto — ` +
      'il suo contenuto non e\' leggibile da strategy-auditor: ogni gap ' +
      'prezzi o budget sicurezza calcolato ora escluderebbe questo documento');
  } else {
    add('WARN', 'copertura-estrazione', file,
      `documento (subtype: ${sub}) con status: non_estratto — ` +
      'indicizzato ma non leggibile: resta fuori da ogni analisi testuale');
  }
}

if (notExtractedEconomic.length) {
  add('ERROR', 'copertura-estrazione', INDEX_FILE,
    `${notExtractedEconomic.length} documenti economici non estratti ` +
    `(${notExtractedEconomic.join(', ')}): l'audit strategico girerebbe su ` +
    'una base parziale. Completare l\'estrazione (graph-builder Fase 2 / ' +
    'document-preprocessor Fase C) prima di eseguire strategy-auditor, ' +
    'oppure attendersi classificazione NON RAPPRESENTATIVO su Analisi 2.');
}

// --- Report -----------------------------------------------------------------
const errors = findings.filter((f) => f.level === 'ERROR');
const warns = findings.filter((f) => f.level === 'WARN');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    nodes: nodeFiles.length,
    criteria: criterionFiles.length,
    proposals: proposalFiles.length,
    errors: errors.length,
    warnings: warns.length,
    findings,
  }, null, 2));
} else {
  console.log(`graph_lint — ${nodeFiles.length} nodi, ` +
    `${criterionFiles.length} criteri, ${proposalFiles.length} proposte\n`);
  if (!findings.length) {
    console.log('Nessun problema meccanico rilevato.');
  } else {
    const byCheck = {};
    for (const f of findings) (byCheck[f.check] ||= []).push(f);
    for (const [check, list] of Object.entries(byCheck)) {
      console.log(`## ${check} (${list.length})`);
      for (const f of list) console.log(`  [${f.level}] ${f.file}\n         ${f.message}`);
      console.log('');
    }
  }
  console.log(`Totale: ${errors.length} ERROR, ${warns.length} WARN`);
  if (warns.length) {
    console.log('\nI WARN richiedono giudizio di merito: passali alla skill ' +
      'graph-lint per la valutazione (un orfano puo\' essere legittimo).');
  }
}

process.exit(errors.length ? 1 : 0);
