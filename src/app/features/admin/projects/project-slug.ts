/** Proposes a link; uniqueness remains authoritative on the server. */
export function projectSlug(title: string, maximum = 220): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maximum)
    .replace(/-+$/g, '');
}
