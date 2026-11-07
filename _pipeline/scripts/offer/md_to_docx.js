#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, HeadingLevel, AlignmentType, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, LevelFormat, ImageRun
} = require('docx');

// ── Percorsi e parametri ──────────────────────────────────────────────────────
// Uso: node md_to_docx.js [input.md output.docx] [--font F] [--size PT]
//        [--interlinea 1.15] [--titolo T] [--gara N] [--cig C] [--sa S] [--data D]
//        [--senza-numeri-riga] [--figure grafiche.json]
// --figure: registro delle grafiche della relazione (grafiche_offerta.py);
// ogni riga `[FIGURA: fig-NN]` diventa l'immagine con la didascalia,
// numerata nell'ordine in cui le figure compaiono nel testo.
// Senza argomenti: percorsi storici di offer-writer (bozza_contenuto.md).
// Font e corpo vengono dalla Sezione A di vincoli_offerta_tecnica.md
// (li passa il backend): i default valgono solo se il disciplinare tace.
const ARGS = process.argv.slice(2);
const opt = (n, d) => { const i = ARGS.indexOf('--' + n); return i >= 0 && ARGS[i + 1] !== undefined ? ARGS[i + 1] : d; };
const flag = (n) => ARGS.includes('--' + n);
const POS = ARGS.slice(0, 2).filter((a) => !a.startsWith('--'));
const ROOT        = process.cwd();
const INPUT_FILE  = POS[0] ? path.resolve(POS[0]) : path.join(ROOT, 'output/10_offer/bozza_contenuto.md');
const OUTPUT_FILE = POS[1] ? path.resolve(POS[1]) : path.join(ROOT, 'output/10_offer/bozza_offerta_tecnica.docx');
const TITOLO      = opt('titolo', 'Relazione Tecnico-Illustrativa');
const NUMERI_RIGA = !flag('senza-numeri-riga');

// ── Figure (grafiche della relazione) ─────────────────────────────────────────
const FIGURE_FILE = opt('figure', '');
const FIGURE = (() => {
  if (!FIGURE_FILE || !fs.existsSync(FIGURE_FILE)) return {};
  try {
    const reg = JSON.parse(fs.readFileSync(FIGURE_FILE, 'utf8'));
    return Object.fromEntries((reg.grafiche || []).map((g) => [g.id, g]));
  } catch (e) { return {}; }
})();
const FIGURE_DIR = FIGURE_FILE ? path.dirname(path.resolve(FIGURE_FILE)) : '';
const figureNumero = {};      // id → numero, nell'ordine di comparsa
const figureMancanti = [];    // id collocati senza immagine

/** Larghezza e altezza in pixel di un PNG o di un JPEG; null se non riconosciuto. */
function dimensioniImmagine(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { tipo: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { tipo: 'jpg', w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

// ── Configurazione tipografica ─────────────────────────────────────────────────
const FONT        = opt('font', 'Times New Roman');
const SIZE_BODY   = Math.round(parseFloat(opt('size', '12')) * 2);
const SIZE_H1     = SIZE_BODY + 4;
const SIZE_H2     = SIZE_BODY;
const SIZE_H3     = SIZE_BODY;
const SIZE_HEADER = Math.max(SIZE_BODY - 4, 16);
const LINE_SPACE  = Math.round(parseFloat(opt('interlinea', '1.15')) * 240);
const MARGIN      = 1134;
const PAGE_W      = 11906;
const PAGE_H      = 16838;
const CONTENT_W   = PAGE_W - MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────
function bodyPara(children, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACE, lineRule: 'auto', before: 0, after: 100 },
    ...opts,
    children,
  });
}

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: SIZE_BODY, ...opts });
}

function runHL(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: SIZE_BODY, highlight: 'yellow', ...opts });
}

function makeBulletPara(children) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACE, lineRule: 'auto', before: 0, after: 80 },
    indent: { left: 720, hanging: 360 },
    numbering: { reference: 'bullets', level: 0 },
    children,
  });
}

function makeNumberedPara(children) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACE, lineRule: 'auto', before: 0, after: 80 },
    numbering: { reference: 'numbered', level: 0 },
    children,
  });
}

function makeTableFromRows(rows) {
  if (rows.length === 0) return null;
  const colCount  = rows[0].length;
  const colW      = Math.floor(CONTENT_W / colCount);
  const colWidths = Array(colCount).fill(colW);
  const border    = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders   = { top: border, bottom: border, left: border, right: border };

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((cells, ri) =>
      new TableRow({
        tableHeader: ri === 0,
        children: cells.map((cell, ci) =>
          new TableCell({
            borders,
            width: { size: colWidths[ci], type: WidthType.DXA },
            shading: ri === 0
              ? { fill: 'D5E8F0', type: ShadingType.CLEAR }
              : { fill: 'FFFFFF', type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              spacing: { line: LINE_SPACE, lineRule: 'auto' },
              children: [new TextRun({ text: cell.trim(), font: FONT, size: SIZE_BODY, bold: ri === 0 })],
            })],
          })
        ),
      })
    ),
  });
}

function makeHeader(title) {
  return new Header({
    children: [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
      spacing: { after: 100 },
      children: [new TextRun({ text: title, font: FONT, size: SIZE_HEADER, color: '666666' })],
    })],
  });
}

function makeFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Pagina ', font: FONT, size: SIZE_HEADER }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_HEADER }),
        new TextRun({ text: ' di ', font: FONT, size: SIZE_HEADER }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE_HEADER }),
      ],
    })],
  });
}

// ── Parser inline per **bold**, *italic* ──────────────────────────────────────
function parseInline(text, forceHL = false) {
  if (forceHL) return [runHL(text)];
  const parts = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(run(text.slice(last, m.index)));
    if (m[1]) parts.push(run(m[1], { bold: true }));
    else if (m[2]) parts.push(run(m[2], { italics: true }));
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(run(text.slice(last)));
  return parts.length > 0 ? parts : [run(text)];
}

// ── Parser Markdown ───────────────────────────────────────────────────────────
function parseMd(content) {
  const lines    = content.split('\n');
  const sections = [];
  let cur        = null;
  let inDR       = false;
  let tableLines = [];

  function flushTable() {
    if (tableLines.length === 0) return;
    const dataRows = tableLines.filter(l => !l.match(/^\|[-:\s|]+\|$/));
    const rows = dataRows.map(l => l.split('|').slice(1, -1));
    if (rows.length > 0) {
      const tbl = makeTableFromRows(rows);
      if (tbl && cur) {
        cur.children.push(tbl);
        // spacer after table
        cur.children.push(new Paragraph({ spacing: { after: 100 } }));
      }
    }
    tableLines = [];
  }

  function addEl(el) {
    if (!cur) { cur = { headerTitle: 'Offerta Tecnica', children: [], drBlocks: [] }; sections.push(cur); }
    cur.children.push(el);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // META commenti — ignora
    if (line.match(/^<!--/)) continue;

    // PAGEBREAK
    if (line.trim() === '<!-- PAGEBREAK -->') {
      flushTable();
      addEl(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }

    // DR_START
    const drS = line.match(/^%%DR_START:\s*(.+)%%$/);
    if (drS) {
      flushTable();
      inDR = true;
      if (cur) cur.drBlocks = cur.drBlocks || [];
      if (cur) cur.drBlocks.push({ reason: drS[1].trim(), startIdx: cur ? cur.children.length : 0 });
      continue;
    }

    // DR_END
    if (line.trim() === '%%DR_END%%') {
      flushTable();
      inDR = false;
      if (cur && cur.drBlocks && cur.drBlocks.length > 0) {
        cur.drBlocks[cur.drBlocks.length - 1].endIdx = cur.children.length;
      }
      continue;
    }

    // Tabella
    if (line.startsWith('|')) {
      tableLines.push(line);
      continue;
    } else if (tableLines.length > 0) {
      flushTable();
    }

    // Riga vuota
    if (line.trim() === '') continue;

    // H1 — nuova sezione Word
    if (line.match(/^# (?!#)/)) {
      flushTable();
      const title = line.replace(/^#\s+/, '');
      cur = { headerTitle: title, children: [], drBlocks: [] };
      sections.push(cur);
      cur.children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: sections.length > 1,
        spacing: { before: 240, after: 160, line: LINE_SPACE },
        children: [run(title, { size: SIZE_H1, bold: true })],
      }));
      continue;
    }

    // H2
    if (line.match(/^## (?!#)/)) {
      flushTable();
      const title = line.replace(/^##\s+/, '');
      addEl(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120, line: LINE_SPACE },
        children: [run(title, { size: SIZE_H2, bold: true })],
      }));
      continue;
    }

    // H3
    if (line.match(/^### /)) {
      flushTable();
      const title = line.replace(/^###\s+/, '');
      addEl(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 80, line: LINE_SPACE },
        children: [run(title, { bold: true, underline: {} })],
      }));
      continue;
    }

    // Elenco puntato
    if (line.match(/^- /)) {
      flushTable();
      const text = line.replace(/^-\s+/, '');
      addEl(makeBulletPara(parseInline(text, inDR)));
      continue;
    }

    // Elenco numerato
    if (line.match(/^\d+\.\s/)) {
      flushTable();
      const text = line.replace(/^\d+\.\s+/, '');
      addEl(makeNumberedPara(parseInline(text, inDR)));
      continue;
    }

    // Figura scelta dal professionista: immagine + didascalia numerata
    const figM = line.match(/^\[FIGURA:\s*(fig-\d+)\s*\]$/);
    if (figM) {
      flushTable();
      const id = figM[1];
      if (!figureNumero[id]) figureNumero[id] = Object.keys(figureNumero).length + 1;
      const n = figureNumero[id];
      const g = FIGURE[id] || {};
      const file = g.immagine ? path.join(FIGURE_DIR, g.immagine) : '';
      const buf = file && fs.existsSync(file) ? fs.readFileSync(file) : null;
      const dim = buf ? dimensioniImmagine(buf) : null;
      if (dim) {
        // Larghezza utile della pagina in pixel (1 px = 15 twip), altezza al massimo ~55% della pagina.
        const maxW = Math.floor(CONTENT_W / 15);
        const maxH = Math.floor((PAGE_H - MARGIN * 2) / 15 * 0.55);
        const k = Math.min(maxW / dim.w, maxH / dim.h, 1);
        addEl(new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          spacing: { before: 160, after: 60 },
          children: [new ImageRun({ type: dim.tipo, data: buf,
            transformation: { width: Math.round(dim.w * k), height: Math.round(dim.h * k) } })],
        }));
      } else {
        figureMancanti.push(id);
        addEl(new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          spacing: { before: 160, after: 60, line: LINE_SPACE },
          border: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
            left:   { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
            right:  { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
          },
          children: [run(`[ Figura ${n}: immagine da caricare ]`, { italics: true, color: '888888' })],
        }));
      }
      const didascalia = (g.didascalia || '').trim();
      addEl(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200, line: LINE_SPACE },
        children: [run(`Figura ${n}${didascalia ? ' — ' + didascalia : ''}`, { italics: true, size: Math.max(SIZE_BODY - 2, 16) })],
      }));
      continue;
    }

    // Segnaposto immagine
    const imgM = line.match(/^\[IMMAGINE:\s*(.+)\]$/);
    if (imgM) {
      flushTable();
      addEl(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 160, line: LINE_SPACE },
        border: {
          top:    { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
          left:   { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
          right:  { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
        },
        children: [run(`[ ${imgM[1]} ]`, { italics: true, color: '888888' })],
      }));
      continue;
    }

    // Paragrafo normale
    flushTable();
    addEl(bodyPara(parseInline(line, inDR)));
  }

  flushTable();
  return sections;
}

// ── Copertina ─────────────────────────────────────────────────────────────────
function makeCoverSection(meta) {
  const sp = { line: LINE_SPACE, lineRule: 'auto' };
  return {
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN * 3, right: MARGIN * 2, bottom: MARGIN * 2, left: MARGIN * 2 } },
    },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...sp, before: 1800, after: 600 },
        children: [run('OFFERTA TECNICA', { size: 40, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...sp, before: 0, after: 300 },
        children: [run(TITOLO, { size: 28 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...sp, before: 600, after: 200 },
        children: [run(meta.nomeGara, { size: 24, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...sp, before: 0, after: 120 },
        children: [run('CIG: ' + meta.CIG, { size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...sp, before: 0, after: 120 },
        children: [run('Stazione Appaltante: ' + meta.SA, { size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...sp, before: 500, after: 0 },
        children: [run('Data di presentazione: ' + meta.data, { size: 24 })] }),
    ],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
const raw      = fs.readFileSync(INPUT_FILE, 'utf8');
const sections = parseMd(raw);

const metaLine = raw.match(/<!--\s*GARA:\s*nome="([^"]+)"\s+CIG="([^"]+)"\s+SA="([^"]+)"\s+data="([^"]+)"\s*-->/);
const meta = metaLine
  ? { nomeGara: metaLine[1], CIG: metaLine[2], SA: metaLine[3], data: metaLine[4] }
  : { nomeGara: opt('gara', 'Offerta Tecnica'), CIG: opt('cig', ''), SA: opt('sa', ''), data: opt('data', new Date().toLocaleDateString('it-IT')) };

const docSections = [makeCoverSection(meta)];

for (const sec of sections) {
  docSections.push({
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
      // Numerazione righe nel margine sinistro — dimostra rispetto vincoli disciplinare
      // restart: 'newPage' → riparte da 1 a ogni facciata (verifica limite righe/facciata)
      // distance: 500 DXA (~0,88 cm) dal testo → rientra nel margine sinistro da 2 cm
      ...(NUMERI_RIGA ? { lineNumbers: { countBy: 1, start: 1, restart: 'newPage', distance: 500 } } : {}),
    },
    headers: { default: makeHeader(sec.headerTitle + ' — ' + meta.nomeGara) },
    footers: { default: makeFooter() },
    children: sec.children,
  });
}

const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets',  levels: [{ level: 0, format: LevelFormat.BULLET,  text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbered', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: FONT, size: SIZE_BODY } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: SIZE_H1, bold: true, font: FONT },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: SIZE_H2, bold: true, font: FONT },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: SIZE_H3, bold: true, font: FONT },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: docSections,
});

Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, buf);
  console.log('✓ Generato: ' + OUTPUT_FILE);
  if (Object.keys(figureNumero).length) {
    console.log('Figure inserite: ' + Object.keys(figureNumero).length
      + (figureMancanti.length ? ' (senza immagine: ' + figureMancanti.join(', ') + ')' : ''));
  }

  // Stima word count per sezione
  const wordCount = raw
    .replace(/^<!--.*-->$/gm, '')
    .replace(/^%%DR_(START|END).*$/gm, '')
    .replace(/^\|[-:\s|]+\|$/gm, '')
    .split(/\s+/).filter(Boolean).length;

  const facciate = ((wordCount / 12) / 40).toFixed(1);
  console.log('\nWord count totale: ' + wordCount);
  console.log('Facciate stimate:  ' + facciate);

  // Sezioni H2
  const subs = [...raw.matchAll(/^## (.+)$/gm)];
  console.log('\nSezioni presenti:');
  subs.forEach(m => console.log('  - ' + m[1]));

  // DR blocks
  const drBlocks = [...raw.matchAll(/^%%DR_START:\s*(.+)%%$/gm)];
  console.log('\nSezioni DA REVISIONARE (' + drBlocks.length + '):');
  drBlocks.forEach((m, i) => console.log('  ' + i + '. ' + m[1]));
});
