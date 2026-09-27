import { loader } from '@monaco-editor/react';
// Monaco is served from packaged local assets, never a CDN. This keeps the desktop editor offline.
loader.config({ paths: { vs: './vendor/vs' } });
