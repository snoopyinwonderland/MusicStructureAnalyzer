import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// @ts-expect-error Runtime-only Node middleware has no browser declaration.
import { searchApiPlugin, workApiPlugin } from './server/search-api.mjs';
export default defineConfig({ plugins: [react(), searchApiPlugin(), workApiPlugin()], test: { environment: 'node' } });
