import { canRecolorLogo } from './logo-analysis';

describe('Uploaded logo classification', () => {
  const pixels = (...values: number[]) => new Uint8ClampedArray(values);
  it('allows transparent black, white and neutral gray logos', () => {
    for (const value of [0, 130, 255]) {
      expect(canRecolorLogo(pixels(0, 0, 0, 0, value, value, value, 255))).toBe(true);
    }
  });
  it('preserves opaque backgrounds, including black-on-white artwork', () => {
    expect(canRecolorLogo(pixels(0, 0, 0, 255, 255, 255, 255, 255))).toBe(false);
    expect(canRecolorLogo(pixels(0, 0, 0, 255))).toBe(false);
  });
  it('preserves colored and multitone artwork even with transparency', () => {
    expect(canRecolorLogo(pixels(0, 0, 0, 0, 200, 20, 20, 255))).toBe(false);
    expect(canRecolorLogo(pixels(0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255))).toBe(false);
  });
  it('ignores antialiased edges but rejects empty and nearly opaque images', () => {
    expect(canRecolorLogo(pixels(0, 0, 0, 0, 5, 5, 5, 255, 180, 180, 180, 100))).toBe(true);
    expect(canRecolorLogo(pixels())).toBe(false);
    expect(canRecolorLogo(pixels(0, 0, 0, 0))).toBe(false);
    const opaque = new Uint8ClampedArray(400).fill(255);
    opaque[3] = 0;
    expect(canRecolorLogo(opaque)).toBe(false);
  });
});
