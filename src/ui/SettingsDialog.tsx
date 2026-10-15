import { useEffect, useRef, useState } from 'react';
import type { AutoSave } from '../runtime/auto-save.ts';
import type { ContentDb } from '../content/types.ts';
import { SaveFiles } from './SaveFiles.tsx';
import { strings } from './strings/index.ts';

export function SettingsDialog({ onClose, persistent = false, autoSave, content }: { onClose: () => void; persistent?: boolean; autoSave?: AutoSave; content?: ContentDb }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="settings-dialog" aria-labelledby="settings-heading"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <h2 id="settings-heading">{strings.settings}</h2>
      <p>{strings.settingsPauseHelp}</p>
      <p>{strings.keyboardHelp}</p>
      <p>{persistent ? strings.offlineRecovery : strings.sessionOnly}</p>
      {autoSave && content && <SaveFiles persistent={persistent} autoSave={autoSave} content={content} busy={busy} onBusyChange={setBusy} />}
      <button type="button" disabled={busy} autoFocus onClick={onClose}>{strings.closeSettings}</button>
    </dialog>
  );
}
