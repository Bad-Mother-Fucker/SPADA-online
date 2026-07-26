#!/usr/bin/env node
'use strict';

/*
 * md_to_html.js — genera l'artifact leggibile (HTML autoconsistente) a
 * partire da un output markdown del sistema.
 *
 * Il markdown resta la fonte di verita' unica: questo script legge, non
 * scrive mai il .md. L'HTML porta in fondo il percorso sorgente, la data
 * di modifica e un hash del contenuto — con `--check` si verifica se un
 * artifact e' disallineato rispetto al suo .md.
 *
 * Uso:
 *   node scripts/render/md_to_html.js output/03_criteria/strategy_audit.md
 *   node scripts/render/md_to_html.js --all
 *   node scripts/render/md_to_html.js --check          # exit 1 se stale
 *
 * Zero dipendenze: gira ovunque giri node, anche senza npm install.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ROOT = radice della GARA (working directory), non della pipeline:
// questo script vive una sola volta in _pipeline/scripts/render/ ed è
// invocato per ogni gara diversa via il symlink ~/.claude/scripts —
// __dirname punterebbe sempre a _pipeline/, sbagliato per risolvere
// output/11_view/ e i pattern DOC_TYPES, che sono relativi alla gara
// corrente (cwd). PIPELINE_ROOT resta __dirname-based per le risorse
// condivise (design-system.css).
const ROOT = process.cwd();
const PIPELINE_ROOT = path.resolve(__dirname, '../..');
const VIEW_DIR = path.join(ROOT, 'output', '11_view');
// output/11_view/ vive DENTRO output/: per rispecchiare
// output/03_criteria/x.md come output/11_view/03_criteria/x.html (non
// output/11_view/output/03_criteria/x.html) va tolto il prefisso
// "output/" quando presente. 02_graph/ e _state/ non ce l'hanno e
// restano invariati.
const relForView = (rel) => rel.replace(/^output\//, '');

const DESIGN_SYSTEM_CSS = (() => {
  try {
    return fs.readFileSync(path.join(PIPELINE_ROOT, 'design', 'design-system.css'), 'utf8');
  } catch {
    return ''; // design-system.css non ancora provisionato: l'artifact usa solo le regole locali sotto
  }
})();

// ── Whitelist: quali output diventano artifact, e con che identita' ──────────
// Il primo pattern che matcha vince. `fillable: true` abilita i campi di
// risposta per le sezioni con domande al team.
const DOC_TYPES = [
  { re: /^output\/03_criteria\/gara_brief\.md$/,           kind: 'Gara Brief',        fillable: true  },
  { re: /^output\/03_criteria\/strategy_audit\.md$/,       kind: 'Audit Strategico',  fillable: true  },
  { re: /^output\/05_criteria_outputs\/.+_output\.md$/,    kind: 'Analisi Criterio',  fillable: true  },
  { re: /^output\/04_doc_summaries\/.+\.md$/,              kind: 'Scheda Documento',  fillable: false },
  { re: /^output\/03_criteria\/criteria_matrix\.md$/,      kind: 'Matrice Criteri',   fillable: false },
  { re: /^output\/03_criteria\/criteria_checklist\.md$/,   kind: 'Checklist Criteri', fillable: false },
  { re: /^output\/06_registers\/.+\.md$/,                  kind: 'Registro',          fillable: false },
  { re: /^_state\/.+\.md$/,                                kind: 'Stato Progetto',    fillable: false },
  { re: /^output\/07_questions\/.+\.md$/,                  kind: 'Domande',           fillable: true  },
  { re: /^output\/10_offer\/.+\.md$/,                      kind: 'Offerta Tecnica',   fillable: false },
  { re: /^02_graph\/index\.md$/,                           kind: 'Knowledge Graph',   fillable: false },
  { re: /^02_graph\/(scope|economic_framework)\.md$/,      kind: 'Knowledge Graph',   fillable: false },
];

// Heading che aprono una sezione compilabile dal team.
const FILLABLE_HEADING =
  /(domande chiave|domande guida|domande aperte|indicazioni strategiche|come dare il feedback|risposte)/i;

function docType(rel) {
  return DOC_TYPES.find((d) => d.re.test(rel)) || null;
}

// ── Utility ─────────────────────────────────────────────────────────────────
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function walkMd(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(p, out);
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// ── Parsing markdown (sottoinsieme usato dagli output del sistema) ───────────
function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv && kv[2].trim()) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // wikilink: nel .md e' navigazione Obsidian, qui e' solo un riferimento
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, t, l) => `<span class="wl">${l || t}</span>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, l, h) => {
    // I link relativi a .md puntano al gemello .html: dentro output/11_view/
    // la struttura e' speculare, quindi il path relativo resta valido.
    const href = /^[a-z]+:/i.test(h) ? h : h.replace(/\.md(#[^)]*)?$/, '.html$1');
    return `<a href="${href}" rel="noreferrer">${l}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s;
}

// Classifica un blockquote per il colore dell'alert.
function quoteLevel(text) {
  if (/🔴|CRITICO|ALERT/.test(text)) return 'crit';
  if (/⚠️|⚠|ATTENZIONE|CONTRADDIZIONE|NON RAPPRESENTATIVO/.test(text)) return 'warn';
  return 'info';
}

// Riconosce le classificazioni note e le rende badge.
function badgeFor(value) {
  const v = value.trim().toUpperCase();
  if (/^(CRITICO|ALTO|SFAVOREVOLE|ASSENTE|NON RAPPRESENTATIVO|SCARTATA|FUORI SCOPE)$/.test(v)) return 'crit';
  if (/^(BASSO|LIMITATO|NEUTRO|MODERATO|APPROVATA CON RISERVA|DA INTEGRARE|DEBOLE|ATTENZIONE|PARZIALE)$/.test(v)) return 'warn';
  if (/^(OK|AMPIO|FAVOREVOLE|MEDIO|APPROVATA|FORTE|SUFFICIENTE|IN SCOPE|SOSTENIBILE)$/.test(v)) return 'good';
  if (/^(N\.?D\.?|NON DISPONIBILE|NON CALCOLABILE|NON DETERMINABILE|NON VERIF\.?|TBD)$/.test(v)) return 'na';
  return null;
}

// ID di sistema (P-C1-001, G-C2-014, E-/Q-/R-...) a inizio intestazione:
// diventa l'id dell'ancora, cosi' i link interni [G-C1-001](#G-C1-001)
// funzionano nell'artifact.
const SYS_ID = /^(?:[PGQRE]-C\d+-\d+|C\d+(?:\.\d+)?)\b/;

function renderCells(cells, tag) {
  return cells.map((c) => {
    const b = badgeFor(c.replace(/\*\*/g, ''));
    const inner = b
      ? `<span class="badge ${b}">${inline(c.replace(/\*\*/g, ''))}</span>`
      : inline(c);
    return `<${tag}>${inner}</${tag}>`;
  }).join('');
}

function parseRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

/**
 * Converte il body markdown in HTML.
 * Ritorna { html, fields } dove fields elenca i campi compilabili creati,
 * in ordine, per la funzione di export.
 */
function renderBody(body, fillable) {
  const lines = body.split('\n');
  const out = [];
  const fields = [];
  let i = 0;
  let inFillable = false;
  let sectionTitle = '';

  const addField = (label, kind) => {
    const id = `f${fields.length}`;
    fields.push({ id, label, section: sectionTitle, kind });
    return id;
  };

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (/^\s*```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // hr
    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // <details>/<summary>: toggle nativi (es. evidenze nelle schede
    // proposta di Cx_output). Passthrough controllato: solo questi tag,
    // il contenuto interno resta markdown e passa dal parser normale.
    const det = /^\s*<(\/?)details(\s+open)?>\s*$/.exec(line);
    if (det) {
      out.push(det[1] ? '</details>' : `<details${det[2] ? ' open' : ''}>`);
      i++;
      continue;
    }
    const sum = /^\s*<summary>(.*)<\/summary>\s*$/.exec(line);
    if (sum) { out.push(`<summary>${inline(sum[1])}</summary>`); i++; continue; }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      sectionTitle = h[2].replace(/[*_`]/g, '').trim();
      inFillable = fillable && level <= 3 && FILLABLE_HEADING.test(sectionTitle);
      const sysId = SYS_ID.exec(sectionTitle);
      const anchor = sysId ? sysId[0] : 'h' + hash(sectionTitle + level);
      out.push(`<h${level} id="${anchor}" data-nav="${level}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // table
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const head = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(parseRow(lines[i++]));
      out.push(
        '<div class="tw"><table><thead><tr>' + renderCells(head, 'th') +
        '</tr></thead><tbody>' +
        rows.map((r) => `<tr>${renderCells(r, 'td')}</tr>`).join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const text = buf.join('\n');
      out.push(`<blockquote class="${quoteLevel(text)}">${
        text.split(/\n{2,}/).map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`).join('')
      }</blockquote>`);
      continue;
    }

    // liste
    const isUl = /^\s*[-*+]\s+/.test(line);
    const isOl = /^\s*\d+[.)]\s+/.test(line);
    if (isUl || isOl) {
      const tag = isOl ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        i++;
        // continuazioni indentate
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) &&
               !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      out.push(`<${tag}>` + items.map((it) => {
        let li = `<li>${inline(it)}`;
        if (inFillable) {
          const label = it.replace(/[*_`]/g, '').slice(0, 160);
          const id = addField(label, 'risposta');
          li += `<textarea class="ans" id="${id}" rows="3" ` +
                `placeholder="Risposta…"></textarea>`;
        }
        return li + '</li>';
      }).join('') + `</${tag}>`);
      continue;
    }

    // riga "**Etichetta:** valore" → coppia chiave/valore, un blocco per riga
    // (i template del sistema le usano come metadati, non come prosa)
    const kv = /^\*\*([^*]+):\*\*\s*(.*)$/.exec(line.trim());
    if (kv) {
      const b = badgeFor(kv[2]);
      out.push(`<p class="kv"><span class="k">${inline(kv[1])}</span>` +
        `<span class="v">${b ? `<span class="badge ${b}">${inline(kv[2])}</span>`
                             : inline(kv[2])}</span></p>`);
      i++;
      continue;
    }

    // paragrafo
    if (line.trim()) {
      const buf = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s*(#{1,6}\s|>|\||```|---|[-*+]\s|\d+[.)]\s)/.test(lines[i]) &&
             !/^\*\*[^*]+:\*\*/.test(lines[i].trim())) {
        buf.push(lines[i++]);
      }
      if (!buf.length) { i++; continue; }
      out.push(`<p>${inline(buf.join(' '))}</p>`);
      continue;
    }

    i++;
  }

  // Campo note libero in coda alle sezioni compilabili
  if (fillable && fields.length) {
    sectionTitle = 'Note libere';
    const id = addField('Note libere del team', 'note');
    out.push('<h2 id="note-team">Note libere del team</h2>' +
      `<textarea class="ans" id="${id}" rows="5" ` +
      'placeholder="Osservazioni, vincoli, indicazioni aggiuntive…"></textarea>');
  }

  return { html: out.join('\n'), fields };
}

// ── Template HTML ───────────────────────────────────────────────────────────
function page({ title, kind, subtitle, contentHtml, fields, rel, mtime, digest }) {
  const nav = [];
  contentHtml.replace(/<h([12])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g,
    (_, lvl, id, inner) => {
      nav.push({ lvl: +lvl, id, text: inner.replace(/<[^>]+>/g, '') });
      return _;
    });

  const exportScript = fields.length ? `
<script>
(function () {
  var KEY = 'spada:${digest}';
  var FIELDS = ${JSON.stringify(fields)};
  var boxes = FIELDS.map(function (f) { return document.getElementById(f.id); });

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    FIELDS.forEach(function (f, n) { if (saved[f.id]) boxes[n].value = saved[f.id]; });
    autosize();
  }
  function save() {
    var data = {};
    FIELDS.forEach(function (f, n) { if (boxes[n].value.trim()) data[f.id] = boxes[n].value; });
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    var n = Object.keys(data).length;
    document.getElementById('count').textContent =
      n + ' / ' + FIELDS.length + ' compilate';
  }
  function autosize() {
    boxes.forEach(function (b) { b.style.height = 'auto'; b.style.height = (b.scrollHeight + 2) + 'px'; });
  }
  function toMarkdown() {
    var out = ['# Risposte — ${esc(title)}', '',
               '> Incollare in \\\`${esc(rel)}\\\` — il markdown resta la fonte di verita\\'.', ''];
    var section = null;
    FIELDS.forEach(function (f, n) {
      var v = boxes[n].value.trim();
      if (!v) return;
      if (f.section !== section) { section = f.section; out.push('## ' + section, ''); }
      out.push('**' + f.label + '**', '', v, '');
    });
    if (out.length <= 4) out.push('_Nessuna risposta compilata._');
    return out.join('\\n');
  }

  boxes.forEach(function (b) {
    b.addEventListener('input', function () { save(); autosize(); });
  });
  document.getElementById('copy').addEventListener('click', function () {
    navigator.clipboard.writeText(toMarkdown()).then(function () {
      var el = document.getElementById('copy');
      var t = el.textContent; el.textContent = 'Copiato ✓';
      setTimeout(function () { el.textContent = t; }, 1600);
    });
  });
  document.getElementById('dl').addEventListener('click', function () {
    var blob = new Blob([toMarkdown()], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'risposte_${rel.replace(/[^\w]+/g, '_')}.md';
    a.click(); URL.revokeObjectURL(a.href);
  });
  document.getElementById('reset').addEventListener('click', function () {
    if (!confirm('Cancellare tutte le risposte compilate su questo dispositivo?')) return;
    boxes.forEach(function (b) { b.value = ''; });
    save(); autosize();
  });
  window.addEventListener('load', function () { load(); save(); });
  load(); save();
})();
</script>` : '';

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${DESIGN_SYSTEM_CSS}
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.65
    ui-serif, Georgia, "Times New Roman", serif; }
  .wrap { max-width:62rem; margin:0 auto; padding:0 1.25rem 5rem; }
  header.top { border-bottom:1px solid var(--line); margin-bottom:2rem;
    padding:2.5rem 0 1.5rem; }
  .kind { font:600 .72rem/1 ui-sans-serif, system-ui, sans-serif;
    letter-spacing:.14em; text-transform:uppercase; color:var(--acc); }
  h1 { font-size:clamp(1.6rem,4vw,2.3rem); line-height:1.2; margin:.6rem 0 .4rem; }
  .sub { color:var(--mut); font:400 .95rem/1.5 ui-sans-serif, system-ui, sans-serif; }
  nav.toc { background:var(--card); border:1px solid var(--line); border-radius:10px;
    padding:1rem 1.25rem; margin:0 0 2.5rem; font:.9rem/1.7 ui-sans-serif, system-ui, sans-serif; }
  nav.toc strong { display:block; font-size:.72rem; letter-spacing:.12em;
    text-transform:uppercase; color:var(--mut); margin-bottom:.5rem; }
  nav.toc a { display:block; color:var(--ink); text-decoration:none; }
  nav.toc a:hover { color:var(--acc); text-decoration:underline; }
  nav.toc a.l2 { padding-left:1rem; color:var(--mut); }
  h2 { font-size:1.35rem; margin:2.6rem 0 .8rem; padding-bottom:.4rem;
    border-bottom:1px solid var(--line); }
  h3 { font-size:1.1rem; margin:2rem 0 .6rem; }
  h4,h5,h6 { font-size:1rem; margin:1.5rem 0 .5rem; }
  p { margin:.8rem 0; }
  hr { border:0; border-top:1px solid var(--line); margin:2.5rem 0; }
  a { color:var(--acc); }
  code { font:.88em ui-monospace, SFMono-Regular, Menlo, monospace;
    background:var(--nabg); padding:.12em .38em; border-radius:4px; }
  pre { background:var(--card); border:1px solid var(--line); border-radius:8px;
    padding:1rem; overflow-x:auto; }
  pre code { background:none; padding:0; }
  .wl { font:.9em ui-sans-serif, system-ui, sans-serif; color:var(--acc);
    background:var(--nabg); padding:.1em .45em; border-radius:4px; white-space:nowrap; }
  .tw { overflow-x:auto; margin:1.2rem 0; border:1px solid var(--line);
    border-radius:8px; background:var(--card); }
  table { border-collapse:collapse; width:100%; font:.92rem/1.5 ui-sans-serif,
    system-ui, sans-serif; }
  th,td { text-align:left; padding:.6rem .8rem; border-bottom:1px solid var(--line);
    vertical-align:top; }
  th { font-weight:600; font-size:.78rem; letter-spacing:.04em; text-transform:uppercase;
    color:var(--mut); background:var(--nabg); }
  tbody tr:last-child td { border-bottom:0; }
  /* .badge: definito in design-system.css (condiviso con l'app) */
  blockquote { margin:1.2rem 0; padding:.9rem 1.1rem; border-left:4px solid var(--mut);
    border-radius:0 8px 8px 0; background:var(--nabg); }
  blockquote p { margin:.35rem 0; }
  blockquote.crit { border-color:var(--crit); background:var(--critbg); }
  blockquote.warn { border-color:var(--warn); background:var(--warnbg); }
  blockquote.info { border-color:var(--acc); background:var(--card); }
  details { margin:.8rem 0 1.2rem; padding:.15rem .9rem; border:1px solid var(--line);
    border-radius:8px; background:var(--card); }
  details[open] { padding-bottom:.6rem; }
  summary { cursor:pointer; padding:.5rem 0;
    font:600 .82rem/1.5 ui-sans-serif, system-ui, sans-serif;
    letter-spacing:.04em; text-transform:uppercase; color:var(--mut); }
  summary:hover { color:var(--acc); }
  p.kv { display:flex; flex-wrap:wrap; gap:.5rem 1rem; align-items:baseline;
    margin:.35rem 0; padding:.35rem 0; border-bottom:1px dotted var(--line); }
  p.kv .k { font:600 .78rem/1.5 ui-sans-serif, system-ui, sans-serif;
    letter-spacing:.05em; text-transform:uppercase; color:var(--mut); min-width:13rem; }
  p.kv .v { flex:1; }
  ul,ol { padding-left:1.4rem; }
  li { margin:.45rem 0; }
  textarea.ans { display:block; width:100%; margin:.5rem 0 1.2rem;
    font:.95rem/1.6 ui-sans-serif, system-ui, sans-serif; color:var(--ink);
    background:var(--card); border:1px solid var(--line); border-left:3px solid var(--acc);
    border-radius:6px; padding:.6rem .75rem; resize:vertical; min-height:3.2rem; }
  textarea.ans:focus { outline:2px solid var(--acc); outline-offset:1px; }
  .bar { position:sticky; bottom:0; margin-top:3rem; display:flex; flex-wrap:wrap;
    gap:.6rem; align-items:center; background:var(--card); border:1px solid var(--line);
    border-radius:10px; padding:.75rem 1rem;
    font:.85rem/1.4 ui-sans-serif, system-ui, sans-serif; }
  .bar button { font:600 .85rem/1 ui-sans-serif, system-ui, sans-serif; cursor:pointer;
    border:1px solid var(--acc); background:var(--acc); color:var(--bg);
    padding:.55rem .9rem; border-radius:6px; }
  .bar button.ghost { background:none; color:var(--acc); }
  .bar #count { color:var(--mut); margin-left:auto; }
  footer.src { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line);
    color:var(--mut); font:.78rem/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break:break-all; }
  @media print {
    .bar, nav.toc { display:none; }
    body { background:#fff; color:#000; }
    textarea.ans { border:1px solid #999; }
  }
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <div class="kind">${esc(kind)}</div>
  <h1>${esc(title)}</h1>
  <div class="sub">${subtitle}</div>
</header>
${nav.length > 2 ? `<nav class="toc"><strong>Indice</strong>${
  nav.map((n) => `<a class="l${n.lvl}" href="#${n.id}">${n.text}</a>`).join('')
}</nav>` : ''}
<main>
${contentHtml}
</main>
${fields.length ? `<div class="bar">
  <button id="copy" type="button">Copia risposte in Markdown</button>
  <button id="dl" class="ghost" type="button">Scarica .md</button>
  <button id="reset" class="ghost" type="button">Azzera</button>
  <span id="count"></span>
</div>` : ''}
<footer class="src">
  Generato da <span>${esc(rel)}</span> — ultima modifica ${esc(mtime)} — contenuto ${esc(digest)}<br>
  Il markdown e' la fonte di verita': non modificare questo file, rigeneralo con
  <span>node scripts/render/md_to_html.js ${esc(rel)}</span>
</footer>
</div>
${exportScript}
</body>
</html>
`;
}

// ── Render di un singolo file ───────────────────────────────────────────────
function render(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
  const type = docType(rel);
  if (!type) return null;

  const raw = fs.readFileSync(absPath, 'utf8');
  const { meta, body } = splitFrontmatter(raw);
  const digest = hash(raw);
  const mtime = fs.statSync(absPath).mtime.toISOString().slice(0, 16).replace('T', ' ');

  // Titolo: primo H1 del corpo, altrimenti frontmatter, altrimenti nome file
  const h1 = /^#\s+(.+)$/m.exec(body);
  const title = (h1 && h1[1].trim()) || meta.title || meta.name ||
    path.basename(rel, '.md').replace(/_/g, ' ');
  const bodyNoH1 = h1 ? body.replace(h1[0], '') : body;

  const { html, fields } = renderBody(bodyNoH1, type.fillable);

  const chips = Object.entries(meta)
    .filter(([k]) => /^(criterio|stato|stato_feedback|data|generato|versione|confidence|is_latest)/.test(k))
    .map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`);
  const subtitle = [
    `Prometeus S.P.A.D.A. — aggiornato ${esc(mtime)}`,
    ...chips,
  ].join(' · ');

  const out = page({ title, kind: type.kind, subtitle, contentHtml: html,
                     fields, rel, mtime, digest });

  const dest = path.join(VIEW_DIR, relForView(rel).replace(/\.md$/, '.html'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out, 'utf8');
  return { rel, dest: path.relative(ROOT, dest), fields: fields.length, digest };
}

function isStale(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
  const dest = path.join(VIEW_DIR, relForView(rel).replace(/\.md$/, '.html'));
  if (!fs.existsSync(dest)) return 'artifact assente';
  const digest = hash(fs.readFileSync(absPath, 'utf8'));
  return fs.readFileSync(dest, 'utf8').includes(`contenuto ${digest}`)
    ? null : 'artifact disallineato rispetto al markdown';
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function allTracked() {
  const dirs = ['02_graph', 'output/03_criteria', 'output/05_criteria_outputs', 'output/06_registers',
                'output/07_questions', '_state', 'output/10_offer'];
  return dirs.flatMap((d) => walkMd(path.join(ROOT, d)))
    .filter((p) => docType(path.relative(ROOT, p).split(path.sep).join('/')));
}

function main(argv) {
  const args = argv.slice(2);
  const check = args.includes('--check');
  const all = args.includes('--all') || check;
  const files = all ? allTracked()
    : args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(ROOT, a));

  if (!files.length) {
    console.log('Nessun output da rendere. Uso: md_to_html.js <file.md> | --all | --check');
    return 0;
  }

  if (check) {
    const stale = files.map((f) => [path.relative(ROOT, f), isStale(f)])
                       .filter(([, s]) => s);
    if (!stale.length) { console.log(`Tutti gli artifact allineati (${files.length}).`); return 0; }
    console.log('Artifact da rigenerare:');
    for (const [rel, why] of stale) console.log(`  ${rel} — ${why}`);
    return 1;
  }

  let n = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.error(`  ! ${path.relative(ROOT, f)} non esiste`); continue; }
    const r = render(f);
    if (!r) { console.error(`  · ${path.relative(ROOT, f)} — fuori whitelist, nessun artifact`); continue; }
    console.log(`  ✓ ${r.dest}${r.fields ? ` (${r.fields} campi compilabili)` : ''}`);
    n++;
  }
  console.log(`${n} artifact generati in output/11_view/`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { render, isStale, docType, allTracked };
