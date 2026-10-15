import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MapDefinition } from '../content/schemas.ts';
import type { ContentDb, DeepReadonly } from '../content/types.ts';
import type { MapExploration, MapPosition } from '../engine/core/state.ts';
import { findFloor } from '../engine/systems/map/indexes.ts';
import { findCell, requireTile } from '../engine/systems/map/selectors.ts';
import { createVisibilityQuery } from '../engine/systems/map/visibility.ts';
import { mapWindow } from './map-window.ts';
import { findChest } from '../engine/systems/inventory/selectors.ts';
import { findEncounter, requireMonster } from '../engine/systems/combat/selectors.ts';
import { strings } from './strings/index.ts';

export type MapViewport = Readonly<{ x: number; y: number; width: number; height: number }>;

// 시간·자원만 갱신되면 지도를 재계산하지 않는다. 표시 범위만 DOM에 둔다.
export const MapView = memo(function MapView({ content, map, position, memory, openedChests, defeatedEnemies, onViewportChange, overview = false }: {
  overview?: boolean; content: ContentDb; map: DeepReadonly<MapDefinition>; position: MapPosition; memory: MapExploration; openedChests?: Readonly<Record<string, true>>; defeatedEnemies?: Readonly<Record<string, true>>; onViewportChange?: (viewport: MapViewport) => void;
}) {
  const floor = findFloor(map, position.floor)!;
  const viewport = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [window, setWindow] = useState(() => mapWindow(floor.width, floor.height, 0, 0, 320, 284, 24));
  const visibility = useMemo(() => createVisibilityQuery(map, position, memory, content), [map, position, memory, content]);
  const measure = useCallback(() => {
    const view = viewport.current!, area = grid.current!;
    const size = area.getBoundingClientRect().width / floor.width;
    if (!size) return;
    onViewportChange?.({ x: (view.scrollLeft - area.offsetLeft) / size, y: (view.scrollTop - area.offsetTop) / size, width: view.clientWidth / size, height: view.clientHeight / size });
    const next = mapWindow(floor.width, floor.height, view.scrollLeft - area.offsetLeft,
      view.scrollTop - area.offsetTop, view.clientWidth, view.clientHeight, size);
    setWindow(previous => previous.x0 === next.x0 && previous.x1 === next.x1 &&
      previous.y0 === next.y0 && previous.y1 === next.y1 ? previous : next);
  }, [floor, onViewportChange]);
  const follow = useCallback(() => {
    const view = viewport.current!, area = grid.current!;
    const size = area.getBoundingClientRect().width / floor.width;
    const x = area.offsetLeft + position.x * size, y = area.offsetTop + position.y * size;
    // 탐험은 이동으로만 화면을 옮긴다. 전체 지도만 직접 둘러볼 수 있다.
    view.scrollLeft = x - (view.clientWidth - size) / 2;
    view.scrollTop = y - (view.clientHeight - size) / 2;
    measure();
  }, [position, floor, measure]);
  useLayoutEffect(follow, [follow]);
  useEffect(() => {
    const view = viewport.current!;
    let frame: number | undefined;
    const queue = () => { if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; measure(); }); };
    const observer = new ResizeObserver(follow);
    observer.observe(view);
    view.addEventListener('scroll', queue, { passive: true });
    return () => { observer.disconnect(); view.removeEventListener('scroll', queue); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [measure, follow]);
  return <section className="map-panel" aria-label={map.name}>
    <div className="panel-heading">
      <div><p className="eyebrow">{strings.map}</p><h2 >{map.name}</h2></div>
      <span className="floor-label">{position.floor}{strings.floorUnit}</span>
    </div>
    <p className="map-description">{map.description}</p>
    <div className={`map-viewport${overview ? ' can-pan' : ''}`} ref={viewport}>
      <div className="map-surface">
        <div className="map-grid" ref={grid} role="grid" tabIndex={0} aria-label={map.name}
          aria-rowcount={floor.height} aria-colcount={floor.width}
          style={{ '--columns': floor.width, '--rows': floor.height } as CSSProperties}>
          {Array.from({ length: Math.max(0, window.y1 - window.y0) }, (_, index) => {
            const y = window.y0 + index;
            return <div className="map-row" role="row" aria-rowindex={y + 1} key={y}
              style={{ top: `calc(${y} * var(--cell-size))`, left: `calc(${window.x0} * var(--cell-size))` }}>
              {Array.from({ length: Math.max(0, window.x1 - window.x0) }, (_, index) => {
                const x = window.x0 + index;
                const target = { mapId: map.id, floor: floor.floor, x, y };
                const seen = visibility(target);
                // 미탐사 지형 정보는 DOM에도 넣지 않는다.
                const tile = seen === 'unexplored' ? null : requireTile(content, findCell(map, target)!.tileId);
                const chestId = seen === 'unexplored' ? undefined : findCell(map, target)?.chestId;
                const chest = chestId && !openedChests?.[chestId] ? findChest(content, chestId) : undefined;
                const encounterId = seen === 'unexplored' ? undefined : findCell(map, target)?.encounterId;
                const encounter = encounterId && !defeatedEnemies?.[encounterId] ? findEncounter(content, encounterId) : undefined;
                const enemy = encounter ? requireMonster(content, encounter.enemies[0]!.monsterId) : undefined;
                const player = x === position.x && y === position.y;
                const label = tile ? `${player ? strings.player : enemy?.name ?? chest?.name ?? tile.name} (${x}, ${y})` : strings.unexplored;
                return <div role="gridcell" aria-colindex={x + 1} key={x} aria-label={label}
                  className={`map-cell is-${seen}${tile && !tile.walkable ? ' is-wall' : ''}${player ? ' is-player' : ''}`}
                  data-x={x} data-y={y} data-visibility={seen}>
                  <span aria-hidden="true">{player ? strings.playerGlyph : enemy ? enemy.glyph : chest ? chest.glyph : tile?.walkable ? tile.glyph : ''}</span>
                </div>;
              })}
            </div>;
          })}
        </div>
      </div>
    </div>
    <div className="map-legend" aria-label={strings.mapLegend}>
      <span><i className="legend-current" />{strings.visible}</span>
      <span><i className="legend-explored" />{strings.explored}</span>
      <span><i className="legend-unknown" />{strings.unexplored}</span>
      <span>{strings.chestLegend} · {strings.chestHint}</span>
    </div>
  </section>;

});
