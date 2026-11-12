import { needsWhiteLogo } from './hero-logo-contrast';

describe('Hero logo contrast', () => {
  it('uses white on dark pixels and black on light pixels', () => {
    expect(needsWhiteLogo(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(true);
    expect(needsWhiteLogo(new Uint8ClampedArray([255, 255, 255, 255]))).toBe(false);
  });
  it('accounts for the dark overlay over the cover', () => {
    const pixels = new Uint8ClampedArray([200, 200, 200, 255]);
    expect(needsWhiteLogo(pixels)).toBe(false);
    expect(needsWhiteLogo(pixels, 0.48)).toBe(true);
  });
  it('compares contrast across the sampled region and provides a fallback', () => {
    expect(needsWhiteLogo(new Uint8ClampedArray([20, 20, 20, 255, 30, 30, 30, 255]))).toBe(true);
    expect(needsWhiteLogo(new Uint8ClampedArray())).toBe(true);
  });
});
