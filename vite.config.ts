import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { serviceWorkerSource } from './src/sw/template';

/** Short stable hash (FNV-1a) so the config needs no Node type definitions. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Emits sw.js for offline play after the first visit. The cache name is derived from this
 * build's hashed file names, so every deploy gets a fresh cache and the old one is deleted.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'pencil-whiskers-offline-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map')).sort();
      const shell = [...new Set(['./', './index.html', ...files.map((f) => `./${f}`)])];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(`pencil-whiskers-${fnv1a(files.join('|'))}`, shell) });
    },
  };
}

export default defineConfig({
  // Relative base: the build works from any sub-path, e.g. a GitHub Pages project site at
  // https://<user>.github.io/<repo>/, without knowing the repo name at build time.
  base: './',
  plugins: [offlineServiceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
