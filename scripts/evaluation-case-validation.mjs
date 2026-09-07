// Explicit validation of evaluation/schema/query-case.schema.json (v1).
// query and expected are intentionally opaque objects in that schema. A valid
// historical record is not necessarily replayable or independently verified.
const required = ['schema', 'caseId', 'createdAt', 'status', 'query', 'expected', 'observations', 'diagnoses', 'proposals', 'runs'];
const statuses = new Set(['draft', 'diagnosed', 'verified', 'resolved']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateEvaluationCase(value, source = '<case>') {
  const fail = message => { throw new Error(`${source}: ${message}`); };
  if (!isObject(value)) fail('case must be an object');
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail(`missing required field "${field}"`);
  }
  if (value.schema !== 'musicanote-evaluation-case/v1') fail('schema must be musicanote-evaluation-case/v1');
  if (typeof value.caseId !== 'string') fail('caseId must be a string');
  if (typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.createdAt)) {
    fail('createdAt must be a YYYY-MM-DD date string');
  }
  const date = new Date(`${value.createdAt}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.createdAt) {
    fail('createdAt must be a valid calendar date');
  }
  if (!statuses.has(value.status)) fail('status must be draft, diagnosed, verified, or resolved');
  for (const field of ['query', 'expected']) {
    if (!isObject(value[field])) fail(`${field} must be an object`);
  }
  for (const field of ['observations', 'diagnoses', 'proposals', 'runs']) {
    if (!Array.isArray(value[field])) fail(`${field} must be an array`);
    value[field].forEach((item, index) => {
      if (!isObject(item)) fail(`${field}[${index}] must be an object`);
    });
  }
  if (Object.hasOwn(value, 'tags') && (!Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== 'string'))) {
    fail('tags must be an array of strings');
  }
  return value;
}

export function validateEvaluationCases(cases, sources = []) {
  if (!Array.isArray(cases)) throw new Error('cases must be an array');
  const seen = new Map();
  cases.forEach((value, index) => {
    const source = sources[index] ?? `case[${index}]`;
    validateEvaluationCase(value, source);
    if (seen.has(value.caseId)) {
      throw new Error(`${source}: duplicate caseId "${value.caseId}" (already in ${seen.get(value.caseId)})`);
    }
    seen.set(value.caseId, source);
  });
  return cases;
}
