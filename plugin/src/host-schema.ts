import type { TSchema } from "@oh-my-pi/pi-ai";

/**
 * Hand the host a parameter schema it will accept, without pretending the types unified.
 *
 * The host declares `ToolDefinition<TParams extends TSchema>` where `TSchema = Type | TJsonSchema`
 * and `Type` is TypeBox. Our schemas come from the host's own runtime zod stub, so they validate
 * exactly as intended — but `tsc` resolves them to the union's `ZodLikeSchema` member while Bun's
 * native checker tries TypeBox first and fails on a conditional inside `out.ifEquals`. Same code,
 * two sound readings of a union the host itself never disambiguates.
 *
 * This is the ONE cast at that boundary, and it is narrow on purpose:
 * - the schema is still the host's runtime object, unchanged, still validating every call;
 * - the parameter types the plugin actually reads are stated by hand (`RoomParams`,
 *   `WaitForClaimParams`, …) on `execute` and on the render hooks, so nothing downstream inherits
 *   `TSchema`'s `unknown`.
 *
 * With it, `bun check` — the native checker, ~100 ms against tsc's ~3 s — is a usable gate; without
 * it, 64 errors that say nothing about the code. Both checkers now agree on this tree.
 */
export function hostSchema(schema: object): TSchema {
  return schema as unknown as TSchema;
}
