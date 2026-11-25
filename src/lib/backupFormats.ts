/** Pure file builders for the Backup Data section: JSON, NDJSON, CSV (one file per table) and a store-only ZIP. No dependencies. */
export type TableData = { name: string; rows: any[] };

export function toJson(manifest: any, tables: TableData[]): string {
  const data: Record<string, any[]> = {};
  for (const t of tables) data[t.name] = t.rows;
  return JSON.stringify({ manifest, data }, null, 2);
}
/** One JSON object per line. The first line is the manifest; every later line carries its table name. */
export function toNdjson(manifest: any, tables: TableData[]): string {
  const lines = [JSON.stringify({ _manifest: manifest })];
  for (const t of tables) for (const r of t.rows) lines.push(JSON.stringify({ _table: t.name, ...r }));
  return lines.join("\n") + "\n";
}
const cell = (v: any): string => {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Spreadsheet formula injection: a cell that starts with these is read as a formula by Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows: any[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r || {})) if (!cols.includes(k)) cols.push(k);
  const out = [cols.map(cell).join(",")];
  for (const r of rows) out.push(cols.map((c) => cell(r?.[c])).join(","));
  return "\uFEFF" + out.join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8 (Arabic) correctly
}

let CRC: Uint32Array | null = null;
export function crc32(b: Uint8Array): number {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files: { name: string; data: Uint8Array }[], now = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255]; const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data); const flags = 0x0800; // UTF-8 names
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, f.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0)); let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
export function toCsvZip(manifest: any, tables: TableData[]): Uint8Array {
  const enc = new TextEncoder();
  const safe = (n: string) => n.replace(/[^A-Za-z0-9_.-]/g, "_");
  const files = tables.map((t) => ({ name: `${safe(t.name)}.csv`, data: enc.encode(toCsv(t.rows)) }));
  files.push({ name: "MANIFEST.json", data: enc.encode(JSON.stringify(manifest, null, 2)) });
  return makeZip(files);
}
