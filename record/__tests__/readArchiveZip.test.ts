import { zipSync, strToU8 } from 'fflate';
import { openArchiveZip } from '../readArchiveZip';
import { RecordZipWriter } from '../zip';
const source = (bytes: Uint8Array) => ({ size: bytes.length, read: (at: number, n: number) => bytes.slice(at, at + n) });
const file = 'chinotto-record/record.jsonl';
it.each([0, 6] as const)('reads stored and deflated Unicode archives at level %i', async (level) => {
  const zip = openArchiveZip(source(zipSync({ [file]: strToU8('{"body":"мысль, café"}\n') }, { level })));
  expect(await zip.jsonLines(file)).toEqual([{ body: 'мысль, café' }]);
});
it('reads the existing streaming phone writer with data descriptors', async () => {
  const chunks: Uint8Array[] = []; const writer = new RecordZipWriter({ writeBytes: (bytes) => chunks.push(bytes) });
  writer.start(file); writer.write(strToU8('{"id":"old-phone"}\n')); writer.end(); writer.finish();
  const buffer = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0)); let offset = 0;
  chunks.forEach((b) => { buffer.set(b, offset); offset += b.length; });
  expect(await openArchiveZip(source(buffer)).jsonLines(file)).toEqual([{ id: 'old-phone' }]);
});
it('rejects corrupt bytes, traversal and truncation before restoring', async () => {
  const bytes = zipSync({ [file]: strToU8('{"body":"wording"}\n') }, { level: 0 });
  const zip = openArchiveZip(source(bytes)); const entry = zip.entries.get(file)!; bytes[entry.offset] ^= 1;
  await expect(zip.jsonLines(file)).rejects.toThrow();
  expect(() => openArchiveZip(source(bytes.slice(0, -5)))).toThrow();
  expect(() => openArchiveZip(source(zipSync({ 'chinotto-record/../private': strToU8('secret') })))).toThrow();
});
it('honors cancellation before reading material', async () => {
  const zip = openArchiveZip(source(zipSync({ [file]: strToU8('{}\n') })));
  const abort = new AbortController(); abort.abort();
  await expect(zip.jsonLines(file, abort.signal)).rejects.toThrow();
});
