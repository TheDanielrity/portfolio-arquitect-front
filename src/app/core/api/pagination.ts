import type { ListMediaApiV1AdminMediaGetData, MediaPage } from './generated/types.gen';

export type PaginationQuery = Pick<
  NonNullable<ListMediaApiV1AdminMediaGetData['query']>,
  'limit' | 'offset'
>;

export type PaginationMetadata = Omit<MediaPage, 'items'>;
export type Paginated<T> = PaginationMetadata & { items: T[] };
