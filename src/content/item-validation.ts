import type { ContentDefinition } from './schemas.ts';
import type { ContentError } from './types.ts';
type Located = { file: string; index: number; definition: ContentDefinition };
export function validateItems(definitions: readonly Located[]): ContentError[] {
  const errors: ContentError[] = [];
  const byId = new Map(definitions.map(entry => [entry.definition.id, entry.definition]));
  const placed = new Set<string>();
  for (const { file, index, definition } of definitions) {
    const report = (path: string, message: string) => errors.push({ file, path: `${index}.${path}`, code: 'invalid_item_reference', message });
    if (definition.kind === 'chest') {
      const amounts = new Map<string, number>();
      let weight = 0;
      definition.loot.forEach((entry, i) => {
        const item = byId.get(entry.itemId);
        if (item?.kind !== 'item') report(`loot.${i}.itemId`, '전리품의 아이템 정의가 없다');
        else weight += item.weightGrams * entry.quantity;
        const quantity = (amounts.get(entry.itemId) ?? 0) + entry.quantity;
        if (!Number.isSafeInteger(quantity)) report(`loot.${i}.quantity`, '전리품 수량이 안전한 정수를 초과한다');
        amounts.set(entry.itemId, quantity);
      });
      if (!Number.isSafeInteger(weight)) report('loot', '전리품 중량이 안전한 정수를 초과한다');
    }
    if (definition.kind === 'map') {
      for (const [fi, floor] of definition.floors.entries()) for (const [ci, cell] of floor.cells.entries()) {
        if (!cell.chestId) continue;
        const path = `floors.${fi}.cells.${ci}.chestId`;
        if (byId.get(cell.chestId)?.kind !== 'chest') report(path, '상자 정의가 없다');
        if (placed.has(cell.chestId)) report(path, '상자 ID는 전체 맵에서 한 번만 배치한다');
        placed.add(cell.chestId);
        const tile = byId.get(cell.tileId);
        if (tile?.kind !== 'tile' || !tile.walkable) report(path, '상자는 이동 가능한 칸에 배치한다');
      }
    }
  }
  return errors;
}
