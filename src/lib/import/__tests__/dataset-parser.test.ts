import { describe, expect, it } from "vitest";

import { parseCsvDataset, parseJsonDataset } from "@/lib/import/dataset-parser";

describe("dataset imports", () => {
  it("parses CSV headers, rows, and SQLite-compatible types", () => {
    const parsed = parseCsvDataset("id,name,gpa\n1,Ada,3.9\n2,Linus,4.0");
    expect(parsed.columns).toEqual([
      { name: "id", type: "INTEGER" },
      { name: "name", type: "TEXT" },
      { name: "gpa", type: "REAL" },
    ]);
    expect(parsed.rows).toEqual([[1, "Ada", 3.9], [2, "Linus", 4]]);
  });

  it("supports quoted CSV fields and missing values", () => {
    const parsed = parseCsvDataset('name,notes,score\n"Kim, Lee","Line one\nLine two",10\nNoor,,8');
    expect(parsed.rows).toEqual([["Kim, Lee", "Line one\nLine two", 10], ["Noor", null, 8]]);
  });

  it("makes blank and duplicate CSV headers safe and unique", () => {
    const parsed = parseCsvDataset("name,name,\nA,B,C");
    expect(parsed.columns.map((column) => column.name)).toEqual(["name", "name_2", "column_3"]);
  });

  it("rejects inconsistent CSV rows instead of silently discarding data", () => {
    expect(() => parseCsvDataset("id,name\n1,Ada,extra")).toThrow("more values than the header");
  });

  it("parses JSON arrays of objects and preserves sparse records", () => {
    const parsed = parseJsonDataset(JSON.stringify([
      { id: 1, name: "Maya", active: true },
      { id: 2, name: "Omar", profile: { year: 3 } },
    ]));
    expect(parsed.columns.map((column) => column.name)).toEqual(["id", "name", "active", "profile"]);
    expect(parsed.rows[0]).toEqual([1, "Maya", 1, null]);
    expect(parsed.rows[1]).toEqual([2, "Omar", null, '{"year":3}']);
  });

  it("rejects unsupported JSON shapes", () => {
    expect(() => parseJsonDataset('{"id":1}')).toThrow("array of objects");
    expect(() => parseJsonDataset("[1,2,3]")).toThrow("Every JSON array item");
  });
});
