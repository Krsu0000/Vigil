import { useEffect, useRef } from 'react';
import type { AmbushResult } from '../engine/systems/ambush/actions.ts';
import { strings } from './strings/index.ts';

export function AmbushDialog({ onClose, onResolve }: {
  onClose: () => void; onResolve: (result: AmbushResult) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="settings-dialog ambush-dialog" aria-labelledby="ambush-heading"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2 id="ambush-heading">{strings.ambush}</h2>
      <p>{strings.ambushHelp}</p>
      <p>{strings.ambushPrototype}</p>
      <div className="ambush-actions">
        <button type="button" autoFocus onClick={() => onResolve('defeated')}>{strings.defeated}</button>
        <button type="button" onClick={() => onResolve('escaped')}>{strings.escaped}</button>
        <button type="button" onClick={onClose}>{strings.closeAmbush}</button>
      </div>
    </dialog>
  );
}
