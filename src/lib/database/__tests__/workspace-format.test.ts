import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64, parsePortableWorkspace, queryResultToCsv } from "@/lib/database/workspace-format";
import type { PortableWorkspaceFile } from "@/lib/database/types";

function portableFixture(): PortableWorkspaceFile {
  return {
    format: "queryquest-workspace",
    version: 1,
    exportedAt: "2026-11-04T08:00:00.000Z",
    workspace: { id: "workspace-demo", name: "Demo", createdAt: "2026-11-04T08:00:00.000Z", updatedAt: "2026-11-04T08:00:00.000Z" },
    settings: { editorSql: "SELECT 1;", activePanel: "editor", explorerCollapsed: false },
    activeDatabaseId: "demo-db",
    databases: [{ metadata: { id: "demo-db", workspaceId: "workspace-demo", name: "Demo DB", source: "created", createdAt: "2026-11-04T08:00:00.000Z", updatedAt: "2026-11-04T08:00:00.000Z", sizeBytes: 4 }, sqliteBase64: bytesToBase64(new Uint8Array([1, 2, 3, 4])), diagramPositions: {} }],
    savedQueries: [],
    queryHistory: [],
  };
}

describe("portable workspace format", () => {
  it("round-trips binary SQLite bytes without changing their contents", () => {
    const bytes = new Uint8Array([0, 255, 83, 81, 76, 105, 116, 101]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("validates the versioned workspace envelope", () => {
    const portable = portableFixture();
    expect(parsePortableWorkspace(JSON.stringify(portable))).toEqual(portable);
    expect(() => parsePortableWorkspace(JSON.stringify({ ...portable, version: 999 }))).toThrow("not supported");
    expect(() => parsePortableWorkspace("not json")).toThrow("valid JSON");
  });

  it("escapes commas, quotes, line breaks, nulls, and blobs in CSV results", () => {
    const csv = queryResultToCsv({ columns: ["name", "note", "value"], values: [["Ada, Jr.", "said \"hi\"\nagain", null], ["Blob", new Uint8Array([1, 2]), 4]], rowCount: 2, rowsAffected: 0, elapsedMs: 1 });
    expect(csv).toContain('"Ada, Jr."');
    expect(csv).toContain('"said ""hi""\nagain"');
    expect(csv).toContain("BLOB (2 bytes)");
  });
});
