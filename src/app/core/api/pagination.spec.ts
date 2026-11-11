import { expectTypeOf } from 'vitest';
import type {
  MediaPage,
  PagePublicCategory,
  PagePublicProjectCard,
  PublicCategory,
  PublicProjectCard,
} from './generated/types.gen';
import type { Paginated, PaginationMetadata, PaginationQuery } from './pagination';

describe('Generated pagination contracts', () => {
  it('derives shared metadata and collection items from the backend contract', () => {
    expectTypeOf<PaginationMetadata>().toEqualTypeOf<Omit<MediaPage, 'items'>>();
    expectTypeOf<PagePublicCategory>().toExtend<Paginated<PublicCategory>>();
    expectTypeOf<PagePublicProjectCard>().toExtend<Paginated<PublicProjectCard>>();
    const query: PaginationQuery = { limit: 20, offset: 40 };
    const page: Paginated<never> = { items: [], total: 0, limit: 20, offset: 40 };
    expect(page.limit).toBe(query.limit);
    expect(page.offset).toBe(query.offset);
    expect(Object.keys(page)).toEqual(['items', 'total', 'limit', 'offset']);
  });
});
