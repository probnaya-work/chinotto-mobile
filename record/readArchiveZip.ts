import { Inflate } from 'fflate';
import { crc32 } from './zip';

export type ArchiveSource = { size: number; read(offset: number, length: number): Uint8Array };
export type ArchiveEntry = { name: string; size: number; compressed: number; method: number; crc: number; offset: number };
export const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3;
export const MAX_METADATA_BYTES = 32 * 1024 ** 2;
const fail = () => new Error('This archive is damaged or uses an unsupported ZIP format.');
const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
export const safeArchivePath = (name: string) => name.startsWith('chinotto-record/') &&
  !name.includes('\\') && !name.includes('\0') && !name.split('/').some((part) => part === '..' || part === '.');

/** Seek through the central directory; never trust extraction paths or advertised sizes. */
export function openArchiveZip(source: ArchiveSource) {
  const read = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > source.size) throw fail();
    const bytes = source.read(offset, length);
    if (bytes.length !== length) throw fail();
    return bytes;
  };
  const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  if (source.size < 22 || source.size > MAX_ARCHIVE_BYTES) throw fail();
  const tail = read(Math.max(0, source.size - 65557), Math.min(source.size, 65557));
  const end = view(tail);
  let at = tail.length - 22;
  while (at >= 0 && !(end.getUint32(at, true) === 0x06054b50 && at + 22 + end.getUint16(at + 20, true) === tail.length)) at--;
  if (at < 0 || end.getUint16(at + 4, true) || end.getUint16(at + 6, true)) throw fail();
  const count = end.getUint16(at + 10, true);
  const centralSize = end.getUint32(at + 12, true);
  const central = end.getUint32(at + 16, true);
  if (count === 65535 || count !== end.getUint16(at + 8, true) || central + centralSize !== source.size - tail.length + at) throw fail();
  let cursor = central; let expanded = 0;
  const entries = new Map<string, ArchiveEntry>();
  const ranges: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const h = view(read(cursor, 46));
    const nameSize = h.getUint16(28, true), extra = h.getUint16(30, true), comment = h.getUint16(32, true);
    const flags = h.getUint16(8, true), method = h.getUint16(10, true);
    const name = text(read(cursor + 46, nameSize));
    if (h.getUint32(0, true) !== 0x02014b50 || !safeArchivePath(name) || entries.has(name) ||
        (flags & 1) || ![0, 8].includes(method) || h.getUint16(34, true) ||
        ((h.getUint32(38, true) >>> 16) & 0xf000) === 0xa000) throw fail();
    const entry = { name, method, crc: h.getUint32(16, true), compressed: h.getUint32(20, true), size: h.getUint32(24, true), offset: h.getUint32(42, true) };
    const local = view(read(entry.offset, 30));
    const localName = local.getUint16(26, true), localExtra = local.getUint16(28, true);
    if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(8, true) !== method ||
        local.getUint16(6, true) !== flags || text(read(entry.offset + 30, localName)) !== name) throw fail();
    entry.offset += 30 + localName + localExtra;
    if (entry.offset + entry.compressed > central || entry.size > MAX_ARCHIVE_BYTES ||
        (!name.startsWith('chinotto-record/audio/') && entry.size > MAX_METADATA_BYTES)) throw fail();
    ranges.push([h.getUint32(42, true), entry.offset + entry.compressed]);
    expanded += entry.size;
    if (expanded > MAX_ARCHIVE_BYTES) throw new Error('The archive expands beyond the supported 2 GB limit.');
    entries.set(name, entry);
    cursor += 46 + nameSize + extra + comment;
  }
  if (cursor !== central + centralSize) throw fail();
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((r, i) => i > 0 && r[0] < ranges[i - 1][1])) throw fail();
  return {
    entries,
    async extract(name: string, sink: (chunk: Uint8Array) => void, signal?: AbortSignal) {
      const entry = entries.get(name);
      if (!entry) throw new Error('A file listed in the archive is missing.');
      let size = 0, crc = 0xffffffff;
      const emit = (chunk: Uint8Array) => {
        size += chunk.length;
        if (size > entry.size || signal?.aborted) throw fail();
        crc = crc32(crc, chunk); sink(chunk);
      };
      const inflater = entry.method === 8 ? new Inflate(emit) : null;
      for (let offset = 0; offset < entry.compressed; offset += 64 * 1024) {
        if (signal?.aborted) throw new Error('Restore cancelled.');
        const chunk = read(entry.offset + offset, Math.min(64 * 1024, entry.compressed - offset));
        if (inflater) inflater.push(chunk, offset + chunk.length === entry.compressed);
        else emit(chunk);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (size !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw fail();
    },
    async jsonLines(name: string, signal?: AbortSignal): Promise<unknown[]> {
      const decoder = new TextDecoder('utf-8', { fatal: true }); let buffer = ''; const rows: unknown[] = [];
      const consume = (chunk: string) => {
        buffer += chunk;
        let index: number;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (line.trim()) rows.push(JSON.parse(line));
          if (rows.length > 100000) throw new Error('This archive contains too many moments.');
        }
        if (buffer.length > 2 * 1024 ** 2) throw new Error('A moment in this archive is too large.');
      };
      await this.extract(name, (chunk) => consume(decoder.decode(chunk, { stream: true })), signal);
      consume(decoder.decode());
      if (buffer.trim()) rows.push(JSON.parse(buffer));
      return rows;
    },
  };
}
