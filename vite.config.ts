import { defineConfig } from 'vite';
// Vite's ESBuild JSX transform avoids an inline dev preamble, keeping the renderer CSP intact.
export default defineConfig({ base: './', esbuild: { jsx: 'automatic' }, server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] } });
