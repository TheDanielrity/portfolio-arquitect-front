const plainText = (value: string): string =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const shorten = (value: string, limit: number): string => {
  if (value.length <= limit) return value;
  const excerpt = value.slice(0, limit - 1);
  const boundary = excerpt.lastIndexOf(' ');
  return (boundary > limit / 2 ? excerpt.slice(0, boundary) : excerpt).trimEnd() + '…';
};
export function generateProjectSeo(
  project: { title: string; short_description: string; description: string },
  studio: string,
): { seo_title: string; seo_description: string } {
  const title = plainText(project.title);
  const name = plainText(studio);
  return {
    seo_title: shorten(
      title && name && !title.toLocaleLowerCase().includes(name.toLocaleLowerCase())
        ? `${title} | ${name}`
        : title,
      200,
    ),
    seo_description: shorten(
      plainText(project.short_description) || plainText(project.description),
      320,
    ),
  };
}
