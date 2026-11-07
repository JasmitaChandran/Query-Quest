import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(128);
const SqlTypeSchema = z.string().trim().min(1).max(128);

export const SchemaColumnSchema = z.strictObject({
  name: IdentifierSchema,
  type: SqlTypeSchema,
  notNull: z.boolean().default(false),
  primaryKey: z.boolean().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

export const SchemaForeignKeySchema = z.strictObject({
  name: IdentifierSchema.optional(),
  columns: z.array(IdentifierSchema).min(1).max(16),
  referencedTable: IdentifierSchema,
  referencedColumns: z.array(IdentifierSchema).min(1).max(16),
  onDelete: z.enum(["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"]).default("NO ACTION"),
  onUpdate: z.enum(["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"]).default("NO ACTION"),
});

export const SchemaIndexSchema = z.strictObject({
  name: IdentifierSchema,
  columns: z.array(IdentifierSchema).min(1).max(32),
  unique: z.boolean().default(false),
});

export const SchemaTableSchema = z.strictObject({
  name: IdentifierSchema,
  type: z.enum(["table", "view"]).default("table"),
  columns: z.array(SchemaColumnSchema).min(1).max(512),
  foreignKeys: z.array(SchemaForeignKeySchema).max(256).default([]),
  indexes: z.array(SchemaIndexSchema).max(256).default([]),
});

export const SchemaAnalysisRequestSchema = z.strictObject({
  databaseName: z.string().trim().min(1).max(128).optional(),
  dialect: z.enum(["sqlite", "mysql"]).default("sqlite"),
  tables: z.array(SchemaTableSchema).min(1).max(256),
});

export const VisualizationSchemaTableSchema = z.strictObject({
  name: IdentifierSchema,
  columns: z.array(IdentifierSchema).max(512).default([]),
});

export const QueryVisualizationRequestSchema = z.strictObject({
  sql: z.string().trim().min(1).max(20_000),
  dialect: z.enum(["sqlite", "mysql"]).default("sqlite"),
  schema: z.array(VisualizationSchemaTableSchema).max(256).optional(),
});

export const DifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
export const DatasetListQuerySchema = z.strictObject({
  difficulty: DifficultySchema.optional(),
  version: z.string().trim().min(1).max(32).optional(),
});
export const LessonListQuerySchema = z.strictObject({
  difficulty: DifficultySchema.optional(),
  datasetId: z.string().trim().min(1).max(128).optional(),
});
export const ExampleListQuerySchema = z.strictObject({
  difficulty: DifficultySchema.optional(),
  operation: z.string().trim().min(1).max(64).optional(),
});

export type SchemaAnalysisRequest = z.infer<typeof SchemaAnalysisRequestSchema>;
export type SchemaTable = z.infer<typeof SchemaTableSchema>;
export type QueryVisualizationRequest = z.infer<typeof QueryVisualizationRequestSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;

export type ApiIssue = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
};

export type VisualizationStep = {
  id: string;
  operation: string;
  title: string;
  explanation: string;
  metadata: Record<string, unknown>;
};
