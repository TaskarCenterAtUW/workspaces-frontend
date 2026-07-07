import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { Page, Request } from '@playwright/test';

// Shared OpenAPI contract validator. Records the new-API traffic a page makes
// and validates each request/response body against the vendored spec
// (test/contract/openapi.json). Used by the per-page "API calls match the
// Swagger spec" outlines.
//
// Scope: only requests to the new-API host are checked. In E2E the new API base
// is http://api.test/ (playwright.config.ts), and the spec paths are prefixed
// /api/v1/, so a recorded path like `workspaces/mine` maps to the spec key
// `/api/v1/workspaces/mine`. TDEI/OSM calls (other hosts/prefixes) aren't in
// this spec and are ignored.

const specPath = fileURLToPath(new URL('../contract/openapi.json', import.meta.url));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv);

// Spec path keys, minus the proxy catch-all which would match everything.
const SPEC_PATHS = Object.keys(spec.paths).filter(p => !p.includes('{full_path}'));

// Turn "/api/v1/workspaces/{workspace_id}" into a matcher regex.
function pathToRegex(p: string): RegExp {
  const re = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^/]+?\\\}/g, '[^/]+');
  return new RegExp(`^${re}$`);
}
const PATH_MATCHERS = SPEC_PATHS.map(p => ({ key: p, re: pathToRegex(p) }));

const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();
function validatorFor(subSchema: object, cacheKey: string) {
  let v = validatorCache.get(cacheKey);
  if (!v) {
    // Wrap the sub-schema with the spec's components so internal
    // `$ref: '#/components/schemas/...'` resolve against this root.
    v = ajv.compile({ ...subSchema, components: spec.components });
    validatorCache.set(cacheKey, v);
  }
  return v;
}

export interface ContractViolation {
  method: string;
  path: string;
  status: number;
  where: 'request' | 'response' | 'route';
  message: string;
}

interface RecordedCall {
  method: string;
  recordedPath: string; // e.g. "workspaces/mine"
  status: number;
  reqBody?: string;
  resText: string;
  contentType: string;
}

function isNewApiRequest(req: Request): boolean {
  try {
    const url = new URL(req.url());
    return url.hostname === 'api.test' && !url.pathname.startsWith('/tdei')
      && !url.pathname.startsWith('/osm') && !url.pathname.startsWith('/rapid')
      && !url.pathname.startsWith('/pathways');
  }
  catch {
    return false;
  }
}

// Begin recording. Returns a function that validates everything seen so far and
// returns the list of contract violations (empty == conformant).
export function recordContract(page: Page) {
  const calls: RecordedCall[] = [];

  page.on('response', async (response) => {
    const req = response.request();
    if (!isNewApiRequest(req)) return;
    const url = new URL(req.url());
    let resText = '';
    try {
      resText = await response.text();
    }
    catch { /* opaque/aborted */ }
    calls.push({
      method: req.method().toUpperCase(),
      recordedPath: url.pathname.replace(/^\//, ''),
      status: response.status(),
      reqBody: req.postData() ?? undefined,
      resText,
      contentType: (response.headers()['content-type'] ?? '')
    });
  });

  return {
    calls,
    violations(): ContractViolation[] {
      const out: ContractViolation[] = [];
      for (const c of calls) {
        const specKey = '/api/v1/' + c.recordedPath;
        const match = PATH_MATCHERS.find(m => m.re.test(specKey));
        if (!match) {
          out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'route',
            message: `no matching OpenAPI path for ${c.method} /api/v1/${c.recordedPath}` });
          continue;
        }
        const op = spec.paths[match.key]?.[c.method.toLowerCase()];
        if (!op) {
          out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'route',
            message: `method ${c.method} not defined on ${match.key}` });
          continue;
        }

        // Request body
        const reqSchema = op.requestBody?.content?.['application/json']?.schema;
        if (reqSchema && c.reqBody) {
          try {
            const v = validatorFor(reqSchema, `${match.key}|${c.method}|req`);
            if (!v(JSON.parse(c.reqBody))) {
              out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'request',
                message: ajv.errorsText(v.errors) });
            }
          }
          catch (e) {
            out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'request',
              message: `request body not valid JSON: ${(e as Error).message}` });
          }
        }

        // Response body
        const resDef = op.responses?.[String(c.status)] ?? op.responses?.default;
        const resSchema = resDef?.content?.['application/json']?.schema;
        // Validate any response that claims application/json, even with an empty
        // body: an empty/missing body where the spec expects JSON is a violation,
        // not something to skip (gating on c.resText hid that case).
        if (resSchema && c.contentType.includes('application/json')) {
          if (!c.resText) {
            out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'response',
              message: 'expected an application/json response body but it was empty' });
          }
          else {
            try {
              const v = validatorFor(resSchema, `${match.key}|${c.method}|res|${c.status}`);
              if (!v(JSON.parse(c.resText))) {
                out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'response',
                  message: ajv.errorsText(v.errors) });
              }
            }
            catch (e) {
              out.push({ method: c.method, path: c.recordedPath, status: c.status, where: 'response',
                message: `response body not valid JSON: ${(e as Error).message}` });
            }
          }
        }
      }
      return out;
    }
  };
}
