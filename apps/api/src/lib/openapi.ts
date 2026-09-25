import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey } from '@foodbowl/shared';

export type JsonSchema = Record<string, unknown>;

/**
 * Request-body docs are generated from the same Zod schemas the handlers
 * validate with (packages/shared), so the docs can't drift from the real
 * rules. Route `schema` objects are documentation only — see the no-op
 * compilers in plugins/swagger.ts; validation stays with Zod in the handlers.
 */
export function fromZod(schema: ZodTypeAny, extra: JsonSchema = {}): JsonSchema {
  const json = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as JsonSchema;
  delete json.$schema;
  dropAdditionalPropertiesFalse(json);
  return { ...json, ...extra };
}

// Zod objects *strip* unknown keys rather than rejecting them, but the
// converter emits `additionalProperties: false`, which would tell API
// clients that extra fields are an error. They're accepted and ignored.
function dropAdditionalPropertiesFalse(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(dropAdditionalPropertiesFalse);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj.additionalProperties === false) delete obj.additionalProperties;
    Object.values(obj).forEach(dropAdditionalPropertiesFalse);
  }
}

export const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

export const bearerAuth = [{ bearerAuth: [] }];
export const refreshCookieAuth = [{ refreshCookie: [] }];

export const idParam: JsonSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'Record id (cuid).', example: 'cm0abc123def456' } },
};

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503;

/**
 * Builds the error entries of a route's `response` map from
 * `{ status: description }`. 400 uses the Zod validation error shape (that's
 * what plugins/error-handler.ts sends); everything else is `{ error }`. A
 * generic 500 is always appended.
 */
export function errorResponses(errors: Partial<Record<ErrorStatus, string>>): Record<number, JsonSchema> {
  const out: Record<number, JsonSchema> = {};
  for (const [status, description] of Object.entries(errors)) {
    out[Number(status)] = {
      description,
      ...ref(status === '400' ? 'ValidationErrorResponse' : 'ErrorResponse'),
    };
  }
  out[500] = { description: 'Unexpected server error.', ...ref('ErrorResponse') };
  return out;
}

/** Standard 401/403 pair for routes behind requireAuth + requirePermission. */
export const protectedErrors = {
  401: 'Missing, invalid or expired access token.',
  403: 'Authenticated, but missing the required permission.',
} as const;

/** Markdown line describing a permission gate, with who has it by default. */
export function requiresPermission(permission: PermissionKey): string {
  const roles = Object.entries(DEFAULT_ROLE_PERMISSIONS)
    .filter(([, permissions]) => permissions.includes(permission))
    .map(([role]) => `\`${role}\``);
  const defaults = roles.length ? `granted by default to ${roles.join(', ')}` : 'not granted to any role by default';
  return `**Requires permission:** \`${permission}\` (${defaults}; per-user overrides apply).`;
}
