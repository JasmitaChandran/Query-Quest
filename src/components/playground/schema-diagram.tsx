"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  getNodesBounds,
  getViewportForBounds,
  useNodesState,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { useTheme } from "next-themes";
import {
  AlertCircle,
  ChevronDown,
  Download,
  Eye,
  FileCode2,
  GitFork,
  ImageDown,
  KeyRound,
  Link2,
  LoaderCircle,
  Network,
  PanelRightClose,
  PanelRightOpen,
  RefreshCcw,
  Scan,
  Table2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { TableSchemaEditorDialog } from "@/components/playground/table-schema-editor-dialog";
import { Button } from "@/components/ui/button";
import { getDatabaseManager } from "@/lib/database/database-manager";
import {
  automaticDiagramPositions,
  detectSchemaRelationships,
  mergeDiagramPositions,
  relatedSchemaTables,
  SCHEMA_NODE_WIDTH,
  type SchemaRelationship,
} from "@/lib/database/schema-diagram";
import type { DiagramPositions, TableSchema, TableSummary } from "@/lib/database/types";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type Emphasis = "neutral" | "active" | "related";
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
    "overflow-hidden rounded-xl border bg-diagram-node text-diagram-text shadow-[var(--diagram-shadow)] transition-[border-color,box-shadow] duration-200",
    data.emphasis === "active" && "border-primary ring-2 ring-primary/25",
    data.emphasis === "related" && "border-info ring-1 ring-info/25",
  )} style={{ width: SCHEMA_NODE_WIDTH }}>
    <Handle type="target" position={Position.Left} isConnectable={false} className="!size-2.5 !border-2 !border-diagram-node !bg-info" />
    <Handle type="source" position={Position.Right} isConnectable={false} className="!size-2.5 !border-2 !border-diagram-node !bg-primary" />
    <div className={cn("flex items-center gap-2 border-b border-border bg-diagram-node-header px-3.5 py-3", data.emphasis === "active" && "bg-selected", data.emphasis === "related" && "bg-info-tint")}>
      <div className="grid size-7 place-items-center rounded-lg border border-primary/20 bg-selected text-selected-foreground"><Table2 className="size-3.5" /></div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold tracking-tight">{data.table.name}</p><p className="mt-0.5 text-xs text-diagram-muted">{data.table.rowCount} {data.table.rowCount === 1 ? "row" : "rows"} · {data.schema.columns.length} columns</p></div>
      <button type="button" className="nodrag rounded-lg border border-border bg-surface p-1.5 text-diagram-muted transition hover:border-primary/40 hover:bg-selected hover:text-selected-foreground" onClick={(event) => { event.stopPropagation(); data.onEdit(data.table.name); }} aria-label={`Edit schema for ${data.table.name}`} title="Edit schema"><FileCode2 className="size-3.5" /></button>
    </div>
    <div className="max-h-[252px] overflow-y-auto py-1.5 workspace-scrollbar">{data.schema.columns.map((column) => {
      const foreign = foreignColumns.has(column.name.toLowerCase());
      return <div key={column.name} className={cn("flex min-h-8 items-center gap-2 px-3.5 py-1 text-[13px]", foreign && "bg-info-tint")}>
        <span className="flex w-8 shrink-0 items-center gap-1">{column.primaryKey ? <KeyRound className="size-3 text-warning" aria-label="Primary key" /> : null}{foreign ? <GitFork className="size-3 text-info" aria-label="Foreign key" /> : null}{!column.primaryKey && !foreign ? <span className="ml-1 size-1 rounded-full bg-diagram-muted" /> : null}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-diagram-text">{column.name}</span><span className="max-w-20 truncate font-mono text-[11px] font-medium text-diagram-muted">{column.type || "TEXT"}</span>
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
    label: relationship.cardinality === "one-to-many" ? "1 : N" : "1 : 1",
    labelStyle: { fill: "var(--diagram-text)", fontSize: 12, fontWeight: 700 },
    labelBgStyle: { fill: "var(--diagram-node)", fillOpacity: 0.96 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--diagram-edge)" },
    style: { stroke: "var(--diagram-edge)", strokeWidth: 2 },
    interactionWidth: 24,
    data: { relationshipId: relationship.id },
  }));
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

function RelationshipList({ tableName, relationships, direction }: { tableName: string; relationships: SchemaRelationship[]; direction: "references" | "referenced-by" }) {
  const relevant = relationships.filter((relationship) => direction === "references" ? relationship.childTable === tableName : relationship.parentTable === tableName);
  if (!relevant.length) return <p className="rounded-xl border border-dashed p-3 text-xs leading-4 text-muted-foreground">No tables {direction === "references" ? "are referenced by" : "reference"} this table.</p>;
  return <div className="space-y-2">{relevant.map((relationship) => {
    const outgoing = relationship.childTable === tableName;
    const otherTable = outgoing ? relationship.parentTable : relationship.childTable;
    return <div key={relationship.id} className="rounded-xl border bg-surface p-3"><div className="flex items-center gap-2"><Link2 className="size-3.5 text-info" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{outgoing ? "References" : "Referenced by"} {otherTable}</span><span className="rounded-full bg-selected px-2 py-0.5 text-xs font-bold text-selected-foreground">{relationship.cardinality === "one-to-many" ? "1:N" : "1:1"}</span></div><p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">{outgoing ? relationship.childColumns.join(", ") : relationship.parentColumns.join(", ")} → {outgoing ? relationship.parentColumns.join(", ") : relationship.childColumns.join(", ")}</p></div>;
  })}</div>;
}

function RelationshipDetails({ relationship }: { relationship: SchemaRelationship }) {
  return <section className="rounded-xl border border-info/30 bg-info-tint p-3.5" aria-label="Selected relationship details">
    <div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-info/15 text-info"><Link2 className="size-4" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.12em] text-info">Selected relationship</p><p className="truncate text-sm font-semibold">{relationship.parentTable} <span aria-hidden>→</span> {relationship.childTable}</p></div></div>
    <dl className="mt-3 grid gap-2 text-xs">
      <div><dt className="font-semibold text-muted-foreground">Foreign key</dt><dd className="mt-0.5 break-words font-mono">{relationship.childTable}.{relationship.childColumns.join(", ")}</dd></div>
      <div><dt className="font-semibold text-muted-foreground">References</dt><dd className="mt-0.5 break-words font-mono">{relationship.parentTable}.{relationship.parentColumns.join(", ")}</dd></div>
      <div className="grid grid-cols-2 gap-2"><div><dt className="font-semibold text-muted-foreground">Relationship</dt><dd className="mt-0.5">{relationship.cardinality === "one-to-many" ? "One-to-many" : "One-to-one"}</dd></div><div><dt className="font-semibold text-muted-foreground">Actions</dt><dd className="mt-0.5 font-mono">DELETE {relationship.onDelete}<br />UPDATE {relationship.onUpdate}</dd></div></div>
    </dl>
  </section>;
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
  const { resolvedTheme } = useTheme();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const flowRef = React.useRef<ReactFlowInstance<SchemaTableNode, Edge> | null>(null);
  const initialFitDone = React.useRef(false);
  const selectedTableFromStore = useDatabaseStore((state) => state.selectedTable);
  const selectTable = useDatabaseStore((state) => state.selectTable);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const [schemaEditorTable, setSchemaEditorTable] = React.useState<string | null>(null);
  const [selectedTable, setSelectedTable] = React.useState<string | null>(tables.some((table) => table.name === selectedTableFromStore) ? selectedTableFromStore : null);
  const [selectedRelationshipId, setSelectedRelationshipId] = React.useState<string | null>(null);
  const [hoveredTable, setHoveredTable] = React.useState<string | null>(null);
  const [isExporting, setIsExporting] = React.useState<"png" | "svg" | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(true);
  const [detailsWidth, setDetailsWidth] = React.useState(304);
  const onEdit = React.useCallback((tableName: string) => setSchemaEditorTable(tableName), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaTableNode>(buildNodes(tables, schemas, initialPositions, onEdit));
  const baseEdges = React.useMemo(() => buildEdges(relationships), [relationships]);
  const selectedRelationship = React.useMemo(() => relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null, [relationships, selectedRelationshipId]);
  const focusTable = hoveredTable ?? selectedTable;
  const relatedTables = React.useMemo(() => focusTable ? relatedSchemaTables(relationships, focusTable) : new Set<string>(), [focusTable, relationships]);
  const relationshipTables = React.useMemo(() => selectedRelationship ? new Set([selectedRelationship.parentTable, selectedRelationship.childTable]) : new Set<string>(), [selectedRelationship]);
  const displayedNodes = React.useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      emphasis: selectedRelationship
        ? relationshipTables.has(node.id) ? "related" : "neutral"
        : !focusTable ? "neutral" : node.id === focusTable ? "active" : relatedTables.has(node.id) ? "related" : "neutral",
    },
  } satisfies SchemaTableNode)), [focusTable, nodes, relatedTables, relationshipTables, selectedRelationship]);
  const displayedEdges = React.useMemo(() => baseEdges.map((edge) => {
    const relationshipSelected = selectedRelationshipId === edge.id;
    const tableRelated = Boolean(focusTable && (edge.source === focusTable || edge.target === focusTable));
    const active = relationshipSelected || tableRelated;
    const mutedByFocus = Boolean((focusTable || selectedRelationshipId) && !active);
    const stroke = relationshipSelected ? "var(--diagram-edge-selected)" : "var(--diagram-edge)";
    return {
      ...edge,
      animated: active,
      selected: relationshipSelected,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: stroke },
      style: { ...edge.style, stroke, opacity: mutedByFocus ? 0.58 : 1, strokeWidth: active ? 3 : 2 },
    };
  }), [baseEdges, focusTable, selectedRelationshipId]);
  const selectedSchema = selectedTable ? schemas[selectedTable] : null;
  const selectedSummary = selectedTable ? tables.find((table) => table.name === selectedTable) : null;

  React.useEffect(() => {
    if (selectedTableFromStore && tables.some((table) => table.name === selectedTableFromStore)) setSelectedTable(selectedTableFromStore);
  }, [selectedTableFromStore, tables]);

  const fitDiagram = React.useCallback((duration?: number) => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void flowRef.current?.fitView({
      padding: { top: "56px", right: "56px", bottom: "56px", left: "56px" },
      minZoom: 0.42,
      maxZoom: 1.18,
      duration: reduceMotion ? 0 : duration ?? 300,
    });
  }, []);

  const handleNodesChange = React.useCallback((changes: NodeChange<SchemaTableNode>[]) => {
    onNodesChange(changes);
    if (!initialFitDone.current && changes.some((change) => change.type === "dimensions" && change.dimensions?.width && change.dimensions?.height)) {
      initialFitDone.current = true;
      window.requestAnimationFrame(() => fitDiagram(0));
    }
  }, [fitDiagram, onNodesChange]);

  const persist = React.useCallback((nextNodes: SchemaTableNode[]) => {
    const positions = Object.fromEntries(nextNodes.map((node) => [node.id, node.position]));
    onPositionsChange(positions);
    void getDatabaseManager().saveDiagramPositions(positions, databaseId).catch((error) => toast.error("Could not save diagram layout", { description: error instanceof Error ? error.message : "Try again." }));
  }, [databaseId, onPositionsChange]);

  const resetLayout = () => {
    const positions = automaticDiagramPositions(tables, relationships, schemas);
    const nextNodes = buildNodes(tables, schemas, positions, onEdit);
    setNodes(nextNodes);
    persist(nextNodes);
    window.requestAnimationFrame(() => fitDiagram(420));
    toast.success("Diagram layout reset");
  };

  const startPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = detailsWidth;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (nextEvent: PointerEvent) => setDetailsWidth(Math.min(380, Math.max(280, startWidth + startX - nextEvent.clientX)));
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  const viewTableData = async (tableName: string) => {
    await selectTable(tableName);
    setActivePanel("data");
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
      const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--diagram-canvas").trim();
      const options = {
        backgroundColor,
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

  return <div className={cn("grid min-h-[620px] flex-1 bg-diagram-canvas", detailsOpen && "lg:grid-cols-[minmax(0,1fr)_var(--schema-detail-width)]")} style={{ "--schema-detail-width": `${detailsWidth}px` } as React.CSSProperties}>
    <div className={cn("flex min-h-[620px] min-w-0 flex-col overflow-hidden border-border", detailsOpen && "border-b lg:border-b-0 lg:border-r")}>
      <header className="z-10 flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-diagram-node px-3 py-2">
        <div className="mr-auto min-w-0"><p className="flex items-center gap-2 truncate text-[13px] font-semibold text-diagram-text"><Network className="size-4 shrink-0 text-primary" />{databaseName} schema</p><p className="mt-0.5 text-xs text-diagram-muted">{nodes.length} tables · {relationships.length} declared relationships</p></div>
        <div className="flex items-center rounded-lg border border-border bg-surface p-0.5" aria-label="Diagram viewport controls">
          <Button variant="ghost" size="icon-sm" onClick={() => fitDiagram()} aria-label="Fit diagram to view" title="Fit View"><Scan /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void flowRef.current?.zoomIn({ duration: 180 })} aria-label="Zoom in" title="Zoom In"><ZoomIn /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void flowRef.current?.zoomOut({ duration: 180 })} aria-label="Zoom out" title="Zoom Out"><ZoomOut /></Button>
        </div>
        <Button className="border-border bg-surface text-foreground hover:bg-hover" variant="outline" size="sm" onClick={resetLayout} title="Recalculate table positions"><RefreshCcw />Reset Layout</Button>
        <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExportOpen(false); }}>
          <Button className="border-border bg-surface text-foreground hover:bg-hover" variant="outline" size="sm" onClick={() => setExportOpen((open) => !open)} disabled={Boolean(isExporting)} aria-haspopup="menu" aria-expanded={exportOpen}>{isExporting ? <LoaderCircle className="animate-spin" /> : <Download />}Export<ChevronDown /></Button>
          {exportOpen ? <div role="menu" aria-label="Export schema diagram" className="absolute right-0 top-10 z-30 w-44 rounded-lg border bg-popover p-1.5 shadow-xl"><button role="menuitem" type="button" onClick={() => { setExportOpen(false); void exportDiagram("png"); }} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-hover"><ImageDown className="size-3.5 text-primary" />Export PNG</button><button role="menuitem" type="button" onClick={() => { setExportOpen(false); void exportDiagram("svg"); }} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-hover"><FileCode2 className="size-3.5 text-info" />Export SVG</button></div> : null}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setDetailsOpen((open) => !open)} aria-label={detailsOpen ? "Collapse schema details" : "Open schema details"} title={detailsOpen ? "Collapse Details" : "Open Details"}>{detailsOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>
      </header>
      <div ref={containerRef} className="relative min-h-[560px] flex-1 overflow-hidden">
        <ReactFlow<SchemaTableNode, Edge>
        nodes={displayedNodes}
        edges={displayedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onInit={(instance) => { flowRef.current = instance; }}
        onNodeClick={(_, node) => { setSelectedRelationshipId(null); setSelectedTable(node.id); setDetailsOpen(true); void selectTable(node.id); }}
        onEdgeClick={(event, edge) => { event.stopPropagation(); setSelectedTable(null); setSelectedRelationshipId(edge.id); setDetailsOpen(true); }}
        onNodeMouseEnter={(_, node) => setHoveredTable(node.id)}
        onNodeMouseLeave={() => setHoveredTable(null)}
        onNodeDragStop={(_, draggedNode) => {
          const nextNodes = nodes.map((node) => node.id === draggedNode.id ? { ...node, position: draggedNode.position } : node);
          setNodes(nextNodes);
          persist(nextNodes);
        }}
        onPaneClick={() => { setSelectedTable(null); setSelectedRelationshipId(null); }}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: { top: "56px", right: "56px", bottom: "56px", left: "56px" }, minZoom: 0.42, maxZoom: 1.18 }}
        minZoom={0.25}
        maxZoom={1.8}
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        className="schema-flow"
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.15} color="var(--diagram-grid)" />
        <MiniMap className="hidden sm:block" position="bottom-right" pannable zoomable nodeColor={(node) => node.id === focusTable ? "var(--diagram-edge-selected)" : relatedTables.has(node.id) || relationshipTables.has(node.id) ? "var(--diagram-edge)" : "var(--diagram-neutral)"} maskColor="var(--diagram-minimap-mask)" />
      </ReactFlow>
      {!relationships.length ? <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 w-[min(90%,480px)] -translate-x-1/2 rounded-xl border border-info/25 bg-diagram-node/95 p-3 text-center text-xs leading-4 text-diagram-muted shadow-xl backdrop-blur"><AlertCircle className="mr-1.5 inline size-3.5 text-info" />No foreign keys are defined. Tables are shown independently; QueryQuest does not infer relationships from matching names.</div> : null}
      </div>
    </div>

    {detailsOpen ? <aside className="workspace-scrollbar relative max-h-[620px] overflow-y-auto bg-surface-elevated p-4 lg:max-h-none">
      <div role="separator" aria-orientation="vertical" aria-label="Resize schema details" title="Drag to resize details" onPointerDown={startPanelResize} className="absolute inset-y-0 left-0 z-20 hidden w-1.5 cursor-col-resize touch-none transition hover:bg-primary/25 lg:block" />
      <div className="mb-4 flex items-center gap-2"><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Schema details</p><Button className="ml-auto" variant="ghost" size="icon-sm" onClick={() => setDetailsOpen(false)} aria-label="Collapse schema details"><PanelRightClose /></Button></div>
      {selectedRelationship ? <RelationshipDetails relationship={selectedRelationship} /> : null}
      {selectedSchema && selectedTable ? <div className={cn("space-y-5", selectedRelationship && "mt-5")}>
        <section><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Overview</p><div className="mt-2 flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Table2 className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedTable}</p><p className="text-xs text-muted-foreground">{selectedSummary?.rowCount ?? 0} rows · {selectedSchema.columns.length} columns</p></div></div></section>
        <section><p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Actions</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => void viewTableData(selectedTable)}><Eye />View Data</Button><Button size="sm" onClick={() => setSchemaEditorTable(selectedTable)}><FileCode2 />Edit Schema</Button></div></section>
        <section><p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Columns</p><div className="space-y-1.5">{selectedSchema.columns.map((column) => {
          const foreign = selectedSchema.foreignKeys.some((foreignKey) => foreignKey.fromColumn === column.name);
          return <div key={column.name} className="flex items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 text-[13px]">{column.primaryKey ? <KeyRound className="size-3.5 text-warning" aria-label="Primary key" /> : foreign ? <GitFork className="size-3.5 text-info" aria-label="Foreign key" /> : <span className="size-3.5" />}<span className="min-w-0 flex-1 truncate font-medium">{column.name}</span><span className="font-mono text-xs text-muted-foreground">{column.type || "TEXT"}</span></div>;
        })}</div></section>
        <section><p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Referenced tables</p><RelationshipList tableName={selectedTable} relationships={relationships} direction="references" /></section>
        <section><p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Referencing tables</p><RelationshipList tableName={selectedTable} relationships={relationships} direction="referenced-by" /></section>
      </div> : selectedRelationship ? null : <div className="flex min-h-72 flex-col items-center justify-center text-center"><div className="grid size-12 place-items-center rounded-2xl border bg-muted/30 text-muted-foreground"><Network className="size-5" /></div><p className="mt-4 text-sm font-semibold">Select a table or relationship</p><p className="mt-1.5 max-w-56 text-xs leading-5 text-muted-foreground">Click a node or connector to inspect real SQLite schema metadata.</p></div>}
    </aside> : null}
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
      if (!cancelled) setLayout({ databaseId: activeDatabaseId, fingerprint, positions: mergeDiagramPositions(tableList, relationships, saved, schemas) });
    }).catch((error) => {
      if (!cancelled) {
        setLayout({ databaseId: activeDatabaseId, fingerprint, positions: automaticDiagramPositions(tableList, relationships, schemas) });
        toast.error("Could not restore diagram layout", { description: error instanceof Error ? error.message : "A fresh layout was created." });
      }
    });
    return () => { cancelled = true; };
  }, [activeDatabaseId, fingerprint, relationships, schemas, tableList]);

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
