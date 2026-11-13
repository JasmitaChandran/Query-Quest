import { describe, expect, it } from "vitest";

import {
  findDatabaseNameConflict,
  suggestUniqueDatabaseName,
} from "@/lib/database/database-names";

describe("database display names", () => {
  it("adds the next available numeric suffix without changing the requested base", () => {
    expect(suggestUniqueDatabaseName("College", ["College", "College (2)"])).toBe(
      "College (3)",
    );
  });

  it("treats display-name conflicts case-insensitively", () => {
    expect(suggestUniqueDatabaseName("college", ["College"])).toBe("college (2)");
    expect(findDatabaseNameConflict(
      [{ id: "college", name: "College" }],
      "COLLEGE",
    )).toEqual({ id: "college", name: "College" });
  });

  it("can exclude the database currently being renamed", () => {
    expect(findDatabaseNameConflict(
      [{ id: "college", name: "College" }],
      "College",
      "college",
    )).toBeUndefined();
  });
});
