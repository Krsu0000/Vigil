import { useEffect, useRef, useState } from 'react';
import type { AutoSave } from '../runtime/auto-save.ts';
import type { ContentDb } from '../content/types.ts';
import { readSaveFile } from '../runtime/read-save-file.ts';
import { serializeSave } from '../persistence/save-file.ts';
import type { SaveFile } from '../persistence/save-file.ts';
import { strings } from './strings/index.ts';

export function SaveFiles({ autoSave, content, busy, onBusyChange, persistent }: {
  autoSave: AutoSave; content: ContentDb; persistent: boolean; busy: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(false);
  const [candidate, setCandidate] = useState<{ name: string; save: SaveFile } | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const apply = async () => {
    if (!candidate || busy) return;
    onBusyChange(true);
    try {
      if (await autoSave.importSave(candidate.save)) {
        setCandidate(null);
        setMessage(strings.importSucceeded);
      } else setMessage(strings.importWriteFailed);
    } finally { if (alive.current) onBusyChange(false); }
  };
  return (
    <section className="save-files" aria-labelledby="save-files-heading" aria-busy={busy}>
      <h3 id="save-files-heading">{strings.saveFiles}</h3>
      <p>{strings.saveFilesHelp}</p>
      <div className="save-file-actions">
        <button type="button" disabled={busy} onClick={() => {
          try {
            const save = autoSave.exportSave();
            const url = URL.createObjectURL(new Blob([serializeSave(save)], { type: 'application/json;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `last-vigil-${save.saveId}-${save.savedAt}.json`;
            document.body.append(link);
            try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
            setMessage(strings.exportRequested);
          } catch { setMessage(strings.exportFailed); }
        }}>{strings.exportSave}</button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{strings.chooseSaveFile}</button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label={strings.chooseSaveFile} disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file || busy) return;
          setCandidate(null); setMessage(''); onBusyChange(true);
          void readSaveFile(file, content).then(save => {
            if (alive.current) setCandidate({ name: file.name, save });
          }).catch(() => {
            if (alive.current) setMessage(strings.importInvalid);
          }).finally(() => { if (alive.current) onBusyChange(false); });
        }} />
      {candidate && <div className="save-file-preview">
        <h4>{strings.importPreview}</h4>
        <p className="save-file-name">{candidate.name}</p>
        <dl>
          <div><dt>{strings.gameTime}</dt><dd>{candidate.save.state.meta.gameTime}{strings.tickUnit}</dd></div>
          <div><dt>{strings.stamina}</dt><dd>{candidate.save.state.character ? `${candidate.save.state.character.stamina.current} / ${candidate.save.state.character.stamina.max}` : strings.unplacedSave}</dd></div>
          <div><dt>{strings.savedTime}</dt><dd>{new Date(candidate.save.savedAt).toLocaleString('ko-KR')}</dd></div>
        </dl>
        <p>{persistent ? strings.importReplaceHelp : strings.importMemoryReplaceHelp}</p>
        <div className="save-file-actions">
          <button type="button" disabled={busy} onClick={() => { void apply(); }}>{strings.applySaveFile}</button>
          <button type="button" disabled={busy} onClick={() => { setCandidate(null); setMessage(''); }}>{strings.cancelImport}</button>
        </div>
      </div>}
      <p role="status" data-testid="file-status">{busy ? strings.processingSaveFile : message}</p>
    </section>
  );
}
