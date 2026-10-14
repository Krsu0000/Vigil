import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { GameStore } from '../runtime/store.ts';
import { initialMapId } from '../runtime/store.ts';
import { bindMovementKeys } from '../runtime/input.ts';
import type { Direction } from '../engine/systems/map/actions.ts';
import { currentLocation, requireTile } from '../engine/systems/map/selectors.ts';
import { getTileVisibility } from '../engine/systems/map/visibility.ts';
import { strings } from './strings/index.ts';

const controls: readonly { direction: Direction; glyph: string }[] = [
  { direction: 'north', glyph: '↑' }, { direction: 'west', glyph: '←' },
  { direction: 'south', glyph: '↓' }, { direction: 'east', glyph: '→' },
];

export function MapScreen({ store }: { store: GameStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [message, setMessage] = useState<string>(strings.moveHelp);
  const move = useCallback((direction: Direction) => {
    const result = store.dispatch({ type: 'move/step', direction });
    if (!result.ok) setMessage(result.reason === 'insufficient_resources' ? strings.insufficientStamina : strings.blocked);
    else {
      const event = result.events.find((entry) => entry.type === 'move/stepped');
      setMessage(event?.newlyExplored ? strings.newPath : strings.knownPath);
    }
  }, [store]);
  useEffect(() => bindMovementKeys(window, move), [move]);
  const location = currentLocation(state, store.content);
  if (!location) return (
    <section className="unplaced">
      <p>{strings.unplaced}</p>
      <button type="button" onClick={() => store.dispatch({ type: 'map/start', mapId: initialMapId(store.content) })}>
        {strings.start}
      </button>
    </section>
  );
  const { map, position, memory } = location;
  const floor = map.floors.find((entry) => entry.floor === position.floor)!;
  const byPosition = new Map(floor.cells.map((cell) => [`${cell.x}:${cell.y}`, cell]));
  const currentCell = byPosition.get(`${position.x}:${position.y}`)!;
  const zone = store.content.byId[currentCell.zoneId];
  if (!zone || !('kind' in zone) || zone.kind !== 'zone') throw new Error('현재 구역 정의가 없다');

  return (
    <div className="exploration-layout">
      <section className="map-panel" aria-labelledby="map-heading">
        <div className="panel-heading">
          <div><p className="eyebrow">{strings.map}</p><h2 id="map-heading">{map.name}</h2></div>
          <span className="floor-label">{position.floor}{strings.floorUnit}</span>
        </div>
        <p className="map-description">{map.description}</p>
        <div className="map-viewport">
          <div className="map-grid" role="grid" tabIndex={0} aria-label={map.name}
            aria-rowcount={floor.height} aria-colcount={floor.width}
            style={{ '--columns': floor.width } as CSSProperties}>
            {Array.from({ length: floor.height }, (_, y) => (
              <div className="map-row" role="row" key={y}>
                {Array.from({ length: floor.width }, (_, x) => {
                  const cell = byPosition.get(`${x}:${y}`)!;
                  const target = { mapId: map.id, floor: floor.floor, x, y };
                  const visibility = getTileVisibility(state, target, store.content);
                  const isPlayer = x === position.x && y === position.y;
                  // 가려진 칸에는 지형·구역·기호를 렌더링하지 않는다.
                  const tile = visibility === 'unexplored' ? null : requireTile(store.content, cell.tileId);
                  const label = tile ? `${isPlayer ? strings.player : tile.name} (${x}, ${y})` : strings.unexplored;
                  return (
                    <div role="gridcell" key={x} aria-label={label}
                      className={`map-cell is-${visibility}${tile && !tile.walkable ? ' is-wall' : ''}${isPlayer ? ' is-player' : ''}`}
                      data-x={x} data-y={y} data-visibility={visibility}>
                      <span aria-hidden="true">{isPlayer ? strings.playerGlyph : tile?.walkable ? tile.glyph : ''}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="map-legend" aria-label={strings.mapLegend}>
          <span><i className="legend-current" />{strings.visible}</span>
          <span><i className="legend-explored" />{strings.explored}</span>
          <span><i className="legend-unknown" />{strings.unexplored}</span>
        </div>
      </section>
      <aside className="travel-panel" aria-label={strings.exploration}>
        <p className="eyebrow">{strings.currentZone}</p>
        <h2>{zone.name}</h2>
        <span className={`zone-label is-${zone.safety}`}>{zone.safety === 'safe' ? strings.safe : strings.danger}</span>
        <p className="zone-description">{zone.description}</p>
        <dl className="travel-details">
          <div><dt>{strings.position}</dt><dd data-testid="position">({position.x}, {position.y})</dd></div>
          <div><dt>{strings.visited}</dt><dd data-testid="visited">{Object.keys(memory.visited).length}</dd></div>
          <div><dt>{strings.stamina}</dt><dd data-testid="stamina">{state.character!.stamina.current} / {state.character!.stamina.max}</dd></div>
          <div><dt>{strings.gameTime}</dt><dd data-testid="game-time">{state.meta.gameTime}{strings.tickUnit}</dd></div>
        </dl>
        <div className="movement-controls" role="group" aria-label={strings.move}>
          {controls.map(({ direction, glyph }) => (
            <button type="button" className={`move-${direction}`} key={direction}
              aria-label={strings[direction]} onClick={() => move(direction)}>{glyph}</button>
          ))}
        </div>
        <p className="keyboard-help">{strings.keyboardHelp}</p>
        <p className="movement-status" role="status">{message}</p>
        <p className="session-note">{strings.sessionOnly}</p>
        <p className="time-note">{strings.timeEngineOnly}</p>
      </aside>
    </div>
  );
}
