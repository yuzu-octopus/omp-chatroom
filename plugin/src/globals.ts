// K9 / K8 — process-wide registries anchored on globalThis so sibling sessions in one omp process
// share them (one fd per log, one store per root, one tick per job). Written as a statement, not the
// `(globalThis as X).k ??= new Map()` expression, so the assignment is not buried in an expression.
export function globalMap<K, V>(key: string): Map<K, V> {
  const g = globalThis as Record<string, unknown>;
  g[key] ??= new Map<K, V>();
  return g[key] as Map<K, V>;
}
