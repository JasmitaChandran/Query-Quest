import type { PortableWorkspaceFile, QueryResult } from "@/lib/database/types";

export const DEFAULT_WORKSPACE_ID = "workspace-default";
export const WORKSPACE_FORMAT = "queryquest-workspace" as const;
export const WORKSPACE_FORMAT_VERSION = 1 as const;

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  let binary: string;
  try { binary = atob(value); }
  catch { throw new Error("A database payload is not valid base64."); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function parsePortableWorkspace(text: string): PortableWorkspaceFile {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("This file is not valid JSON."); }
  if (!parsed || typeof parsed !== "object") throw new Error("This is not a QueryQuest workspace file.");
  const value = parsed as Partial<PortableWorkspaceFile>;
  if (value.format !== WORKSPACE_FORMAT) throw new Error("This file is not a QueryQuest workspace export.");
  if (value.version !== WORKSPACE_FORMAT_VERSION) throw new Error(`Workspace format version ${String(value.version)} is not supported by this QueryQuest version.`);
  if (!value.workspace?.id || !value.workspace.name) throw new Error("Workspace metadata is incomplete.");
  if (!Array.isArray(value.databases) || !Array.isArray(value.savedQueries) || !Array.isArray(value.queryHistory)) throw new Error("Workspace contents are incomplete.");
  if (!value.settings || typeof value.settings.editorSql !== "string" || typeof value.settings.explorerCollapsed !== "boolean" || !["editor", "visualizer", "data", "schema", "history"].includes(value.settings.activePanel ?? "")) throw new Error("Workspace settings are incomplete or invalid.");
  const databaseIds = new Set<string>();
  for (const item of value.databases) {
    if (!item?.metadata?.id || !item.metadata.name || typeof item.sqliteBase64 !== "string") throw new Error("A database entry is incomplete.");
    if (databaseIds.has(item.metadata.id)) throw new Error(`The workspace contains duplicate database ID “${item.metadata.id}”.`);
    databaseIds.add(item.metadata.id);
    base64ToBytes(item.sqliteBase64);
  }
  if (value.activeDatabaseId && !databaseIds.has(value.activeDatabaseId)) throw new Error("The active database reference is invalid.");
  if (value.savedQueries.some((query) => !query?.id || !query.name || typeof query.sql !== "string")) throw new Error("A saved query entry is incomplete.");
  return value as PortableWorkspaceFile;
}

function csvCell(value: unknown) {
  if (value === null) return "";
  const text = value instanceof Uint8Array ? `BLOB (${value.byteLength} bytes)` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function queryResultToCsv(result: QueryResult) {
  return [result.columns.map(csvCell).join(","), ...result.values.map((row) => row.map(csvCell).join(","))].join("\r\n");
}
