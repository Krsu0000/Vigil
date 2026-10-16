import {SaveFileV7Schema} from '../schemas-v7.ts';
// 기존 전투·난수·행동 기록을 보존하고 묶음 진행 상태 저장을 지원한다.
export function v7ToV8(raw:unknown){const save=SaveFileV7Schema.parse(raw);return {...save,schemaVersion:8};}
