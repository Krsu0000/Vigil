// 코어는 공통 형태만 안다. 구체적인 사건은 각 시스템의 판별 가능한 유니온으로 정의한다.
export type GameEvent = Readonly<{ type: `${string}/${string}` }>;
