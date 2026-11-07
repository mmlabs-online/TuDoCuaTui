export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Whole-file error: an opening quote is never closed, so no row can be recovered. */
export class CsvParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.name = "CsvParseError";
    this.line = line;
  }
}

const isBlank = (c: string) => c === " " || c === "\t";

/** `;` when the first non-empty record has more unquoted `;` than `,`, otherwise `,`. */
function detectDelimiter(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let hasContent = false;
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') {
      inQuotes = !inQuotes;
      hasContent = true;
    } else if (inQuotes) {
      hasContent = true;
    } else if (c === "\n" || c === "\r") {
      if (hasContent) break;
      commas = 0;
      semicolons = 0;
    } else if (c === ",") {
      commas++;
    } else if (c === ";") {
      semicolons++;
    } else if (!isBlank(c)) {
      hasContent = true;
    }
  }
  return semicolons > commas ? ";" : ",";
}

function readRecords(text: string, delimiter: string): string[][] {
  const n = text.length;
  const records: string[][] = [];
  let fields: string[] = [];
  let line = 1;
  let i = 0;

  for (;;) {
    let start = i;
    while (start < n && isBlank(text[start])) start++;
    let value: string;
    if (text[start] === '"') {
      const openLine = line;
      value = "";
      i = start + 1;
      for (;;) {
        if (i >= n)
          throw new CsvParseError(
            `Unterminated quoted field starting on line ${openLine}`,
            openLine,
          );
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else if (c === "\r") {
          value += "\n";
          i += text[i + 1] === "\n" ? 2 : 1;
          line++;
        } else {
          if (c === "\n") line++;
          value += c;
          i++;
        }
      }
      let extra = "";
      while (i < n && text[i] !== delimiter && text[i] !== "\r" && text[i] !== "\n")
        extra += text[i++];
      if (extra.trim() !== "") value += extra;
    } else {
      let end = i;
      while (end < n && text[end] !== delimiter && text[end] !== "\r" && text[end] !== "\n") end++;
      value = text.slice(i, end);
      i = end;
    }
    fields.push(value);

    if (i < n && text[i] === delimiter) {
      i++;
      continue;
    }
    records.push(fields);
    fields = [];
    if (i >= n) break;
    i += text[i] === "\r" && text[i + 1] === "\n" ? 2 : 1;
    line++;
    if (i >= n) break;
  }
  return records;
}

/** Parses CSV text (RFC 4180 quoting, `,` or `;`, optional BOM). Throws CsvParseError on an unterminated quote. */
export function parseCsv(text: string): ParsedCsv {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records = readRecords(input, detectDelimiter(input)).filter((r) =>
    r.some((f) => f.trim() !== ""),
  );
  const [headers = [], ...rows] = records;
  return { headers, rows };
}
