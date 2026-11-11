import { generateProjectSeo } from './project-seo';
describe('Project SEO generation', () => {
  it('uses the summary first and normalizes whitespace', () => {
    expect(
      generateProjectSeo(
        { title: ' Casa ', short_description: ' Patio\n luminoso ', description: 'Otro texto' },
        'Estudio',
      ),
    ).toEqual({ seo_title: 'Casa | Estudio', seo_description: 'Patio luminoso' });
  });
  it('falls back to plain description and handles missing content and studio', () => {
    expect(
      generateProjectSeo(
        { title: 'Casa', short_description: ' ', description: '<p>Una casa</p><p>con patio.</p>' },
        '',
      ).seo_description,
    ).toBe('Una casa con patio.');
    expect(
      generateProjectSeo({ title: '', short_description: '', description: '' }, 'Estudio'),
    ).toEqual({ seo_title: '', seo_description: '' });
  });
  it('respects backend limits without cutting a word when possible', () => {
    const seo = generateProjectSeo(
      {
        title: 'Casa '.repeat(60),
        short_description: '',
        description: 'Arquitectura '.repeat(100),
      },
      'Estudio',
    );
    expect(seo.seo_title.length).toBeLessThanOrEqual(200);
    expect(seo.seo_description.length).toBeLessThanOrEqual(320);
    expect(seo.seo_description).toMatch(/Arquitectura…$/);
  });
  it('avoids repeating the studio name', () => {
    expect(
      generateProjectSeo(
        { title: 'Casa del ESTUDIO', short_description: '', description: '' },
        'Estudio',
      ).seo_title,
    ).toBe('Casa del ESTUDIO');
  });
});
