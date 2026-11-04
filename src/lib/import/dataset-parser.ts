import Papa from "papaparse";

import type { DatasetColumn, SqlValue, SQLiteColumnType } from "@/lib/database/types";

export type ParsedDataset = {
  columns: DatasetColumn[];
  rows: SqlValue[][];
};

function uniqueHeaders(values: string[]) {
  const counts = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `column_${index + 1}`;
    const count = (counts.get(base.toLowerCase()) ?? 0) + 1;
    counts.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function inferValue(value: unknown): { value: SqlValue; type: SQLiteColumnType | null } {
  if (value === null || value === undefined || value === "") return { value: null, type: null };
  if (typeof value === "boolean") return { value: value ? 1 : 0, type: "INTEGER" };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { value: String(value), type: "TEXT" };
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return { value: String(value), type: "TEXT" };
    }
    return { value, type: Number.isInteger(value) ? "INTEGER" : "REAL" };
  }
  if (typeof value === "object") return { value: JSON.stringify(value), type: "TEXT" };

  const text = String(value).trim();
  if (/^[+-]?\d+$/.test(text) && Number.isSafeInteger(Number(text))) {
    return { value: Number(text), type: "INTEGER" };
  }
  if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    return { value: Number(text), type: "REAL" };
  }
  return { value: String(value), type: "TEXT" };
}

function normalizeRows(headers: string[], rawRows: unknown[][]): ParsedDataset {
  const inferred = rawRows.map((row) =>
    headers.map((_, index) => inferValue(row[index])),
  );
  const columns = headers.map((name, columnIndex) => {
    const types = inferred.map((row) => row[columnIndex].type).filter(Boolean);
    const type: SQLiteColumnType = types.includes("TEXT")
      ? "TEXT"
      : types.includes("REAL")
        ? "REAL"
        : "INTEGER";
    return { name, type };
  });
  return { columns, rows: inferred.map((row) => row.map((cell) => cell.value)) };
}

export function parseCsvDataset(text: string): ParsedDataset {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (result.errors.length) throw new Error(`CSV parsing failed: ${result.errors[0].message}`);
  if (result.data.length < 2) throw new Error("CSV must include a header and at least one data row.");
  const headers = uniqueHeaders(result.data[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header));
  if (!headers.length) throw new Error("CSV header row is empty.");
  if (result.data.slice(1).some((row) => row.length > headers.length)) {
    throw new Error("CSV contains rows with more values than the header row.");
  }
  return normalizeRows(headers, result.data.slice(1));
}

export function parseJsonDataset(text: string): ParsedDataset {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON parsing failed. Check that the file contains valid JSON.");
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("JSON must be a non-empty array of objects.");
  }
  if (data.some((value) => !value || Array.isArray(value) || typeof value !== "object")) {
    throw new Error("Every JSON array item must be an object.");
  }
  const records = data as Record<string, unknown>[];
  const sourceHeaders = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const headers = uniqueHeaders(sourceHeaders);
  if (!headers.length) throw new Error("JSON objects do not contain any fields.");
  return normalizeRows(headers, records.map((record) => sourceHeaders.map((header) => record[header])));
}
