/** Creator drafts deliberately live outside the player game's IndexedDB ("last-vigil").
 * No editor draft operation opens the game save database.
 */
const DB_NAME='last-vigil-maker';
const STORE='drafts';
const VERSION=1;

export type MakerDraftKind='map'|'monster';
type Envelope={kind:MakerDraftKind;version:1;updatedAt:number;payload:unknown};

function openMakerDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,VERSION);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'kind'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error??new Error('제작 초안 저장소를 열 수 없습니다.'));
    req.onblocked=()=>reject(new Error('제작 초안 저장소가 다른 창에서 사용 중입니다. 다른 제작 탭을 닫아 주세요.'));
  });
}
async function transact<T>(mode:IDBTransactionMode,operate:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
  const db=await openMakerDb();
  return new Promise((resolve,reject)=>{
    let settled=false,answer:T;
    const tx=db.transaction(STORE,mode);
    tx.oncomplete=()=>{db.close();resolve(answer);};
    tx.onabort=()=>{db.close();reject(tx.error??new Error('제작 초안을 저장할 수 없습니다.'));};
    tx.onerror=()=>{}; // abort conveys the transaction error
    try{operate(tx.objectStore(STORE),value=>{answer=value;settled=true;});}
    catch(error){db.close();reject(error);}
    void settled;
  });
}
export async function loadMakerDraft(kind:MakerDraftKind):Promise<unknown|undefined>{
  const result=await transact<Envelope|undefined>('readonly',(store,done)=>{
    const req=store.get(kind);
    req.onsuccess=()=>done(req.result as Envelope|undefined);
  });
  if(!result)return undefined;
  if(result.kind!==kind||result.version!==1)throw new Error('지원하지 않는 제작 초안 버전입니다. JSON 파일로 수동 복구해 주세요.');
  return result.payload;
}
export function saveMakerDraft(kind:MakerDraftKind,payload:unknown):Promise<void>{
  return transact<void>('readwrite',(store,done)=>{store.put({kind,version:1,updatedAt:Date.now(),payload} satisfies Envelope);done(undefined);});
}
export function clearMakerDraft(kind:MakerDraftKind):Promise<void>{
  return transact<void>('readwrite',(store,done)=>{store.delete(kind);done(undefined);});
}
