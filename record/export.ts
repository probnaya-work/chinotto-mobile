import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';

import type { RecordDb } from './db';
import { isRetainedAudioPath } from './files';
import { availableDeviceBytes } from './storage';
import { RecordZipWriter } from './zip';
import { exportDirectory, keepExportFile, releaseExportFile } from './exportTemp';

const encoder = new TextEncoder();
const AUDIO_CHUNK = 256 * 1024;
const PAGE = 100;

type Fragment = {
  id: string;
  body: string;
  captured_at: string;
  capture_method: string;
  capture_origin: string | null;
  corrected_at: string | null;
  correction_count: number;
  legacy_entry_id: string | null;
  legacy_edit_count: number;
};
type Audio = { fragment_id: string; audio_path: string; size: number; modified: number | null; archive_path: string };

function audioFingerprint(path: string): { size: number; modified: number | null } | null {
  try {
    const file = new File(Paths.document, path);
    return file.exists && file.size !== null
      ? { size: file.size, modified: file.modificationTime ?? null }
      : null;
  } catch {
    return null;
  }
}

function sameAudio(item: Audio): boolean {
  const current = audioFingerprint(item.audio_path);
  return current !== null && current.size === item.size && current.modified === item.modified;
}
type Snapshot = { db: RecordDb; close: () => Promise<void> };

async function nativeSnapshot(source: RecordDb): Promise<Snapshot> {
  const directory = exportDirectory();
  const name = `snapshot-${randomUUID()}.db`;
  const file = new File(directory, name);
  keepExportFile(file);
  let snapshot: SQLiteDatabase | null = null;
  const removeSnapshotFiles = () => {
    for (const suffix of ['', '-wal', '-shm']) {
      const part = new File(directory, `${name}${suffix}`);
      if (part.exists) part.delete();
    }
    releaseExportFile(file);
  };
  try {
    snapshot = await openDatabaseAsync(name, { useNewConnection: true }, directory.uri);
    await backupDatabaseAsync({ sourceDatabase: source as SQLiteDatabase, destDatabase: snapshot });
    return {
      db: snapshot,
      close: async () => {
        await snapshot?.closeAsync();
        removeSnapshotFiles();
      },
    };
  } catch (error) {
    await snapshot?.closeAsync();
    removeSnapshotFiles();
    throw error;
  }
}

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Export cancelled.');
}

async function children(db: RecordDb, table: string, ids: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE fragment_id IN (${ids.map(() => '?').join(',')})`, ...ids
  );
  const byId = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const id = String(row.fragment_id);
    byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  return byId;
}

async function* pages(db: RecordDb): AsyncGenerator<Fragment[]> {
  let lastAt = '';
  let lastId = '';
  for (;;) {
    const rows = await db.getAllAsync<Fragment>(
      `SELECT id, body, captured_at, capture_method, capture_origin, corrected_at,
              correction_count, legacy_entry_id, legacy_edit_count
         FROM fragments WHERE removed_at IS NULL
           AND (captured_at > ? OR (captured_at = ? AND id > ?))
        ORDER BY captured_at, id LIMIT ?`, lastAt, lastAt, lastId, PAGE
    );
    if (!rows.length) return;
    yield rows;
    lastAt = rows[rows.length - 1].captured_at;
    lastId = rows[rows.length - 1].id;
  }
}

/**
 * Portable ZIP: desktop-compatible record.txt, plus complete structured JSON Lines and
 * original .m4a files. It is an export for people and tools, not a restorable app backup.
 */
export async function exportLocalRecord(db: RecordDb, signal?: AbortSignal, snapshotFactory = nativeSnapshot): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  check(signal);
  const snapshot = await snapshotFactory(db);
  db = snapshot.db;
  let file: File | null = null;
  let handle: ReturnType<File['open']> | null = null;
  try {
    await db.execAsync('CREATE TEMP TABLE export_audio (fragment_id TEXT PRIMARY KEY, audio_path TEXT NOT NULL, size INTEGER NOT NULL, modified REAL, archive_path TEXT NOT NULL)');
    let audioBytes = 0;
    let lastAudioId = '';
    for (;;) {
      const rows = await db.getAllAsync<{ fragment_id: string; audio_path: string; audio_missing: number }>(
        `SELECT v.fragment_id, v.audio_path, v.audio_missing FROM voice_captures v
           JOIN fragments f ON f.id = v.fragment_id
          WHERE f.removed_at IS NULL AND v.fragment_id > ? ORDER BY v.fragment_id LIMIT ?`, lastAudioId, PAGE
      );
      if (!rows.length) break;
      for (const row of rows) {
        check(signal);
        if (!isRetainedAudioPath(row.audio_path)) throw new Error('A recording has an invalid path; export stopped.');
        const fingerprint = audioFingerprint(row.audio_path);
        if (fingerprint === null && row.audio_missing === 1) continue;
        if (fingerprint === null) throw new Error('A retained recording is missing; export stopped.');
        audioBytes += fingerprint.size;
        await db.runAsync('INSERT INTO export_audio (fragment_id, audio_path, size, modified, archive_path) VALUES (?, ?, ?, ?, ?)',
          row.fragment_id, row.audio_path, fingerprint.size, fingerprint.modified,
          `chinotto-record/audio/${encodeURIComponent(row.fragment_id).replace(/\./g, '%2E')}.m4a`);
      }
      lastAudioId = rows[rows.length - 1].fragment_id;
    }
    const estimate = await db.getFirstAsync<{ size: number; count: number }>(
      'SELECT COALESCE(SUM(LENGTH(body)), 0) AS size, COUNT(*) AS count FROM fragments WHERE removed_at IS NULL'
    );
    const required = audioBytes
      + (estimate?.size ?? 0) * 3 + (estimate?.count ?? 0) * 4096 + 8 * 1024 ** 2;
    const free = availableDeviceBytes();
    if (free !== null && free < required) {
      throw new Error('Not enough free space to prepare the export. Free some space and try again.');
    }

    file = new File(exportDirectory(), `chinotto-record-${randomUUID()}.zip`);
    keepExportFile(file);
  try {
    file.create();
    handle = file.open();
    const zip = new RecordZipWriter(handle);
    zip.start('chinotto-record/README.txt');
    zip.write(encoder.encode(
      'Chinotto Record export\n\nrecord.txt is readable in date order. record.jsonl contains one JSON object per moment, including correction history, relationships, source metadata and audio filenames. audio/ contains original retained recordings. archived.jsonl contains older user-authored material preserved through migration. This archive is not a restorable Chinotto backup. It contains private material; keep it somewhere you trust.\n'
    ));
    zip.end();

    zip.start('chinotto-record/record.jsonl');
    for await (const page of pages(db)) {
      check(signal);
      const ids = page.map((row) => row.id);
      const [revisions, continuations, holds, encounters, voiceCaptures, transcripts, judgements, conflicts, audioById] = await Promise.all([
        children(db, 'fragment_revisions', ids),
        children(db, 'continuations', ids),
        children(db, 'holds', ids),
        children(db, 'encounters', ids),
        children(db, 'voice_captures', ids),
        children(db, 'voice_transcripts', ids),
        children(db, 'trace_judgements', ids),
        children(db, 'wording_conflicts', ids),
        children(db, 'export_audio', ids),
      ]);
      for (const fragment of page) {
        check(signal);
        const id = fragment.id;
        const original = audioById.get(id)?.[0] as Audio | undefined;
        zip.write(encoder.encode(JSON.stringify({
          version: 1,
          ...fragment,
          revisions: revisions.get(id) ?? [],
          continuations: continuations.get(id) ?? [],
          holds: holds.get(id) ?? [],
          encounters: encounters.get(id) ?? [],
          voice_capture: voiceCaptures.get(id)?.[0] ?? null,
          transcript: transcripts.get(id)?.[0] ?? null,
          trace_judgements: judgements.get(id) ?? [],
          wording_conflict: conflicts.get(id)?.[0] ?? null,
          audio: original ? { path: original.archive_path, bytes: original.size } : null,
        }) + '\n'));
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    zip.end();

    zip.start('chinotto-record/archived.jsonl');
    let lastArchivedAt = '';
    let lastArchivedId = '';
    for (;;) {
      const archived = await db.getAllAsync<{ id: string; kind: string; archived_at: string; body: string }>(
        `SELECT id, kind, archived_at, body FROM archived_material
          WHERE archived_at > ? OR (archived_at = ? AND id > ?)
          ORDER BY archived_at, id LIMIT ?`, lastArchivedAt, lastArchivedAt, lastArchivedId, PAGE
      );
      if (!archived.length) break;
      for (const row of archived) {
        check(signal);
        zip.write(encoder.encode(JSON.stringify(row) + '\n'));
      }
      lastArchivedAt = archived[archived.length - 1].archived_at;
      lastArchivedId = archived[archived.length - 1].id;
    }
    zip.end();

    // Same readable contract as desktop, streamed instead of assembled into one large string.
    zip.start('chinotto-record/record.txt');
    for await (const page of pages(db)) {
      check(signal);
      for (const fragment of page) {
        zip.write(encoder.encode(
          `${fragment.captured_at} · ${fragment.capture_method}${fragment.capture_origin ? ` · ${fragment.capture_origin}` : ''}${fragment.correction_count ? ' · wording corrected' : ''}\n${fragment.body}\n\n`
        ));
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    zip.end();

    let lastExportAudioId = '';
    for (;;) {
      const audio = await db.getAllAsync<Audio>(
        'SELECT fragment_id, audio_path, size, modified, archive_path FROM export_audio WHERE fragment_id > ? ORDER BY fragment_id LIMIT ?',
        lastExportAudioId, PAGE
      );
      if (!audio.length) break;
      for (const item of audio) {
        check(signal);
        const source = new File(Paths.document, item.audio_path);
        if (!source.exists) throw new Error('A retained recording changed during export; export stopped.');
        const reader = source.open();
        try {
          if (!sameAudio(item)) throw new Error('A recording changed during export; export stopped.');
          zip.start(item.archive_path);
          let copied = 0;
          while (copied < item.size) {
            check(signal);
            const chunk = reader.readBytes(Math.min(AUDIO_CHUNK, item.size - copied));
            if (!chunk.length) throw new Error('A recording could not be read completely; export stopped.');
            zip.write(chunk);
            copied += chunk.length;
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
          if (!sameAudio(item)) throw new Error('A recording changed during export; export stopped.');
          zip.end();
        } finally {
          reader.close();
        }
      }
      lastExportAudioId = audio[audio.length - 1].fragment_id;
    }
    zip.finish();
    handle.close();
    handle = null;
    check(signal);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Export the Record', UTI: 'public.zip-archive' });
  } finally {
    handle?.close();
    if (file?.exists) file.delete();
    if (file) releaseExportFile(file);
  }
  } finally {
    await snapshot.close();
  }
}
