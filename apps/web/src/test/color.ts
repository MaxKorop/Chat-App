/** Just enough colour maths to check WCAG contrast of the theme tokens in styles.css. */
export type Rgb = [number, number, number]; // linear sRGB, 0..1

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** "oklch(0.55 0.24 277)" → linear sRGB (out-of-gamut colours are clamped, as browsers do). */
export function oklchToLinearRgb(css: string): Rgb {
  const match = css.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!match)
    throw new Error(`Cannot read "${css}": only opaque oklch(L C H) colours are supported`);
  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number];
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG contrast ratio of two colours, 1 (identical) to 21 (black on white). */
export function contrast(foreground: string, background: string): number {
  const a = luminance(oklchToLinearRgb(foreground));
  const b = luminance(oklchToLinearRgb(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const encode = (value: number) => {
  const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(clamp(srgb) * 255)
    .toString(16)
    .padStart(2, '0');
};

/** "oklch(…)" → "#rrggbb" */
export const oklchToHex = (css: string): string => `#${oklchToLinearRgb(css).map(encode).join('')}`;
