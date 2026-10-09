import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { contrast } from '@/test/color';

const css = readFileSync(path.resolve(import.meta.dirname, 'styles.css'), 'utf8');

/** the `--token: value` pairs of one block, such as `:root` or `.dark` */
function tokens(selector: string): Record<string, string> {
  const block = css.match(
    new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm'),
  )?.[1];
  if (block === undefined) throw new Error(`styles.css has no ${selector} block`);
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
  );
}

const light = tokens(':root');
const dark = { ...light, ...tokens('.dark') }; // the dark theme overrides the light one

// Text must reach 4.5:1 (WCAG AA). Pairs are [text token, background token].
const TEXT_ON_SURFACE: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'chat-background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'chat-background'],
  ['sidebar-foreground', 'sidebar'],
  ['muted-foreground', 'sidebar'],
  ['bubble-own-foreground', 'bubble-own'],
  ['bubble-own-muted', 'bubble-own'],
  ['bubble-other-foreground', 'bubble-other'],
  ['muted-foreground', 'bubble-other'],
  ['primary', 'background'], // links and names in the brand colour
  ['primary', 'chat-background'],
  ['primary', 'bubble-other'],
  ['destructive', 'background'],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('the %s theme', (_name, theme) => {
  it.each(TEXT_ON_SURFACE)('%s on %s is readable (4.5:1)', (text, surface) => {
    expect(theme[text], `--${text} is missing`).toBeDefined();
    expect(theme[surface], `--${surface} is missing`).toBeDefined();
    expect(contrast(theme[text]!, theme[surface]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the brand', () => {
  const hueAndChroma = (value: string) => {
    const [lightness, chroma, hue] = value.match(/[\d.]+/g)!.map(Number) as [
      number,
      number,
      number,
    ];
    return { lightness, chroma, hue };
  };

  it('is a calm teal: not blue, purple, red or magenta, and not a neon', () => {
    for (const theme of [light, dark]) {
      for (const token of ['brand', 'primary', 'bubble-own']) {
        const { lightness, chroma, hue } = hueAndChroma(theme[token]!);
        expect(hue, `--${token} hue`).toBeGreaterThanOrEqual(170); // between green...
        expect(hue, `--${token} hue`).toBeLessThanOrEqual(210); // ...and cyan; blue starts around 230
        expect(chroma, `--${token} chroma`).toBeGreaterThanOrEqual(0.08); // has a character
        expect(chroma, `--${token} chroma`).toBeLessThanOrEqual(0.15); // but is not super-bright
        expect(lightness, `--${token} lightness`).toBeGreaterThanOrEqual(0.45);
        expect(lightness, `--${token} lightness`).toBeLessThanOrEqual(0.8); // and not pastel
      }
    }
  });

  it('tints the neutrals with the same hue, so greys feel part of the brand', () => {
    for (const theme of [light, dark]) {
      for (const token of [
        'background',
        'foreground',
        'muted',
        'border',
        'sidebar',
        'chat-background',
      ]) {
        if (theme[token]!.includes('/')) continue; // translucent white lines (dark borders) are neutral on purpose
        const { hue } = hueAndChroma(theme[token]!);
        expect(hue, `--${token} hue`).toBeGreaterThanOrEqual(170);
        expect(hue, `--${token} hue`).toBeLessThanOrEqual(230);
      }
    }
  });

  it('keeps the dark theme dark grey, not black: lighter than the old near-black background', () => {
    const lightness = Number(dark['background']!.match(/[\d.]+/)![0]);
    expect(lightness).toBeGreaterThanOrEqual(0.22); // the old value was 0.145
    expect(lightness).toBeLessThan(0.4);
  });
});
