/** Streaming, uncompressed ZIP. Audio is already compressed; no full recording enters JS memory. */
export type ByteSink = { writeBytes(bytes: Uint8Array): void };

const encoder = new TextEncoder();
const MAX_U32 = 0xffffffff;

function header(length: number, signature: number): DataView {
  const view = new DataView(new ArrayBuffer(length));
  view.setUint32(0, signature, true);
  return view;
}

function bytes(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer);
}

function crc32(previous: number, chunk: Uint8Array): number {
  let crc = previous;
  for (const byte of chunk) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc;
}

type IndexEntry = { name: Uint8Array; offset: number; size: number; crc: number };

export class RecordZipWriter {
  private position = 0;
  private index: IndexEntry[] = [];
  private current: { name: Uint8Array; offset: number; size: number; crc: number } | null = null;

  constructor(private sink: ByteSink) {}

  private put(chunk: Uint8Array) {
    if (this.position + chunk.length > MAX_U32) throw new Error('The export exceeds ZIP size limits.');
    this.sink.writeBytes(chunk);
    this.position += chunk.length;
  }

  start(name: string) {
    if (this.current) throw new Error('Finish the current ZIP entry first.');
    if (this.index.length >= 65535) throw new Error('The export contains too many files.');
    const encoded = encoder.encode(name);
    if (!name || name.startsWith('/') || name.includes('..') || encoded.length > 65535) {
      throw new Error('Unsafe export filename.');
    }
    const h = header(30, 0x04034b50);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0808, true); // UTF-8 and trailing data descriptor.
    h.setUint16(26, encoded.length, true);
    const offset = this.position;
    this.put(bytes(h));
    this.put(encoded);
    this.current = { name: encoded, offset, size: 0, crc: 0xffffffff };
  }

  write(chunk: Uint8Array) {
    const current = this.current;
    if (!current) throw new Error('Start a ZIP entry before writing.');
    if (current.size + chunk.length > MAX_U32) throw new Error('A recording exceeds ZIP size limits.');
    this.put(chunk);
    current.size += chunk.length;
    current.crc = crc32(current.crc, chunk);
  }

  end() {
    const current = this.current;
    if (!current) throw new Error('No ZIP entry to finish.');
    const crc = (current.crc ^ 0xffffffff) >>> 0;
    const descriptor = header(16, 0x08074b50);
    descriptor.setUint32(4, crc, true);
    descriptor.setUint32(8, current.size, true);
    descriptor.setUint32(12, current.size, true);
    this.put(bytes(descriptor));
    this.index.push({ name: current.name, offset: current.offset, size: current.size, crc });
    this.current = null;
  }

  finish() {
    if (this.current) throw new Error('Finish the current ZIP entry first.');
    const centralOffset = this.position;
    for (const entry of this.index) {
      const h = header(46, 0x02014b50);
      h.setUint16(4, 20, true);
      h.setUint16(6, 20, true);
      h.setUint16(8, 0x0808, true);
      h.setUint32(16, entry.crc, true);
      h.setUint32(20, entry.size, true);
      h.setUint32(24, entry.size, true);
      h.setUint16(28, entry.name.length, true);
      h.setUint32(42, entry.offset, true);
      this.put(bytes(h));
      this.put(entry.name);
    }
    const centralSize = this.position - centralOffset;
    const end = header(22, 0x06054b50);
    end.setUint16(8, this.index.length, true);
    end.setUint16(10, this.index.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, centralOffset, true);
    this.put(bytes(end));
  }
}
