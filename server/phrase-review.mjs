import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const defaultPath = fileURLToPath(new URL('../data/phrase-feedback/phrase-review.jsonl', import.meta.url));
const allowedVerdicts = new Set(['accepted', 'rejected', 'ambiguous']);

export function createPhraseReviewRecord(payload = {}, now = new Date(), id = randomUUID()) {
  if (!payload.workId || !payload.streamId) throw new Error('workId and streamId are required');
  if (!allowedVerdicts.has(payload.verdict)) throw new Error('verdict must be accepted, rejected, or ambiguous');
  if (!Number.isInteger(payload.boundaryIndex) || payload.boundaryIndex < 1) throw new Error('boundaryIndex must be a positive integer');
  return {
    schemaName: 'musicanote-phrase-boundary-review',
    schemaVersion: '0.1.0',
    reviewId: `pbr_${id}`,
    createdAt: now.toISOString(),
    workId: String(payload.workId),
    sourceId: payload.sourceId ? String(payload.sourceId) : null,
    streamId: String(payload.streamId),
    analyzerVersion: String(payload.analyzerVersion || 'unknown'),
    target: {
      boundaryIndex: payload.boundaryIndex,
      noteId: payload.noteId ? String(payload.noteId) : null,
      onset: Number.isFinite(Number(payload.onset)) ? Number(payload.onset) : null,
      measure: payload.measure ?? null,
      measureOrdinal: Number.isFinite(Number(payload.measureOrdinal)) ? Number(payload.measureOrdinal) : null,
      beat: Number.isFinite(Number(payload.beat)) ? Number(payload.beat) : null,
    },
    candidate: payload.candidate && typeof payload.candidate === 'object' ? payload.candidate : null,
    analysisContext: payload.analysisContext && typeof payload.analysisContext === 'object' ? payload.analysisContext : null,
    human: {
      status: payload.verdict,
      comment: String(payload.comment || '').trim() || null,
    },
    trainingEligible: false,
  };
}

export function phraseReviewApiPlugin(options = {}) {
  const outputPath = options.outputPath || process.env.MUSICANOTE_PHRASE_REVIEW_PATH || defaultPath;
  return { name: 'musicanote-phrase-review-api', configureServer(server) {
    server.middlewares.use('/api/analysis/phrase-review', (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const record = createPhraseReviewRecord(JSON.parse(body || '{}'));
          mkdirSync(dirname(outputPath), { recursive: true });
          appendFileSync(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
          res.statusCode = 201;
          res.end(JSON.stringify({ saved: true, record }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    });
  } };
}
