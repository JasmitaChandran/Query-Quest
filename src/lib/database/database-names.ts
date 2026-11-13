import type { DatabaseMetadata } from "@/lib/database/types";

export function suggestUniqueDatabaseName(
  requestedName: string,
  existingNames: Iterable<string>,
) {
  const baseName = requestedName.trim() || "Imported database";
  const usedNames = new Set(
    Array.from(existingNames, (name) => name.trim().toLocaleLowerCase()),
  );

  if (!usedNames.has(baseName.toLocaleLowerCase())) return baseName;

  let suffix = 2;
  while (usedNames.has(`${baseName} (${suffix})`.toLocaleLowerCase())) suffix += 1;
  return `${baseName} (${suffix})`;
}

export function findDatabaseNameConflict(
  databases: Array<Pick<DatabaseMetadata, "id" | "name">>,
  name: string,
  excludedDatabaseId?: string,
) {
  const normalizedName = name.trim().toLocaleLowerCase();
  return databases.find(
    (database) =>
      database.id !== excludedDatabaseId &&
      database.name.trim().toLocaleLowerCase() === normalizedName,
  );
}
