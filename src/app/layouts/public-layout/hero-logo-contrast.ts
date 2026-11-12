/** Choose the logo with the stronger WCAG contrast against the sampled background. */
export function needsWhiteLogo(pixels: Uint8ClampedArray, overlayOpacity = 0): boolean {
  let luminance = 0;
  const count = pixels.length / 4;
  if (!count) return true;
  for (let i = 0; i < pixels.length; i += 4) {
    const channels = [pixels[i], pixels[i + 1], pixels[i + 2]].map((channel) => {
      const value = (channel / 255) * (1 - overlayOpacity);
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    luminance += 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  const average = luminance / count;
  return 1.05 / (average + 0.05) >= (average + 0.05) / 0.05;
}

/** Browser-only sampler. Never changes the displayed image or requires it to support CORS. */
export function observeHeroLogoContrast(
  document: Document,
  brand: HTMLElement,
  update: (white: boolean) => void,
): () => void {
  const view = document.defaultView;
  if (!view) return () => undefined;
  let frame = 0;
  let revision = 0;
  let disposed = false;
  const images = new Map<string, Promise<HTMLImageElement>>();
  const sample = async () => {
    const current = ++revision;
    const hero = document.querySelector<HTMLElement>('.spotlight.hero');
    const displayed = hero?.querySelector<HTMLImageElement>('.backdrop img');
    if (!hero || !displayed?.complete || !displayed.naturalWidth) {
      update(true);
      return;
    }
    const source = displayed.currentSrc || displayed.src;
    if (!images.has(source)) {
      images.clear();
      images.set(
        source,
        new Promise((resolve, reject) => {
          const image = new view.Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Image sampling unavailable'));
          image.src = source;
        }),
      );
    }
    try {
      const image = await images.get(source)!;
      if (disposed || current !== revision) return;
      const target = brand.getBoundingClientRect();
      const bounds = displayed.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      // Hero covers use object-fit: fill, so screen and image coordinates map directly.
      const x = Math.max(0, (target.left - bounds.left) / bounds.width);
      const y = Math.max(0, (target.top - bounds.top) / bounds.height);
      const width = Math.min(target.width / bounds.width, 1 - x);
      const height = Math.min(target.height / bounds.height, 1 - y);
      if (width <= 0 || height <= 0) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(
        image,
        x * image.naturalWidth,
        y * image.naturalHeight,
        width * image.naturalWidth,
        height * image.naturalHeight,
        0,
        0,
        16,
        16,
      );
      const overlay = view.getComputedStyle(hero, '::after').backgroundColor;
      const alpha = overlay.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1];
      update(needsWhiteLogo(context.getImageData(0, 0, 16, 16).data, alpha ? Number(alpha) : 0));
    } catch {
      if (!disposed && current === revision) update(true);
    }
  };
  const schedule = () => {
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => void sample());
  };
  const observer = new view.MutationObserver(schedule);
  observer.observe(document.querySelector('main') ?? document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  document.addEventListener('load', schedule, true);
  view.addEventListener('resize', schedule, { passive: true });
  schedule();
  return () => {
    disposed = true;
    revision++;
    observer.disconnect();
    view.cancelAnimationFrame(frame);
    document.removeEventListener('load', schedule, true);
    view.removeEventListener('resize', schedule);
    images.clear();
  };
}
