const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").trim();

export function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;
  let bracket = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) { current += char; if (char === "\n") lineComment = false; continue; }
    if (blockComment) { current += char; if (char === "*" && next === "/") { current += next; index += 1; blockComment = false; } continue; }
    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) { current += next; index += 1; } else quote = null;
      }
      continue;
    }
    if (bracket) { current += char; if (char === "]") bracket = false; continue; }
    if (char === "-" && next === "-") { current += `${char}${next}`; index += 1; lineComment = true; continue; }
    if (char === "/" && next === "*") { current += `${char}${next}`; index += 1; blockComment = true; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; current += char; continue; }
    if (char === "[") { bracket = true; current += char; continue; }
    if (char === ";") { if (stripComments(current)) statements.push(current.trim()); current = ""; continue; }
    current += char;
  }
  if (stripComments(current)) statements.push(current.trim());
  return statements;
}

export function classifyUserSql(sql: string): "read" | "write" {
  const statements = splitSqlStatements(sql);
  if (statements.length !== 1) throw new Error("Run one SQL statement at a time so every write receives its own checkpoint.");
  const clean = stripComments(statements[0]);
  if (/^(SELECT|EXPLAIN)\b/i.test(clean)) return "read";
  if (/^WITH\b/i.test(clean)) return /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(clean) ? "write" : "read";
  if (/^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(clean)) return "write";
  throw new Error("Supported statements are SELECT, INSERT, UPDATE, DELETE, and SQLite DDL commands.");
}

export function isDestructiveSql(sql: string) {
  const clean = stripComments(sql);
  return /^(DELETE|DROP|ALTER)\b/i.test(clean) || (/^UPDATE\b/i.test(clean) && !/\bWHERE\b/i.test(clean));
}
