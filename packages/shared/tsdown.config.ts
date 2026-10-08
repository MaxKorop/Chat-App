import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: true, // .mjs/.cjs + .d.mts/.d.cts, matches "exports"
});
