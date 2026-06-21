// csv.js — a small, robust CSV parser (RFC 4180-ish).
//
// Handles quoted fields, commas and newlines inside quotes, and ""-escaped
// quotes. Returns an array of rows; each row is an array of string cells.
// No dependencies, so it works offline once the service worker has cached it.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip a leading UTF-8 BOM if present (Google's CSV export usually has none,
  // but pasted/edited files sometimes do).
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const n = text.length;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;                            // closing quote
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; } // CRLF or lone CR
    if (c === '\n') { endRow(); i++; continue; }

    field += c; i++;
  }

  // Flush trailing field/row, but not a phantom empty row after a final newline.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}
