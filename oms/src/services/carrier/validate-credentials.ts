import { z, ZodTypeAny } from "zod";
import { CredentialField } from "@/types/Carrier";

/**
 * Build a zod schema from a carrier's credential_fields config so we can
 * validate user-supplied credentials at the service boundary (api_key flow
 * only — oauth credentials come from the OAuth callback, not user input).
 *
 * Returns: { ok: true, parsed } or { ok: false, errors: string[] }.
 */
export function validateCredentials(
  fields: CredentialField[],
  raw: Record<string, unknown>
): { ok: true; parsed: Record<string, unknown> } | { ok: false; errors: string[] } {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    let s: ZodTypeAny;
    if (f.type === "checkbox") {
      s = z.boolean();
      if (!f.required) s = (s as z.ZodBoolean).optional().default(false);
    } else {
      let str = z.string();
      if (f.validation?.min_length != null) {
        str = str.min(f.validation.min_length, {
          message: `${f.key}: at least ${f.validation.min_length} chars`,
        });
      }
      if (f.validation?.max_length != null) {
        str = str.max(f.validation.max_length, {
          message: `${f.key}: at most ${f.validation.max_length} chars`,
        });
      }
      if (f.validation?.pattern) {
        try {
          const re = new RegExp(f.validation.pattern);
          str = str.regex(re, {
            message: `${f.key}: format invalid`,
          });
        } catch {
          // Bad regex in config — fail closed to surface admin error.
          return {
            ok: false,
            errors: [`carrier ${f.key} pattern is not a valid regex`],
          };
        }
      }
      s = f.required ? str.min(1, { message: `${f.key}: required` }) : str.optional();
    }
    shape[f.key] = s;
  }
  const schema = z.object(shape).strict();
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, parsed: r.data as Record<string, unknown> };
  return {
    ok: false,
    errors: r.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}
