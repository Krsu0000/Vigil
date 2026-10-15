export type SaveSlots = Readonly<{ primary: unknown | null; backup: unknown | null; generation: number }>;
export type SaveRepository = Readonly<{
  read: () => Promise<SaveSlots>;
  write: (primary: string, backup: string | null, expectedGeneration: number) => Promise<number>;
  close: () => void;
}>;

const DATABASE = 'last-vigil';
const STORE = 'save-slots';

// 데이터베이스 버전은 IndexedDB 구조 버전이다. SaveFile v4와 구분한다.
export function openSaveRepository(factory: IDBFactory = indexedDB): Promise<SaveRepository> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    let rejected = false;
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onerror = () => reject(request.error ?? new Error('브라우저 저장소를 열지 못했다'));
    request.onblocked = () => { rejected = true; reject(new Error('다른 창이 브라우저 저장소 연결을 막고 있다')); };
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve({
        read: () => new Promise((done, fail) => {
          const tx = db.transaction(STORE, 'readonly');
          const slots = tx.objectStore(STORE);
          const primary = slots.get('primary');
          const backup = slots.get('backup');
          const generation = slots.get('generation');
          tx.oncomplete = () => {
            const value: unknown = generation.result ?? 0;
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) { fail(new Error('저장소 세대 번호가 유효하지 않다')); return; }
            done({ primary: primary.result ?? null, backup: backup.result ?? null, generation: value });
          };
          tx.onabort = () => fail(tx.error ?? new Error('브라우저 저장소 읽기 실패'));
        }),
        write: (primary, backup, expectedGeneration) => new Promise((done, fail) => {
          if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0 || expectedGeneration === Number.MAX_SAFE_INTEGER) {
            fail(new Error('저장소 세대 번호 상한')); return;
          }
          const tx = db.transaction(STORE, 'readwrite');
          const slots = tx.objectStore(STORE);
          const generation = slots.get('generation');
          let conflict = false;
          let writeFailure: unknown;
          generation.onsuccess = () => {
            try {
              if ((generation.result ?? 0) !== expectedGeneration) { conflict = true; tx.abort(); return; }
              // 검증된 직전 세이브와 새 세이브를 같은 트랜잭션으로 교체한다.
              slots.put(primary, 'primary');
              if (backup !== null) slots.put(backup, 'backup');
              slots.put(expectedGeneration + 1, 'generation');
            } catch (error) { writeFailure = error; tx.abort(); }
          };
          tx.oncomplete = () => done(expectedGeneration + 1);
          tx.onabort = () => fail(conflict ? new Error('다른 창에서 저장 내용이 바뀌었다') : writeFailure ?? tx.error ?? new Error('브라우저 저장 실패'));
        }),
        close: () => db.close(),
      });
    };
  });
}
