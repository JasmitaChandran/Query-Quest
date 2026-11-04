export function assertReadOnlyQuery(sql: string) {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim();

  if (!withoutComments) throw new Error("Enter a SELECT query to run.");
  if (!/^(SELECT|WITH|EXPLAIN)\b/i.test(withoutComments)) {
    throw new Error("The public playground currently accepts read-only SELECT queries only.");
  }

  const forbidden =
    /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE|PRAGMA|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
  if (forbidden.test(withoutComments)) {
    throw new Error("Write operations are internal until checkpoint support is available.");
  }
}
