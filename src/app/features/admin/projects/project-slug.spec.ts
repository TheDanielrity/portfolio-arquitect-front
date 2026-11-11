import { projectSlug } from './project-slug';
describe('project link proposals', () => {
  it.each([
    ['Casa de Playa en Páracas', 'casa-de-playa-en-paracas'],
    ['  Patio / jardín — Nº 3! ', 'patio-jardin-n-3'],
    ['---', ''],
    ['Casa__del   ÁRBOL', 'casa-del-arbol'],
  ])('normalizes %s', (title, expected) => expect(projectSlug(title)).toBe(expected));
  it('cuts a proposal at the contract maximum without a trailing hyphen', () => {
    const slug = projectSlug('a'.repeat(219) + ' casa');
    expect(slug.length).toBe(219);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
