import JSZip from "jszip";

/**
 * Minimal .docx handling built on JSZip. We read and patch `word/document.xml`
 * directly so a tailored resume keeps the user's exact Word layout — fonts,
 * spacing, bullets — with only the approved lines swapped.
 */

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type LineChange = { original: string; tailored: string };

/** Matches whole paragraphs, including self-closing empty ones. `\b` skips `<w:pPr>`. */
const PARAGRAPH = /<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g;
const TEXT_RUN = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
const PARA_PROPS = /<w:pPr\b[\s\S]*?<\/w:pPr>/;

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Whitespace-collapsed, bullet-stripped form used for matching lines. */
export function normalizeLine(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[•●▪◦‣\-–*]\s*/, "");
}

/** Paragraph text with tab stops and breaks rendered as spaces/newlines. */
function paragraphText(paragraph: string) {
  const body = paragraph.replace(PARA_PROPS, "");
  let text = "";
  for (const m of body.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)) {
    if (m[1] !== undefined) text += decodeXml(m[1]);
    else if (m[0].startsWith("<w:tab")) text += "\t";
    else text += "\n";
  }
  return text;
}

async function loadDocument(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("Not a Word document.");
  return { zip, xml: await file.async("string") };
}

/** Plain text of a .docx, one paragraph per line. */
export async function extractDocxText(bytes: Uint8Array) {
  const { xml } = await loadDocument(bytes);
  const lines: string[] = [];
  for (const [paragraph] of xml.matchAll(PARAGRAPH)) {
    const text = paragraphText(paragraph).replace(/[  ]+/g, " ").trim();
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

/**
 * Swaps each change's original line for its tailored text inside the user's own
 * .docx. Only paragraphs made of plain text runs are touched — lines that mix
 * text with tab stops (role / date rows) would lose their alignment, so those
 * are reported back as missed instead.
 */
export async function applyChangesToDocx(bytes: Uint8Array, changes: LineChange[]) {
  const { zip, xml } = await loadDocument(bytes);
  const pending = changes.map((c) => ({ ...c, key: normalizeLine(c.original) }));
  const applied = new Set<number>();

  const patched = xml.replace(PARAGRAPH, (paragraph) => {
    const text = normalizeLine(paragraphText(paragraph));
    if (!text) return paragraph;
    const index = pending.findIndex(
      (c, i) => !applied.has(i) && c.key.length >= 12 && text.includes(c.key),
    );
    if (index === -1) return paragraph;

    const body = paragraph.replace(PARA_PROPS, "");
    if (/<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/.test(body)) return paragraph;

    const change = pending[index]!;
    const next = text.replace(change.key, change.tailored.trim());
    applied.add(index);

    let first = true;
    return paragraph.replace(TEXT_RUN, (_m, _open: string, _text: string, close: string) => {
      if (!first) return `<w:t xml:space="preserve">${close}`;
      first = false;
      return `<w:t xml:space="preserve">${encodeXml(next)}${close}`;
    });
  });

  zip.file("word/document.xml", patched);
  const out = await zip.generateAsync({ type: "uint8array" });
  return { bytes: out, applied: applied.size, missed: pending.filter((_, i) => !applied.has(i)) };
}

/** Applies changes to plain text (PDF uploads). Matches across line wraps. */
export function applyChangesToText(text: string, changes: LineChange[]) {
  let out = text;
  const missed: LineChange[] = [];
  for (const change of changes) {
    const words = normalizeLine(change.original).split(" ").filter(Boolean);
    if (words.length < 3) {
      missed.push(change);
      continue;
    }
    const pattern = new RegExp(
      words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"),
    );
    if (pattern.test(out)) out = out.replace(pattern, () => change.tailored.trim());
    else missed.push(change);
  }
  return { text: out, missed };
}

/** Builds a clean, single-font .docx from paragraphs. */
export async function buildDocx(paragraphs: string[]) {
  const body = paragraphs
    .map((p) => {
      const runs = p
        .split("\n")
        .map((line, i) => `${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${encodeXml(line)}</w:t>`)
        .join("");
      return `<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr>${runs}</w:r></w:p>`;
    })
    .join("");

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}
