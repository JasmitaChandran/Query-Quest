"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { Monaco, OnMount } from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import * as monacoEditor from "monaco-editor";
import { format } from "sql-formatter";
import {
  Braces,
  CircleCheck,
  FileCode2,
  Keyboard,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableSchema, TableSummary } from "@/lib/database/types";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { classifyUserSql, isDestructiveSql } from "@/lib/database/sql-safety";
import { cn } from "@/lib/utils";

loader.config({ monaco: monacoEditor });

type MonacoEnvironmentHost = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: () => Worker;
  };
};

if (typeof window !== "undefined") {
  (globalThis as MonacoEnvironmentHost).MonacoEnvironment = {
    getWorker: () =>
      new Worker(
        new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
        { type: "module", name: "queryquest-monaco" },
      ),
  };
}

const Editor = dynamic(
  () => import("@monaco-editor/react").then((module) => module.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 p-5" aria-label="Loading SQL editor">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    ),
  },
);

const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT JOIN",
  "INNER JOIN",
  "ON",
  "AS",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "DISTINCT",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "WITH",
  "ASC",
  "DESC",
  "AND",
  "OR",
  "NOT",
  "NULL",
  "INSERT INTO",
  "UPDATE",
  "DELETE FROM",
  "CREATE TABLE",
  "ALTER TABLE",
  "DROP TABLE",
  "VALUES",
  "SET",
] as const;

function defineQueryQuestThemes(monaco: Monaco) {
  monaco.editor.defineTheme("queryquest-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "A78BFA", fontStyle: "bold" },
      { token: "number", foreground: "67E8F9" },
      { token: "string", foreground: "86EFAC" },
      { token: "comment", foreground: "8792A8", fontStyle: "italic" },
      { token: "identifier", foreground: "E2E8F0" },
    ],
    colors: {
      "editor.background": "#0F111A",
      "editor.foreground": "#E6E8F0",
      "editorLineNumber.foreground": "#7D879C",
      "editorLineNumber.activeForeground": "#CBD5E1",
      "editorCursor.foreground": "#A78BFA",
      "editor.selectionBackground": "#5B3FAF66",
      "editor.lineHighlightBackground": "#171B27",
      "editorSuggestWidget.background": "#171A25",
      "editorSuggestWidget.border": "#34394B",
      "editorSuggestWidget.selectedBackground": "#2A2147",
      "editorSuggestWidget.foreground": "#E2E8F0",
      "editorWidget.foreground": "#E2E8F0",
      "editorHoverWidget.background": "#171A25",
      "editorHoverWidget.border": "#34394B",
    },
  });

  monaco.editor.defineTheme("queryquest-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "6D28D9", fontStyle: "bold" },
      { token: "number", foreground: "075985" },
      { token: "string", foreground: "166534" },
      { token: "comment", foreground: "64748B", fontStyle: "italic" },
      { token: "identifier", foreground: "1F2937" },
    ],
    colors: {
      "editor.background": "#FBFBFE",
      "editor.foreground": "#1F2937",
      "editorLineNumber.foreground": "#64748B",
      "editorLineNumber.activeForeground": "#312E81",
      "editorCursor.foreground": "#7C3AED",
      "editor.selectionBackground": "#C4B5FD99",
      "editor.lineHighlightBackground": "#F2F0FA",
      "editorSuggestWidget.background": "#FFFFFF",
      "editorSuggestWidget.foreground": "#1F2937",
      "editorSuggestWidget.border": "#D7D5E2",
      "editorSuggestWidget.selectedBackground": "#EDE9FE",
      "editorHoverWidget.background": "#FFFFFF",
      "editorHoverWidget.border": "#D7D5E2",
    },
  });
}

export function MonacoSqlEditor({ presentation = false, onVisualizationReady }: { presentation?: boolean; onVisualizationReady?: () => void } = {}) {
  const { resolvedTheme } = useTheme();
  const editorRef = React.useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const completionProviderRef = React.useRef<monacoEditor.IDisposable | null>(null);
  const completionDataRef = React.useRef<{
    tables: TableSummary[];
    schemas: Record<string, TableSchema>;
  }>({ tables: [], schemas: {} });

  const status = useDatabaseStore((state) => state.status);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const isQueryRunning = useDatabaseStore((state) => state.isQueryRunning);
  const tables = useDatabaseStore((state) => state.tables);
  const tableSchemas = useDatabaseStore((state) => state.tableSchemas);
  const runQuery = useDatabaseStore((state) => state.runQuery);
  const visualizeQuery = useDatabaseStore((state) => state.visualizeQuery);
  const isVisualizationLoading = useDatabaseStore((state) => state.isVisualizationLoading);
  const queuedSql = useWorkspaceStore((state) => state.queuedSql);
  const runRequest = useWorkspaceStore((state) => state.runRequest);
  const consumeSqlRun = useWorkspaceStore((state) => state.consumeSqlRun);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const query = useWorkspaceStore((state) => state.editorSql);
  const setQuery = useWorkspaceStore((state) => state.setEditorSql);

  React.useEffect(() => {
    completionDataRef.current = { tables, schemas: tableSchemas };
  }, [tableSchemas, tables]);

  const executeQuery = React.useCallback(
    async (sql: string) => {
      if (!sql.trim() || isQueryRunning || status !== "ready" || !activeDatabaseId) return;
      if (isDestructiveSql(sql) && !window.confirm("This SQL can delete data or alter schema. A checkpoint will be saved first. Continue?")) return;
      try {
        await runQuery(sql);
        toast.success("Query complete", { description: "The result table has been updated." });
      } catch (error) {
        toast.error("Query could not run", {
          description: error instanceof Error ? error.message : "Check the SQL and try again.",
        });
      }
    },
    [activeDatabaseId, isQueryRunning, runQuery, status],
  );
  const executeQueryRef = React.useRef(executeQuery);

  React.useEffect(() => {
    executeQueryRef.current = executeQuery;
  }, [executeQuery]);

  React.useEffect(() => {
    if (!runRequest || !queuedSql) return;
    const timeout = window.setTimeout(() => {
      consumeSqlRun();
      setQuery(queuedSql);
      editorRef.current?.setValue(queuedSql);
      void executeQueryRef.current(queuedSql);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [consumeSqlRun, queuedSql, runRequest, setQuery]);

  const handleMount = React.useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      completionProviderRef.current?.dispose();
      completionProviderRef.current = monaco.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [" ", ".", ","],
        provideCompletionItems: (
          model: monacoEditor.editor.ITextModel,
          position: monacoEditor.Position,
        ) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const current = completionDataRef.current;
          const suggestions: monacoEditor.languages.CompletionItem[] = [
            ...SQL_KEYWORDS.map((keyword) => ({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: keyword,
              detail: "SQL keyword",
              range,
            })),
            ...current.tables.map((table) => ({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: table.name,
              detail: `${table.type} · ${table.rowCount} rows`,
              sortText: `0-${table.name}`,
              range,
            })),
            ...Object.values(current.schemas).flatMap((schema) =>
              schema.columns.map((column) => ({
                label: column.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: column.name,
                detail: `${schema.name}.${column.name} · ${column.type}`,
                sortText: `1-${column.name}`,
                range,
              })),
            ),
          ];
          return { suggestions };
        },
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        void executeQueryRef.current(editor.getValue());
      });
      editor.focus();
    },
    [],
  );

  React.useEffect(
    () => () => {
      completionProviderRef.current?.dispose();
    },
    [],
  );

  const handleFormat = () => {
    if (!query.trim()) return;
    try {
      const formatted = format(query, {
        language: "sqlite",
        keywordCase: "upper",
        tabWidth: 2,
      });
      setQuery(formatted);
      editorRef.current?.setValue(formatted);
      toast.success("SQL formatted");
    } catch (error) {
      toast.error("SQL could not be formatted", {
        description: error instanceof Error ? error.message : "Check the query syntax.",
      });
    }
  };

  const handleVisualize = async () => {
    const sql = editorRef.current?.getValue() ?? query;
    if (!sql.trim()) return;
    try {
      const operation = classifyUserSql(sql);
      if (operation === "write" && !window.confirm("Visualizing this statement will execute it once against the active database. A checkpoint will be saved first, and replaying the animation will not execute it again. Continue?")) return;
      await visualizeQuery(sql);
      if (onVisualizationReady) onVisualizationReady();
      else setActivePanel("visualizer");
      toast.success(operation === "write" ? "Modification visualized" : "Visualization ready", { description: operation === "write" ? "The write ran once and is protected by Undo." : "SQLite validated every logical stage." });
    } catch (error) {
      toast.error("This query is outside the bounded visualizer", { description: error instanceof Error ? error.message : "Run it normally or simplify the query." });
    }
  };

  const canRun = status === "ready" && Boolean(activeDatabaseId) && Boolean(query.trim());

  return (
    <section className={cn("min-h-[330px] overflow-auto border-b border-border bg-editor text-editor-foreground", presentation ? "h-[42vh] min-h-[360px]" : "resize-y md:h-[46vh] md:max-h-[68vh]")}>
      <div className={cn("flex items-center border-b border-border bg-surface-elevated px-4", presentation ? "h-12" : "h-10")}>
        <div className="flex h-full items-center gap-2 border-b-2 border-primary text-[13px] font-semibold">
          <FileCode2 className="size-3.5 text-primary" />
          {presentation ? "Teaching query.sql" : "query.sql"}
          <span className="size-1.5 rounded-full bg-success" />
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Braces className="size-3" /> SQLite
        </div>
      </div>

      <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 sm:px-4", presentation ? "min-h-16" : "min-h-12")}>
        <Button
          size={presentation ? "default" : "sm"}
          onClick={() => void executeQuery(editorRef.current?.getValue() ?? query)}
          disabled={!canRun || isQueryRunning}
        >
          {isQueryRunning ? <LoaderCircle className="animate-spin" /> : <Play className="fill-current" />}
          {isQueryRunning ? "Running…" : "Run query"}
        </Button>
        <span className="hidden items-center gap-1 rounded-md border border-border bg-muted/45 px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-flex">
          <Keyboard className="size-3" /> Ctrl/⌘ Enter
        </span>
        <Button variant="outline" size={presentation ? "default" : "sm"} onClick={() => void handleVisualize()} disabled={!canRun || isQueryRunning || isVisualizationLoading}>
          {isVisualizationLoading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {isVisualizationLoading ? "Analyzing…" : "Visualize Query"}
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size={presentation ? "default" : "sm"}
          onClick={handleFormat}
          disabled={!query.trim()}
          aria-label="Format SQL"
        >
          <WandSparkles />
          <span className="hidden sm:inline">Format SQL</span>
        </Button>
        <Button
          variant="ghost"
          size={presentation ? "default" : "sm"}
          onClick={() => {
            setQuery("");
            editorRef.current?.setValue("");
          }}
          disabled={!query}
          title="Clear editor"
        >
          <RotateCcw />
          <span className="hidden sm:inline">Clear</span>
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden items-center gap-1.5 sm:flex">
            {status === "ready" ? (
              <>
                <CircleCheck className="size-3 text-success" /> SQLite ready
              </>
            ) : (
              <>
                <LoaderCircle className="size-3 animate-spin" /> Initializing
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-tint px-2 py-1 text-xs font-semibold text-success"><ShieldCheck className="size-3" />Checkpoint protected</span>
        </div>
      </div>

      <div className={cn("min-h-[220px]", presentation ? "h-[calc(100%-7rem)]" : "h-[260px] md:h-[calc(100%-6rem)]")}>
        <Editor
          height="100%"
          language="sql"
          path="queryquest.sql"
          value={query}
          theme={resolvedTheme === "light" ? "queryquest-light" : "queryquest-dark"}
          beforeMount={defineQueryQuestThemes}
          onMount={handleMount}
          onChange={(value) => setQuery(value ?? "")}
          options={{
            automaticLayout: true,
            fontFamily: "var(--font-geist-mono), 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
            fontSize: presentation ? 20 : 15,
            lineHeight: presentation ? 34 : 24,
            fontLigatures: true,
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            minimap: { enabled: false },
            padding: { top: 14, bottom: 14 },
            renderLineHighlight: "line",
            roundedSelection: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            suggest: { showKeywords: true, showFields: true },
            suggestOnTriggerCharacters: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
      <div className="flex h-5 cursor-row-resize items-center justify-center border-t border-border/70 bg-muted/20" title="Drag to resize editor">
        <span className="h-[3px] w-10 rounded-full bg-muted-foreground/35" />
      </div>
    </section>
  );
}
