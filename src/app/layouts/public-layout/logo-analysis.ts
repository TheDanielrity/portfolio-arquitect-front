/** Only neutral, single-tone artwork with meaningful transparency can be recolored. */
export function canRecolorLogo(pixels: Uint8ClampedArray): boolean {
  if (!pixels.length || pixels.length % 4) return false;
  let transparent = 0;
  let visible = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] <= 20) transparent++;
    // Ignore antialiased edges when classifying the artwork's colors.
    if (pixels[i + 3] < 240) continue;
    visible++;
    const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (high - low > 20) return false;
    min = Math.min(min, low);
    max = Math.max(max, high);
  }
  return visible > 0 && transparent / (pixels.length / 4) >= 0.02 && max - min <= 40;
}

/** Read a bounded logo sample; preserve the original on CORS/decode/canvas failure. */
export async function analyzeLogoImage(document: Document, source: string): Promise<boolean> {
  const view = document.defaultView;
  if (!view) return false;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new view.Image();
      candidate.crossOrigin = 'anonymous';
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('Logo analysis unavailable'));
      candidate.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, 64, 64);
    return canRecolorLogo(context.getImageData(0, 0, 64, 64).data);
  } catch {
    return false;
  }
}
