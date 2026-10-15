import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { AutoSave } from '../runtime/auto-save.ts';
import type { GameStore } from '../runtime/store.ts';
import { initialMapId } from '../runtime/store.ts';
import { bindMovementKeys } from '../runtime/input.ts';
import { browserClock, browserScheduler } from '../runtime/clock.ts';
import { createGameLoop } from '../runtime/loop.ts';
import { AmbushDialog } from './AmbushDialog.tsx';
import { SettingsDialog } from './SettingsDialog.tsx';
import type { Direction } from '../engine/systems/map/actions.ts';
import { currentLocation, findCell, getReturnDestination } from '../engine/systems/map/selectors.ts';
import { MapView } from './MapView.tsx';
import { strings } from './strings/index.ts';

const controls: readonly { direction: Direction; glyph: string }[] = [
  { direction: 'north', glyph: '↑' }, { direction: 'west', glyph: '←' },
  { direction: 'south', glyph: '↓' }, { direction: 'east', glyph: '→' },
];

export function MapScreen({ store, loop: suppliedLoop, persistent = false, autoSave }: { store: GameStore; loop?: ReturnType<typeof createGameLoop>; persistent?: boolean; autoSave?: AutoSave }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const loop = useMemo(() => suppliedLoop ?? createGameLoop(store, browserClock, browserScheduler), [store, suppliedLoop]);
  const session = useSyncExternalStore(loop.subscribe, loop.getSnapshot, loop.getSnapshot);
  useEffect(() => { loop.start(); return () => loop.stop(); }, [loop]);
  const pendingAmbush = state.expedition?.pendingAmbush;
  const [ambushOpen, setAmbushOpen] = useState(false);
  useEffect(() => { setAmbushOpen(!!pendingAmbush); }, [pendingAmbush]);
  useEffect(() => {
    const previous = document.title;
    document.title = pendingAmbush ? `${strings.ambush} · ${strings.gameTitle}` : strings.gameTitle;
    return () => { document.title = previous; };
  }, [pendingAmbush]);
  const [message, setMessage] = useState<string>(strings.moveHelp);
  const move = useCallback((direction: Direction) => {
    const result = loop.move(direction);
    if (!result.ok) setMessage(result.reason === 'insufficient_resources' ? strings.insufficientStamina :
      result.reason === 'paused' ? strings.pausedMove : result.reason === 'cooldown' ? strings.moveCooldown : strings.blocked);
    else {
      const event = result.events.find((entry) => entry.type === 'move/stepped');
      setMessage(event?.newlyExplored ? strings.newPath : strings.knownPath);
    }
  }, [loop]);
  useEffect(() => bindMovementKeys(window, move), [move]);
  const settingsDialog = session.settingsOpen && <SettingsDialog persistent={persistent} autoSave={autoSave} content={store.content} onClose={() => loop.setSettingsOpen(false)} />;
  const location = currentLocation(state, store.content);
  const exploredCount = useMemo(() => location ? Object.keys(location.memory.visited).length : 0, [location?.memory]);
  if (!location) return (
    <><section className="unplaced">
      <p>{strings.unplaced}</p>
      <button type="button" onClick={() => store.dispatch({ type: 'map/start', mapId: initialMapId(store.content) })}>
        {strings.start}
      </button>
    </section>{settingsDialog}</>
  );
  const { map, position, memory } = location;
  const currentCell = findCell(map, position)!;
  const zone = store.content.byId[currentCell.zoneId];
  if (!zone || !('kind' in zone) || zone.kind !== 'zone') throw new Error('현재 구역 정의가 없다');
  const stamina = state.character!.stamina;
  const resting = state.character!.activity === 'resting';
  const recoveryHint = !session.running ? strings.recoveryPaused : stamina.current === stamina.max ? strings.recoveryFull :
    resting ? strings.recoveryResting : strings.recoveryWaiting;
  const recoveryPerTick = zone.safety === 'safe' ? store.content.timeRules.stamina.safeRegenPerTick : resting ? store.content.timeRules.stamina.restRegenPerTick : store.content.timeRules.stamina.waitRegenPerTick;

  return (
    <div className="exploration-layout">
      <div className="session-controls">
        <span data-testid="session-status" role="status">{pendingAmbush ? strings.ambushPending : session.running ? strings.running : strings.paused}</span>
        <button type="button" onClick={() => loop.setPaused(!(session.paused || session.gapPaused))}>
          {session.paused || session.gapPaused || !session.running && !pendingAmbush ? strings.resume : strings.pause}
        </button>
        <button type="button" onClick={() => loop.setSettingsOpen(true)}>{strings.settings}</button>
        {session.gapPaused && <p role="alert">{strings.heartbeatGap}</p>}
      </div>
      <MapView content={store.content} map={map} position={position} memory={memory} />
      <aside className="travel-panel" aria-label={strings.exploration}>
        <p className="eyebrow">{strings.currentZone}</p>
        <h2>{zone.name}</h2>
        <span className={`zone-label is-${zone.safety}`}>{zone.safety === 'safe' ? strings.safe : strings.danger}</span>
        <p className="zone-description">{zone.description}</p>
        <dl className="travel-details">
          <div><dt>{strings.position}</dt><dd data-testid="position">({position.x}, {position.y})</dd></div>
          <div><dt>{strings.visited}</dt><dd data-testid="visited">{exploredCount}</dd></div>
          <div><dt>{strings.stamina}</dt><dd data-testid="stamina">{state.character!.stamina.current} / {state.character!.stamina.max}</dd></div>
          <div><dt>{strings.gameTime}</dt><dd data-testid="game-time">{state.meta.gameTime}{strings.tickUnit}</dd></div>
        </dl>
        <div className="movement-controls" role="group" aria-label={strings.move}>
          {controls.map(({ direction, glyph }) => (
            <button type="button" className={`move-${direction}`} key={direction}
              aria-label={strings[direction]} disabled={!session.running}
              onPointerDown={(event) => { if (event.isPrimary && event.button === 0) move(direction); }}
              // 포인터는 누를 때 처리한다. 키보드/보조기술의 click(detail=0)만 여기서 처리한다.
              onClick={(event) => { if (event.detail === 0) move(direction); }}>{glyph}</button>
          ))}
        </div>
        <div className="rest-controls">
          <button type="button" disabled={!session.running || !resting && (zone.safety !== 'danger' || stamina.current === stamina.max)}
            onClick={() => {
              const result = loop.setResting(!resting);
              if (!result.ok) setMessage(strings.restUnavailable);
              else setMessage(resting ? strings.restStopped : strings.restStarted);
            }}>{resting ? strings.stopRest : strings.startRest}</button>
          <span data-testid="activity">{resting ? strings.resting : strings.waiting}</span>
        </div>
        <div className="return-controls">
          <button type="button" disabled={!session.running || !getReturnDestination(state, store.content)} onClick={() => {
            const result = loop.returnToCamp();
            setMessage(result.ok ? strings.returnSucceeded : loop.getSnapshot().ambushPending ? strings.returnAmbushBlocked : strings.returnUnavailable);
          }}>{strings.returnToCamp}</button>
          <p>{pendingAmbush ? strings.returnAmbushBlocked : zone.safety === 'safe' ? strings.returnAlreadySafe : !session.running ? strings.returnPaused : strings.returnHelp}</p>
        </div>
        {zone.safety === 'danger' && <p className="rest-rules">
          {strings.resting}: {store.content.timeRules.stamina.recoveryIntervalMs / 1000}{strings.secondsUnit} · {strings.recoveryAmount} {store.content.timeRules.stamina.restRegenPerTick}<br />
          {strings.ambushChance}: {strings.waiting} {store.content.timeRules.ambush.waitChancePerTick * 100}% · {strings.resting} {store.content.timeRules.ambush.restChancePerTick * 100}%{strings.perTick}
        </p>}
        {pendingAmbush && <div className="ambush-notice" role="alert">
          <p>{strings.ambushPending}</p>
          <button type="button" onClick={() => setAmbushOpen(true)}>{strings.reopenAmbush}</button>
        </div>}
        <p className="keyboard-help">{strings.keyboardHelp}</p>
        <p className="movement-status" role="status">{message}</p>
        <p className="recovery-status" data-testid="recovery-status">{recoveryHint}</p>
        <p className="recovery-rules">{strings.tickLength} {store.content.timeRules.tickMs / 1000}{strings.secondsUnit} · {strings.recoveryInterval} {store.content.timeRules.stamina.recoveryIntervalMs / 1000}{strings.secondsUnit} · {strings.recoveryAmount} {recoveryPerTick}</p>
        <p className="session-note">{persistent ? strings.offlineRecovery : strings.sessionOnly}</p>
        <p className="time-note">{strings.liveRecovery}</p>
      </aside>
      {pendingAmbush && ambushOpen && !session.settingsOpen && <AmbushDialog
        onClose={() => setAmbushOpen(false)} onResolve={(result) => {
          if (loop.resolveAmbush(result).ok) setMessage(result === 'defeated' ? strings.defeatedResult : strings.escapedResult);
        }} />}
      {settingsDialog}
    </div>
  );
}
