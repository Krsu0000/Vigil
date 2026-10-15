import { useEffect, useRef } from 'react';
import { strings } from './strings/index.ts';

export function SettingsDialog({ onClose, persistent = false }: { onClose: () => void; persistent?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="settings-dialog" aria-labelledby="settings-heading"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2 id="settings-heading">{strings.settings}</h2>
      <p>{strings.settingsPauseHelp}</p>
      <p>{strings.keyboardHelp}</p>
      <p>{persistent ? strings.noOfflineYet : strings.sessionOnly}</p>
      <button type="button" autoFocus onClick={onClose}>{strings.closeSettings}</button>
    </dialog>
  );
}
