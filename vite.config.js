import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything trip-specific is inlined into one index.html so it can be encrypted
// with StaticCrypt. Public libraries (MapLibre, Papa Parse) load from a CDN.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100000000 },
});
