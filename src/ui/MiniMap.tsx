import { memo, useEffect, useRef } from 'react';
import type { MapViewport } from './MapView.tsx';
import type { MapExploration, MapPosition } from '../engine/core/state.ts';
export const MiniMap=memo(function MiniMap({position,memory,width,height,onOpen,viewport}:{position:MapPosition;memory:MapExploration;width:number;height:number;onOpen:()=>void;viewport?:MapViewport}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const c=ref.current!.getContext('2d');if(!c)return;c.fillStyle='#101010';c.fillRect(0,0,128,84);
    const scale=Math.min(128/width,84/height);c.fillStyle='#777';
    for(const key of Object.keys(memory.visited)){const [floor,x,y]=key.split(':').map(Number);if(floor===position.floor)c.fillRect(x!*scale,y!*scale,Math.max(1,scale),Math.max(1,scale));}
    c.fillStyle='#eee';c.fillRect(position.x*scale,position.y*scale,Math.max(2,scale),Math.max(2,scale));
    c.strokeStyle='#ccc';c.setLineDash([2,2]);c.strokeRect((viewport?.x??position.x-6)*scale,(viewport?.y??position.y-6)*scale,(viewport?.width??13)*scale,(viewport?.height??13)*scale);
  },[position,memory,width,height,viewport]);
  return <button className="mini-map" onClick={onOpen} aria-label="전체 지도 열기"><canvas ref={ref} width={128} height={84} aria-label="탐사한 경로의 미니맵"/><span>M 지도 ›</span></button>;
});
