#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, HeadingLevel, AlignmentType, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, LevelFormat
} = require('docx');

// ── Percorsi ──────────────────────────────────────────────────────────────────
const ROOT        = process.cwd();
const INPUT_FILE  = path.join(ROOT, 'output/10_offer/bozza_contenuto.md');
const OUTPUT_FILE = path.join(ROOT, 'output/10_offer/bozza_offerta_tecnica.docx');

// ── Configurazione tipografica ─────────────────────────────────────────────────
const FONT        = 'Times New Roman';
const SIZE_BODY   = 24;
const SIZE_H1     = 28;
const SIZE_H2     = 24;
const SIZE_H3     = 24;
const SIZE_HEADER = 20;
const LINE_SPACE  = 276;
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
        children: [run('Relazione Tecnico-Illustrativa', { size: 28 })] }),
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
  : { nomeGara: 'Offerta Tecnica', CIG: '', SA: '', data: new Date().toLocaleDateString('it-IT') };

const docSections = [makeCoverSection(meta)];

for (const sec of sections) {
  docSections.push({
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
      // Numerazione righe nel margine sinistro — dimostra rispetto vincoli disciplinare
      // restart: 'newPage' → riparte da 1 a ogni facciata (verifica limite righe/facciata)
      // distance: 500 DXA (~0,88 cm) dal testo → rientra nel margine sinistro da 2 cm
      lineNumbers: { countBy: 1, start: 1, restart: 'newPage', distance: 500 },
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
