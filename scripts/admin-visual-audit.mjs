// Runs inside the browser through CDP. Checks rendered controls, not SCSS wording.
export function auditAdminVisuals() {
  const root = document.querySelector('app-admin-layout, app-admin-login');
  if (!root) return ['No administrative root'];
  const failures = [];
  const visible = (element) =>
    element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const rgb = (value) => value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const blend = (top, bottom) => {
    const alpha = top[3] ?? 1;
    return top.slice(0, 3).map((channel, index) => channel * alpha + bottom[index] * (1 - alpha));
  };
  const background = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement)
      layers.push(rgb(getComputedStyle(node).backgroundColor));
    return layers.reverse().reduce((result, layer) => blend(layer, result), [255, 255, 255]);
  };
  const luminance = (color) =>
    color
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a, b) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const button of root.querySelectorAll('button, a.button, [role="button"]')) {
    if (!visible(button)) continue;
    const style = getComputedStyle(button);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (
        style['border' + side + 'Style'] !== 'solid' ||
        parseFloat(style['border' + side + 'Width']) < 1 ||
        style['border' + side + 'Color'] !== 'rgb(0, 0, 0)'
      ) {
        failures.push(
          'Button requires solid black border: ' +
            (button.textContent?.trim().slice(0, 40) || button.getAttribute('aria-label')),
        );
        break;
      }
    }
  }
  for (const element of root.querySelectorAll(
    'p, label, small, h1, h2, h3, button, a, input, select, textarea, td, th',
  )) {
    if (!visible(element)) continue;
    if (!element.textContent?.trim() && !element.matches('input, select, textarea')) continue;
    const style = getComputedStyle(element);
    const bg = background(element);
    const ratio = contrast(blend(rgb(style.color), bg), bg);
    if (ratio < 4.5)
      failures.push(
        'Text contrast ' +
          ratio.toFixed(2) +
          ': ' +
          element.tagName +
          ' ' +
          (element.textContent?.trim().slice(0, 30) || element.id),
      );
    if (element.matches('input[placeholder], textarea[placeholder]')) {
      const placeholder = getComputedStyle(element, '::placeholder');
      if (contrast(blend(rgb(placeholder.color), bg), bg) < 4.5)
        failures.push('Placeholder contrast: ' + element.id);
    }
  }
  return failures;
}
