import { RecordZipWriter } from '../zip';

it('writes a standard UTF-8 ZIP entry with correct CRC and size', () => {
  const chunks: Uint8Array[] = [];
  const zip = new RecordZipWriter({ writeBytes: (chunk) => chunks.push(chunk.slice()) });
  zip.start('chinotto-record/café.txt');
  zip.write(new TextEncoder().encode('he'));
  zip.write(new TextEncoder().encode('llo'));
  zip.end();
  zip.finish();
  const archive = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { archive.set(chunk, offset); offset += chunk.length; }
  const view = new DataView(archive.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  const nameLength = view.getUint16(26, true);
  const name = new TextDecoder().decode(archive.slice(30, 30 + nameLength));
  expect(name).toBe('chinotto-record/café.txt');
  const descriptor = 30 + nameLength + 5;
  expect(new TextDecoder().decode(archive.slice(30 + nameLength, descriptor))).toBe('hello');
  expect(view.getUint32(descriptor, true)).toBe(0x08074b50);
  expect(view.getUint32(descriptor + 4, true)).toBe(0x3610a686);
  expect(view.getUint32(descriptor + 8, true)).toBe(5);
  expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
});

it('rejects unsafe filenames', () => {
  const zip = new RecordZipWriter({ writeBytes: () => {} });
  expect(() => zip.start('../outside.txt')).toThrow('Unsafe');
});
