import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// @ts-expect-error Runtime-only Node middleware has no browser declaration.
import { catalogSearchPlugin, corpusStatsApiPlugin, searchApiPlugin, workApiPlugin, youtubeBackfillPlugin } from './server/search-api.mjs';
// @ts-expect-error Runtime-only Node middleware has no browser declaration.
import { phraseReviewApiPlugin } from './server/phrase-review.mjs';
export default defineConfig({ plugins: [react(), searchApiPlugin(), corpusStatsApiPlugin(), workApiPlugin(), phraseReviewApiPlugin(), youtubeBackfillPlugin(), catalogSearchPlugin()], test: { environment: 'node' } });
