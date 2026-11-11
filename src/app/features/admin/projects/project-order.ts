import { concatMap, from, map, reduce } from 'rxjs';
import { ProjectApi } from './project-api.service';
// Keyboard controls persist only the final order; backend bodies allow at most 100 items.
export function saveOrder(
  api: ProjectApi,
  id: string,
  kind: 'attributes' | 'media',
  items: { id: string }[],
) {
  const order = items.map((item, index) => ({ id: item.id, sort_order: index }));
  const batches = [];
  for (let offset = 0; offset < order.length; offset += 100)
    batches.push(order.slice(offset, offset + 100));
  return from(batches).pipe(
    concatMap((items) => api.order(id, kind, { items })),
    reduce(() => undefined, undefined),
    map(() => undefined),
  );
}
