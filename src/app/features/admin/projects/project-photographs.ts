import { concatMap, forkJoin, from, map, of, switchMap, toArray } from 'rxjs';
import { allPages, ProjectApi } from './project-api.service';
import { ProjectSectionsApi } from './sections/project-sections-api.service';

/** Include historical section images using the existing project attachment contract. */
export function projectPhotographs(api: ProjectApi, sections: ProjectSectionsApi, project: string) {
  return allPages((offset) => api.media(project, offset)).pipe(
    switchMap((links) =>
      allPages((offset) => sections.list(project, offset)).pipe(
        switchMap((items) => {
          const galleries = items.filter((section) => section.section_type === 'GALLERY');
          return galleries.length
            ? forkJoin(
                galleries.map((section) =>
                  allPages((offset) => sections.media(project, section.id, offset)),
                ),
              )
            : of([]);
        }),
        switchMap((galleries) => {
          const existing = new Set(
            links
              .filter((link) => ['GALLERY', 'PLAN', 'RENDER'].includes(link.role))
              .map((link) => link.media_id),
          );
          const missing: string[] = [];
          for (const media of galleries.flat()) {
            if (!existing.has(media.media_id)) {
              existing.add(media.media_id);
              missing.push(media.media_id);
            }
          }
          const start = Math.max(-1, ...links.map((link) => link.sort_order ?? 0)) + 1;
          return from(missing).pipe(
            concatMap((media_id, index) =>
              api.attach(project, { media_id, role: 'GALLERY', sort_order: start + index }),
            ),
            toArray(),
            map((added) => [...links, ...added]),
          );
        }),
      ),
    ),
  );
}
