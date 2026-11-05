"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  getNodesBounds,
  getViewportForBounds,
  useNodesState,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import {
  AlertCircle,
  Download,
  FileCode2,
  GitFork,
  ImageDown,
  KeyRound,
  Link2,
  LoaderCircle,
  Network,
  RefreshCcw,
  Table2,
} from "lucide-react";
import { toast } from "sonner";

import { TableSchemaEditorDialog } from "@/components/playground/table-schema-editor-dialog";
import { Button } from "@/components/ui/button";
import { getDatabaseManager } from "@/lib/database/database-manager";
import {
  automaticDiagramPositions,
  detectSchemaRelationships,
  mergeDiagramPositions,
  type SchemaRelationship,
} from "@/lib/database/schema-diagram";
import type { DiagramPositions, TableSchema, TableSummary } from "@/lib/database/types";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";

type Emphasis = "neutral" | "active" | "related" | "dimmed";
type SchemaNodeData = {
  table: TableSummary;
  schema: TableSchema;
  emphasis: Emphasis;
  onEdit: (tableName: string) => void;
};
type SchemaTableNode = Node<SchemaNodeData, "schemaTable">;

const nodeTypes = { schemaTable: SchemaTableNodeView };

function SchemaTableNodeView({ data }: NodeProps<SchemaTableNode>) {
  const foreignColumns = new Set(data.schema.foreignKeys.map((foreignKey) => foreignKey.fromColumn.toLowerCase()));
  return <div className={cn(
    "w-[282px] overflow-hidden rounded-2xl border bg-[#111522]/96 text-slate-100 shadow-[0_18px_60px_rgba(0,0,0,.28)] transition-all duration-200",
    data.emphasis === "active" && "border-violet-400 shadow-[0_0_0_2px_rgba(139,92,246,.2),0_20px_65px_rgba(76,29,149,.32)]",
    data.emphasis === "related" && "border-blue-400/70 shadow-[0_0_0_1px_rgba(59,130,246,.18),0_18px_55px_rgba(30,64,175,.24)]",
    data.emphasis === "dimmed" && "scale-[.985] opacity-35",
  )}>
    <Handle type="target" position={Position.Left} isConnectable={false} className="!size-2.5 !border-2 !border-[#111522] !bg-blue-400" />
    <Handle type="source" position={Position.Right} isConnectable={false} className="!size-2.5 !border-2 !border-[#111522] !bg-violet-400" />
    <div className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-violet-500/18 to-blue-500/10 px-3.5 py-3">
      <div className="grid size-7 place-items-center rounded-lg border border-violet-400/20 bg-violet-400/10 text-violet-300"><Table2 className="size-3.5" /></div>
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold tracking-tight">{data.table.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{data.table.rowCount} {data.table.rowCount === 1 ? "row" : "rows"} · {data.schema.columns.length} columns</p></div>
      <button type="button" className="nodrag rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:border-violet-400/40 hover:bg-violet-400/10 hover:text-violet-300" onClick={(event) => { event.stopPropagation(); data.onEdit(data.table.name); }} aria-label={`Edit schema for ${data.table.name}`} title="Edit schema"><FileCode2 className="size-3.5" /></button>
    </div>
    <div className="max-h-[252px] overflow-y-auto py-1.5 workspace-scrollbar">{data.schema.columns.map((column) => {
      const foreign = foreignColumns.has(column.name.toLowerCase());
      return <div key={column.name} className={cn("flex min-h-8 items-center gap-2 px-3.5 py-1 text-[10px]", foreign && "bg-blue-500/[.055]")}>
        <span className="flex w-8 shrink-0 items-center gap-1">{column.primaryKey ? <KeyRound className="size-3 text-amber-400" aria-label="Primary key" /> : null}{foreign ? <GitFork className="size-3 text-blue-400" aria-label="Foreign key" /> : null}{!column.primaryKey && !foreign ? <span className="ml-1 size-1 rounded-full bg-slate-600" /> : null}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{column.name}</span><span className="max-w-24 truncate font-mono text-[9px] text-slate-500">{column.type}</span>
      </div>;
    })}</div>
  </div>;
}

function buildNodes(
  tables: TableSummary[],
  schemas: Record<string, TableSchema>,
  positions: DiagramPositions,
  onEdit: (tableName: string) => void,
): SchemaTableNode[] {
  return tables.filter((table) => table.type === "table" && schemas[table.name]).map((table) => ({
    id: table.name,
    type: "schemaTable",
    position: positions[table.name],
    data: { table, schema: schemas[table.name], emphasis: "neutral", onEdit },
  }));
}

function buildEdges(relationships: SchemaRelationship[]): Edge[] {
  return relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.parentTable,
    target: relationship.childTable,
    type: "smoothstep",
    label: relationship.cardinality === "one-to-many" ? "1 → N" : "1 → 1",
    labelStyle: { fill: "#b9c1d6", fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: "#111522", fillOpacity: 0.94 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#818cf8" },
    style: { stroke: "#818cf8", strokeWidth: 1.6 },
  }));
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

function RelationshipList({ tableName, relationships }: { tableName: string; relationships: SchemaRelationship[] }) {
  const relevant = relationships.filter((relationship) => relationship.parentTable === tableName || relationship.childTable === tableName);
  if (!relevant.length) return <p className="rounded-xl border border-dashed p-3 text-[10px] leading-4 text-muted-foreground">No declared foreign-key relationships touch this table.</p>;
  return <div className="space-y-2">{relevant.map((relationship) => {
    const outgoing = relationship.childTable === tableName;
    const otherTable = outgoing ? relationship.parentTable : relationship.childTable;
    return <div key={relationship.id} className="rounded-xl border bg-background/35 p-3"><div className="flex items-center gap-2"><Link2 className="size-3.5 text-blue-500" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{outgoing ? "References" : "Referenced by"} {otherTable}</span><span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[8px] font-bold text-violet-500">{relationship.cardinality === "one-to-many" ? "1:N" : "1:1"}</span></div><p className="mt-1.5 truncate font-mono text-[9px] text-muted-foreground">{outgoing ? relationship.childColumns.join(", ") : relationship.parentColumns.join(", ")} → {outgoing ? relationship.parentColumns.join(", ") : relationship.childColumns.join(", ")}</p></div>;
  })}</div>;
}

function SchemaDiagramCanvas({ databaseId, databaseName, tables, schemas, initialPositions, relationships, onPositionsChange }: {
  databaseId: string;
  databaseName: string;
  tables: TableSummary[];
  schemas: Record<string, TableSchema>;
  initialPositions: DiagramPositions;
  relationships: SchemaRelationship[];
  onPositionsChange: (positions: DiagramPositions) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const flowRef = React.useRef<ReactFlowInstance<SchemaTableNode, Edge> | null>(null);
  const selectedTableFromStore = useDatabaseStore((state) => state.selectedTable);
  const selectTable = useDatabaseStore((state) => state.selectTable);
  const [schemaEditorTable, setSchemaEditorTable] = React.useState<string | null>(null);
  const [selectedTable, setSelectedTable] = React.useState<string | null>(tables.some((table) => table.name === selectedTableFromStore) ? selectedTableFromStore : null);
  const [hoveredTable, setHoveredTable] = React.useState<string | null>(null);
  const [isExporting, setIsExporting] = React.useState<"png" | "svg" | null>(null);
  const onEdit = React.useCallback((tableName: string) => setSchemaEditorTable(tableName), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaTableNode>(buildNodes(tables, schemas, initialPositions, onEdit));
  const baseEdges = React.useMemo(() => buildEdges(relationships), [relationships]);
  const focusTable = hoveredTable ?? selectedTable;
  const relatedTables = React.useMemo(() => {
    if (!focusTable) return new Set<string>();
    return new Set(relationships.flatMap((relationship) => relationship.parentTable === focusTable ? [relationship.childTable] : relationship.childTable === focusTable ? [relationship.parentTable] : []));
  }, [focusTable, relationships]);
  const displayedNodes = React.useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      emphasis: !focusTable ? "neutral" : node.id === focusTable ? "active" : relatedTables.has(node.id) ? "related" : "dimmed",
    },
  } satisfies SchemaTableNode)), [focusTable, nodes, relatedTables]);
  const displayedEdges = React.useMemo(() => baseEdges.map((edge) => {
    const active = Boolean(focusTable && (edge.source === focusTable || edge.target === focusTable));
    return { ...edge, animated: active, style: { ...edge.style, opacity: focusTable && !active ? 0.16 : 1, strokeWidth: active ? 2.5 : 1.6 } };
  }), [baseEdges, focusTable]);
  const selectedSchema = selectedTable ? schemas[selectedTable] : null;

  const persist = React.useCallback((nextNodes: SchemaTableNode[]) => {
    const positions = Object.fromEntries(nextNodes.map((node) => [node.id, node.position]));
    onPositionsChange(positions);
    void getDatabaseManager().saveDiagramPositions(positions, databaseId).catch((error) => toast.error("Could not save diagram layout", { description: error instanceof Error ? error.message : "Try again." }));
  }, [databaseId, onPositionsChange]);

  const resetLayout = () => {
    const positions = automaticDiagramPositions(tables, relationships);
    const nextNodes = buildNodes(tables, schemas, positions, onEdit);
    setNodes(nextNodes);
    persist(nextNodes);
    void flowRef.current?.fitView({ padding: "12%", duration: 450 });
    toast.success("Diagram layout reset");
  };

  const exportDiagram = async (format: "png" | "svg") => {
    const viewport = containerRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport || !nodes.length) return;
    setIsExporting(format);
    try {
      const bounds = getNodesBounds(displayedNodes);
      const width = Math.max(900, Math.ceil(bounds.width + 160));
      const height = Math.max(620, Math.ceil(bounds.height + 160));
      const transform = getViewportForBounds(bounds, width, height, 0.5, 2, 0.12);
      const options = {
        backgroundColor: "#090c16",
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
        },
        pixelRatio: format === "png" ? 2 : 1,
      };
      const dataUrl = format === "png" ? await toPng(viewport, options) : await toSvg(viewport, options);
      const safeName = databaseName.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "database";
      downloadDataUrl(dataUrl, `${safeName}-schema-diagram.${format}`);
      toast.success(`Schema diagram exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error("Could not export diagram", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setIsExporting(null);
    }
  };

  return <div className="grid min-h-[620px] flex-1 bg-[#090c16] lg:grid-cols-[minmax(0,1fr)_320px]">
    <div ref={containerRef} className="relative min-h-[620px] overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 bg-gradient-to-b from-[#090c16] via-[#090c16]/90 to-transparent px-4 pb-9 pt-4">
        <div className="pointer-events-auto mr-auto"><p className="flex items-center gap-2 text-xs font-semibold text-slate-100"><Network className="size-4 text-violet-400" />{databaseName} schema</p><p className="mt-1 text-[10px] text-slate-500">{nodes.length} tables · {relationships.length} declared relationships</p></div>
        <Button className="pointer-events-auto border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" variant="outline" size="sm" onClick={resetLayout}><RefreshCcw />Reset layout</Button>
        <Button className="pointer-events-auto border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" variant="outline" size="sm" onClick={() => void exportDiagram("svg")} disabled={Boolean(isExporting)}>{isExporting === "svg" ? <LoaderCircle className="animate-spin" /> : <Download />}SVG</Button>
        <Button className="pointer-events-auto border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" variant="outline" size="sm" onClick={() => void exportDiagram("png")} disabled={Boolean(isExporting)}>{isExporting === "png" ? <LoaderCircle className="animate-spin" /> : <ImageDown />}PNG</Button>
      </div>
      <ReactFlow<SchemaTableNode, Edge>
        nodes={displayedNodes}
        edges={displayedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onInit={(instance) => { flowRef.current = instance; }}
        onNodeClick={(_, node) => { setSelectedTable(node.id); void selectTable(node.id); }}
        onNodeMouseEnter={(_, node) => setHoveredTable(node.id)}
        onNodeMouseLeave={() => setHoveredTable(null)}
        onNodeDragStop={(_, draggedNode) => {
          const nextNodes = nodes.map((node) => node.id === draggedNode.id ? { ...node, position: draggedNode.position } : node);
          setNodes(nextNodes);
          persist(nextNodes);
        }}
        onPaneClick={() => setSelectedTable(null)}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: "14%", minZoom: 0.45, maxZoom: 1.2 }}
        minZoom={0.25}
        maxZoom={1.8}
        colorMode="dark"
        className="schema-flow"
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.15} color="#2b3146" />
        <Controls position="bottom-left" showInteractive={false} fitViewOptions={{ padding: "12%" }} />
        <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.id === focusTable ? "#8b5cf6" : relatedTables.has(node.id) ? "#4389ff" : "#30374d"} maskColor="rgba(5,8,17,.72)" />
      </ReactFlow>
      {!relationships.length ? <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 w-[min(90%,480px)] -translate-x-1/2 rounded-xl border border-blue-400/20 bg-[#111522]/92 p-3 text-center text-[10px] leading-4 text-slate-400 shadow-xl backdrop-blur"><AlertCircle className="mr-1.5 inline size-3.5 text-blue-400" />No foreign keys are defined. Tables are shown independently; QueryQuest does not infer relationships from matching names.</div> : null}
    </div>

    <aside className="workspace-scrollbar max-h-[620px] overflow-y-auto bg-card/95 p-4 lg:max-h-none">
      {selectedSchema && selectedTable ? <div className="space-y-5">
        <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground">Selected table</p><div className="mt-2 flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Table2 className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedTable}</p><p className="text-[10px] text-muted-foreground">{selectedSchema.columns.length} columns</p></div></div></div>
        <Button className="w-full" size="sm" onClick={() => setSchemaEditorTable(selectedTable)}><FileCode2 />Edit schema</Button>
        <section><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Columns</p><div className="space-y-1.5">{selectedSchema.columns.map((column) => {
          const foreign = selectedSchema.foreignKeys.some((foreignKey) => foreignKey.fromColumn === column.name);
          return <div key={column.name} className="flex items-center gap-2 rounded-lg border bg-background/35 px-2.5 py-2 text-[10px]">{column.primaryKey ? <KeyRound className="size-3 text-amber-500" /> : foreign ? <GitFork className="size-3 text-blue-500" /> : <span className="size-3" />}<span className="min-w-0 flex-1 truncate font-medium">{column.name}</span><span className="font-mono text-[9px] text-muted-foreground">{column.type}</span></div>;
        })}</div></section>
        <section><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Relationships</p><RelationshipList tableName={selectedTable} relationships={relationships} /></section>
      </div> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><div className="grid size-12 place-items-center rounded-2xl border bg-muted/30 text-muted-foreground"><Network className="size-5" /></div><p className="mt-4 text-sm font-semibold">Select a table</p><p className="mt-1.5 max-w-56 text-xs leading-5 text-muted-foreground">Click a node to inspect its columns, relationships, and schema actions.</p></div>}
    </aside>
    <TableSchemaEditorDialog tableName={schemaEditorTable} open={Boolean(schemaEditorTable)} onOpenChange={(nextOpen) => { if (!nextOpen) setSchemaEditorTable(null); }} />
  </div>;
}

export function SchemaDiagram() {
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const databases = useDatabaseStore((state) => state.databases);
  const tables = useDatabaseStore((state) => state.tables);
  const schemas = useDatabaseStore((state) => state.tableSchemas);
  const [layout, setLayout] = React.useState<{ databaseId: string; fingerprint: string; positions: DiagramPositions } | null>(null);
  const tableList = React.useMemo(() => tables.filter((table) => table.type === "table"), [tables]);
  const relationships = React.useMemo(() => detectSchemaRelationships(tableList, schemas), [schemas, tableList]);
  const fingerprint = React.useMemo(() => tableList.map((table) => `${table.name}:${schemas[table.name]?.createSql ?? ""}`).join("|"), [schemas, tableList]);

  React.useEffect(() => {
    if (!activeDatabaseId) return;
    let cancelled = false;
    void getDatabaseManager().getDiagramPositions(activeDatabaseId).then((saved) => {
      if (!cancelled) setLayout({ databaseId: activeDatabaseId, fingerprint, positions: mergeDiagramPositions(tableList, relationships, saved) });
    }).catch((error) => {
      if (!cancelled) {
        setLayout({ databaseId: activeDatabaseId, fingerprint, positions: automaticDiagramPositions(tableList, relationships) });
        toast.error("Could not restore diagram layout", { description: error instanceof Error ? error.message : "A fresh layout was created." });
      }
    });
    return () => { cancelled = true; };
  }, [activeDatabaseId, fingerprint, relationships, tableList]);

  if (!activeDatabaseId) return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><Network className="mx-auto size-8 text-muted-foreground" /><p className="mt-4 font-semibold">No database selected</p><p className="mt-1 text-sm text-muted-foreground">Create or import a database to visualize its schema.</p></div></div>;
  if (!tableList.length) return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><Network className="mx-auto size-8 text-muted-foreground" /><p className="mt-4 font-semibold">No tables to diagram</p><p className="mt-1 text-sm text-muted-foreground">Create a table, then return here to see its schema node.</p></div></div>;
  if (!layout || layout.databaseId !== activeDatabaseId || layout.fingerprint !== fingerprint) return <div className="grid min-h-[520px] place-items-center text-sm text-muted-foreground"><div className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Restoring schema layout…</div></div>;
  const databaseName = databases.find((database) => database.id === activeDatabaseId)?.name ?? "Database";

  return <SchemaDiagramCanvas
    key={`${activeDatabaseId}:${fingerprint}`}
    databaseId={activeDatabaseId}
    databaseName={databaseName}
    tables={tableList}
    schemas={schemas}
    initialPositions={layout.positions}
    relationships={relationships}
    onPositionsChange={(positions) => setLayout({ databaseId: activeDatabaseId, fingerprint, positions })}
  />;
}
