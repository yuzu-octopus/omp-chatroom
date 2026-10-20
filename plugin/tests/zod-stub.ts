/**
 * The hand-rolled `pi.zod` seam every tool suite needs.
 *
 * `registerRoomTool` builds its schema with `z.enum(...).describe(...)`, `z.string().optional()
 * .describe(...)` and friends, so the stub must implement the FULL chainable surface — a stub with
 * only `optional()` fails at `.describe is not a function` as soon as a param gains a description.
 * (It did exactly that when the tool descriptions landed.)
 *
 * Deliberately not `pi.zod` itself: the tests capture the registered tool definition and assert on
 * its shape, and pulling the real zod in would make those assertions about zod rather than the
 * plugin.
 */

/** A schema-ish object that supports the chain the tool builders use. */
interface StubSchema {
  describe(_: string): StubSchema;
  optional(): StubSchema;
}

export const zodStub: unknown = {
  // The shape's keys AND the chainable surface: the tests read the captured parameters as the
  // plain shape (`parameters.post`), while the tool builders also call `.optional()` / `.describe()`
  // on the object they build. The chain is NON-ENUMERABLE, so a test that walks the shape's keys
  // does not walk the chain's.
  object: (shape: Record<string, unknown>) => {
    const base = stubSchema();
    return Object.defineProperties(
      { ...shape },
      {
        describe: { value: base.describe, enumerable: false },
        optional: { value: base.optional, enumerable: false },
        describes: { value: base.describes, enumerable: false },
      },
    );
  },
  enum: (values: string[]) => stubSchema({ values }) as unknown as StubSchema,
  string: () => stubSchema(),
  number: () => stubSchema(),
  array: (t: unknown) => ({ item: t, ...stubSchema() }),
  optional: (t: unknown) => ({ item: t, ...stubSchema() }),
};

/** Records every description a schema is given, so tests can assert on them. */
function stubSchema(extra?: Record<string, unknown>): StubSchema & { describes: string[] } {
  const describes: string[] = [];
  const self = {
    ...extra,
    describes,
    describe(this: StubSchema & { describes: string[] }, text: string) {
      describes.push(text);
      return this;
    },
    optional(this: StubSchema & { describes: string[] }) {
      return this;
    },
  };
  return self;
}
