import { resolve } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { canImportMySqlDump, parseMySqlDump } from "@/lib/import/mysql-dump";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let database: Database;

const COLLEGE_MYSQL_DUMP = `
-- MySQL dump 10.13  Distrib 8.0.42
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
SET NAMES utf8mb4;
DROP TABLE IF EXISTS \`Departments\`;
CREATE TABLE \`Departments\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`name\` varchar(80) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_department_name\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE \`Students\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`name\` varchar(120) NOT NULL,
  \`age\` tinyint unsigned DEFAULT NULL,
  \`department_id\` int DEFAULT NULL,
  \`gpa\` decimal(3,2) DEFAULT 0.00,
  PRIMARY KEY (\`id\`),
  KEY \`idx_students_department\` (\`department_id\`),
  CONSTRAINT \`fk_students_department\` FOREIGN KEY (\`department_id\`) REFERENCES \`Departments\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOCK TABLES \`Departments\` WRITE;
INSERT INTO \`Departments\` VALUES (1,'Computer Science'),(2,'Mathematics');
UNLOCK TABLES;
INSERT INTO \`Students\` (\`id\`,\`name\`,\`age\`,\`department_id\`,\`gpa\`) VALUES
  (1,'Ada Lovelace',22,1,3.95),
  (2,'Emmy Noether',24,2,4.00),
  (3,'Grace Hopper',NULL,1,3.80);
`;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm") });
});

beforeEach(() => { database = new SQL.Database(); });
afterEach(() => database.close());

describe("MySQL dump conversion", () => {
  it("uses the MySQL AST to convert tables, keys, indexes, and literal inserts into valid SQLite", () => {
    const converted = parseMySqlDump(COLLEGE_MYSQL_DUMP);
    expect(canImportMySqlDump(converted)).toBe(true);
    expect(converted.tables.map((table) => table.name)).toEqual(["Departments", "Students"]);
    expect(converted.tables[1]).toEqual(expect.objectContaining({ rowCount: 3 }));
    expect(converted.tables[1].columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "id", mysqlType: "BIGINT", sqliteType: "INTEGER", primaryKey: true, autoIncrement: true }),
      expect.objectContaining({ name: "gpa", mysqlType: "DECIMAL(3,2)", sqliteType: "NUMERIC" }),
    ]));
    expect(converted.issues.some((issue) => issue.code === "text-length")).toBe(true);
    expect(converted.issues.some((issue) => issue.severity === "error")).toBe(false);

    database.run("PRAGMA foreign_keys = OFF");
    converted.tables.forEach((table) => database.run(table.createSql));
    converted.insertBatches.forEach((batch) => {
      const sql = `INSERT INTO "${batch.tableName}" (${batch.columns.map((column) => `"${column}"`).join(",")}) VALUES (${batch.columns.map(() => "?").join(",")})`;
      batch.rows.forEach((row) => database.run(sql, row));
    });
    converted.indexSql.forEach((sql) => database.run(sql));
    expect(database.exec("PRAGMA foreign_key_check")).toEqual([]);
    database.run("PRAGMA foreign_keys = ON");

    expect(database.exec("SELECT name, age FROM Students WHERE age > 20 ORDER BY age DESC")[0].values).toEqual([
      ["Emmy Noether", 24],
      ["Ada Lovelace", 22],
    ]);
    expect(database.exec("PRAGMA foreign_key_list(Students)")[0].values).toHaveLength(1);
    expect(database.exec("PRAGMA index_list(Students)")[0].values.some((row) => row[1] === "idx_students_department")).toBe(true);
    expect(database.exec("SELECT seq FROM sqlite_sequence WHERE name = 'Students'")[0].values[0][0]).toBe(3);
  });

  it("incorporates supported ALTER TABLE foreign keys and indexes before generating SQLite", () => {
    const converted = parseMySqlDump(`
      -- MySQL dump
      CREATE TABLE parent (id INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE child (id INT NOT NULL, parent_id INT, PRIMARY KEY (id));
      ALTER TABLE child ADD CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE;
      ALTER TABLE child ADD KEY idx_parent (parent_id);
      INSERT INTO parent VALUES (1);
      INSERT INTO child VALUES (5,1);
    `);
    expect(canImportMySqlDump(converted)).toBe(true);
    const child = converted.tables.find((table) => table.name === "child")!;
    expect(child.createSql).toContain("FOREIGN KEY");
    expect(converted.indexSql).toEqual([expect.stringContaining("idx_parent")]);
  });

  it("accepts a single MySQL Workbench schema qualifier and rejects cross-schema dumps", () => {
    const workbench = parseMySqlDump(`
      -- MySQL Workbench Forward Engineering
      CREATE SCHEMA IF NOT EXISTS \`school\`;
      USE \`school\`;
      CREATE TABLE \`school\`.\`departments\` (\`id\` INT PRIMARY KEY) ENGINE=InnoDB;
      CREATE TABLE \`school\`.\`students\` (\`id\` INT PRIMARY KEY, \`department_id\` INT, FOREIGN KEY (\`department_id\`) REFERENCES \`school\`.\`departments\` (\`id\`)) ENGINE=InnoDB;
    `);
    expect(canImportMySqlDump(workbench)).toBe(true);
    expect(workbench.issues).toContainEqual(expect.objectContaining({ code: "mysql-schema:school", severity: "info" }));

    const crossSchema = parseMySqlDump(`
      -- MySQL dump
      CREATE TABLE \`one\`.\`a\` (id INT PRIMARY KEY) ENGINE=InnoDB;
      CREATE TABLE \`two\`.\`b\` (id INT PRIMARY KEY) ENGINE=InnoDB;
    `);
    expect(canImportMySqlDump(crossSchema)).toBe(false);
    expect(crossSchema.issues).toContainEqual(expect.objectContaining({ code: "cross-database", severity: "error" }));
  });

  it("reports unsupported constructs instead of executing or silently discarding them", () => {
    const converted = parseMySqlDump(`
      -- MySQL dump
      CREATE TABLE posts (id INT PRIMARY KEY, body TEXT, FULLTEXT KEY ft_body (body));
      CREATE VIEW post_titles AS SELECT id FROM posts;
      INSERT IGNORE INTO posts VALUES (1, 'hello');
    `);
    expect(canImportMySqlDump(converted)).toBe(false);
    expect(converted.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "special-index", severity: "error" }),
      expect.objectContaining({ code: "unsupported-object", severity: "warning" }),
      expect.objectContaining({ code: "insert-modifier", severity: "error" }),
    ]));
  });

  it("rejects routine delimiter blocks and non-MySQL SQL files clearly", () => {
    const routine = parseMySqlDump("-- MySQL dump\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; END$$\nDELIMITER ;");
    expect(canImportMySqlDump(routine)).toBe(false);
    expect(routine.issues[0]).toEqual(expect.objectContaining({ code: "delimiter", severity: "error" }));
    expect(() => parseMySqlDump("CREATE TABLE plain_sqlite (id INTEGER);")).toThrow(/not recognized as a MySQL dump/i);
  });
});
