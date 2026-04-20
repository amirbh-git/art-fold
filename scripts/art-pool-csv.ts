/**
 * RFC 4180-style CSV helpers for art pool backup / restore.
 * Newlines inside fields are flattened on export so each DB row is one CSV line.
 */

export function flattenCsvField(s: string): string {
  return s.replace(/\r\n/g, " ").replace(/[\r\n]/g, " ");
}

export function csvEscapeCell(value: string | null | undefined): string {
  const v = flattenCsvField(value ?? "");
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Parse one CSV line (supports quoted fields; no unescaped newlines inside fields). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        out.push(cur);
        cur = "";
        i++;
        continue;
      }
      cur += c;
      i++;
    }
  }
  out.push(cur);
  return out;
}
