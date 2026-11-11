import type {
  PagePublicProjectCard,
  PublicCategory,
  PublicProjectCard,
} from '../../../core/api/generated/types.gen';
import { of } from 'rxjs';
export const category: PublicCategory = {
  name: 'Architecture',
  slug: 'architecture',
  description: null,
};
export const card: PublicProjectCard = {
  title: 'A real project',
  slug: 'a-real-project',
  short_description: 'An architectural study.',
  location: 'Project location',
  year: 2025,
  categories: [category],
  cover: {
    type: 'IMAGE',
    url: 'https://delivery.example.test/public/image',
    thumbnail_url: 'https://delivery.example.test/public/thumbnail',
    mime_type: 'image/jpeg',
    width: 1600,
    height: 1000,
    alt_text: 'Project exterior',
    title: null,
    description: null,
  },
};
export const emptyPage: PagePublicProjectCard = { items: [], total: 0, limit: 12, offset: 0 };
export const page = (
  items: PublicProjectCard[] = [card],
  extra: Partial<PagePublicProjectCard> = {},
): PagePublicProjectCard => ({ ...emptyPage, items, total: items.length, ...extra });
export function emptyPublicApi() {
  return {
    list: () => of(emptyPage),
    featured: () => of({ ...emptyPage, limit: 1 }),
    categoryOptions: () => of([]),
  };
}
