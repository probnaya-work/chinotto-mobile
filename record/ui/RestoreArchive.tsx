import { useRecordTheme } from './appearance';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { RecordDb } from '../db';
import type { RecordPrivacy } from '../privacy';
import { prepareNativeRestore, removePickedArchive, type PreparedRestore } from '../nativeRestore';
import type { RestorePreview } from '../restoreRecord';

import { type } from './type';

export function RestoreArchive({ db, privacy, onRestored }: { db: RecordDb; privacy?: RecordPrivacy; onRestored: () => void }) {
  const { ink } = useRecordTheme();

  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const work = useRef<{ controller: AbortController; prepared?: PreparedRestore } | null>(null);
  const cancel = () => {
    work.current?.controller.abort(); work.current?.prepared?.dispose(); work.current = null;
    setPreview(null); setBusy(false); setStatus('');
  };
  useEffect(() => () => { work.current?.controller.abort(); work.current?.prepared?.dispose(); work.current = null; }, []);
  const choose = async () => {
    if (work.current) return;
    const task = { controller: new AbortController(), prepared: undefined as PreparedRestore | undefined };
    work.current = task; setBusy(true); setStatus('Reading and checking the archive…');
    try {
      if (privacy?.snapshot().enabled && !await privacy.request('unlock')) { cancel(); return; }
      const epoch = privacy?.snapshot().epoch;
      const allowed = () => !privacy || (privacy.canRead() && (!privacy.snapshot().enabled || privacy.snapshot().epoch === epoch));
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed'], copyToCacheDirectory: true, multiple: false });
      if (task.controller.signal.aborted) { if (!picked.canceled) removePickedArchive(picked.assets[0].uri); return; }
      if (picked.canceled) { cancel(); return; }
      try { task.prepared = await prepareNativeRestore(db, picked.assets[0].uri, task.controller.signal, allowed); }
      finally { removePickedArchive(picked.assets[0].uri); }
      if (task.controller.signal.aborted) { task.prepared.dispose(); return; }
      setPreview(task.prepared.preview); setStatus('');
    } catch (error) {
      if (!task.controller.signal.aborted) { setStatus(error instanceof Error ? error.message : 'The archive could not be read.'); work.current = null; }
    } finally { if (!task.controller.signal.aborted) setBusy(false); }
  };
  const restore = async () => {
    const task = work.current;
    if (!task?.prepared || busy) return;
    setBusy(true); setStatus('Restoring…');
    try {
      const done = await task.prepared.restore();
      if (!task.controller.signal.aborted) {
        setStatus(`Restored ${done.newMoments} thoughts, ${done.audioFiles} recordings and ${done.newArchived} archived items. Your existing Record was kept.`);
        onRestored(); setPreview(null);
      }
    } catch (error) {
      if (!task.controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'The archive could not be restored.');
    } finally { setPreview(null); task.prepared.dispose(); if (work.current === task) work.current = null; if (!task.controller.signal.aborted) setBusy(false); }
  };
  const body = type({ size: 13, width: 94, lineHeight: 1.4, color: ink.meta });
  return <View style={{ paddingVertical: 12, gap: 10 }}>
    <Text style={type({ size: 16, width: 94, color: ink.near })}>restore from archive</Text>
    <Text style={body}>Choose a Chinotto ZIP from this phone or Mac. Review it before adding anything. Original dates, history and audio stay together.</Text>
    {preview ? <View style={{ gap: 8 }}>
      <Text style={body}>{preview.newMoments} thoughts · {preview.audioFiles} recordings · {preview.newArchived} archived items</Text>
      {preview.from ? <Text style={body}>{new Date(preview.from).toLocaleDateString()} — {new Date(preview.to!).toLocaleDateString()}</Text> : null}
      <Text style={body}>{preview.duplicates} already here · {preview.changed} with different wording · {preview.removed} previously removed. Existing thoughts keep their current wording.</Text>
      {preview.waitingLinks || preview.skippedJudgements ? <Text style={body}>{preview.waitingLinks} links have a missing predecessor; {preview.skippedJudgements} trace choices refer to missing thoughts.</Text> : null}
      {preview.sample.map((row, i) => <Text key={i} style={body}>{row.body || 'voice recording'}</Text>)}
      <Text style={body}>A recovery copy of the database is saved on this device before restoring.</Text>
      {!busy ? <Action label="Restore archive" onPress={() => void restore()}>restore {preview.newMoments} thoughts ›</Action> : null}
    </View> : null}
    {status ? <Text accessibilityLiveRegion="polite" style={body}>{status}</Text> : null}
    {work.current ? <Action label="Cancel restore" onPress={cancel}>cancel</Action>
      : <Action label="Choose archive" onPress={() => void choose()}>choose archive ›</Action>}
  </View>;
}
function Action({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const { agency } = useRecordTheme();

  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}>
    <Text style={type({ size: 14, width: 94, color: agency.quiet })}>{children}</Text>
  </Pressable>;
}
