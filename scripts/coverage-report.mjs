// Prints a per-file coverage table (coverage.py / pytest-cov style) from the
// combined unit+e2e report. Writes an aligned text table to stdout (visible in
// the CI step log) and a markdown table to the GitHub run summary when
// GITHUB_STEP_SUMMARY is set. Cover is statement coverage, rounded to whole
// percent; Miss = statements - covered.
import { readFileSync, appendFileSync } from 'node:fs';
import { relative } from 'node:path';

const SUMMARY = 'coverage/combined/coverage-summary.json';

const data = JSON.parse(readFileSync(SUMMARY, 'utf8'));
const cwd = process.cwd();

const toRow = (name, s) => ({
  name,
  stmts: s.total,
  miss: s.total - s.covered,
  cover: Math.round(s.pct)
});

const files = Object.entries(data)
  .filter(([k]) => k !== 'total')
  .map(([abs, m]) => toRow(relative(cwd, abs), m.statements))
  .sort((a, b) => a.name.localeCompare(b.name));

const totalRow = toRow('TOTAL', data.total.statements);

// --- aligned text table for the step log ---
const all = [{ name: 'Name', stmts: 'Stmts', miss: 'Miss', cover: 'Cover' }, ...files, totalRow];
const w = key => Math.max(...all.map(r => String(r[key]).length + (key === 'cover' && r.cover !== 'Cover' ? 1 : 0)));
const nameW = w('name');
const cols = { stmts: w('stmts'), miss: w('miss'), cover: w('cover') };
const pct = v => (typeof v === 'number' ? `${v}%` : v);
const line = r =>
  `${String(r.name).padEnd(nameW)}  ${String(r.stmts).padStart(cols.stmts)}  ${String(r.miss).padStart(cols.miss)}  ${pct(r.cover).padStart(cols.cover)}`;

console.log(`Test coverage — ${totalRow.cover}%`);
console.log(line({ name: 'Name', stmts: 'Stmts', miss: 'Miss', cover: 'Cover' }));
for (const r of files) console.log(line(r));
console.log(line(totalRow));

// --- markdown table for the GitHub run summary ---
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `## Test coverage — ${totalRow.cover}%`,
    '',
    '| Name | Stmts | Miss | Cover |',
    '| --- | ---: | ---: | ---: |',
    ...files.map(r => `| ${r.name} | ${r.stmts} | ${r.miss} | ${r.cover}% |`),
    `| **TOTAL** | ${totalRow.stmts} | ${totalRow.miss} | ${totalRow.cover}% |`,
    ''
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
