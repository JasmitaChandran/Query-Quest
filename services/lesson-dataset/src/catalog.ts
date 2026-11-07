import type { Difficulty } from "../../shared/src/contracts.js";

export type DatasetDefinition = {
  id: string;
  version: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  dialect: "sqlite";
  tables: Array<{ name: string; columns: Array<{ name: string; type: string; constraints: string[] }>; foreignKeys: Array<{ columns: string[]; referencedTable: string; referencedColumns: string[] }> }>;
  schemaSql: string;
  seedSql: string;
  recordCounts: Record<string, number>;
};

export type Lesson = {
  id: string;
  version: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  datasetId: string;
  objectives: string[];
  operations: string[];
  exampleIds: string[];
};

export type SqlExample = {
  id: string;
  version: string;
  title: string;
  difficulty: Difficulty;
  datasetId: string;
  operation: string;
  sql: string;
  explanation: string;
};

export const datasets: DatasetDefinition[] = [
  {
    id: "college",
    version: "1.0.0",
    name: "QueryQuest College",
    description: "A fictional college schema for learning selection, joins, grouping, and relationships.",
    difficulty: "beginner",
    dialect: "sqlite",
    tables: [
      { name: "Departments", columns: [{ name: "id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "name", type: "TEXT", constraints: ["NOT NULL", "UNIQUE"] }], foreignKeys: [] },
      { name: "Students", columns: [{ name: "id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "name", type: "TEXT", constraints: ["NOT NULL"] }, { name: "age", type: "INTEGER", constraints: [] }, { name: "department_id", type: "INTEGER", constraints: ["NOT NULL"] }], foreignKeys: [{ columns: ["department_id"], referencedTable: "Departments", referencedColumns: ["id"] }] },
      { name: "Courses", columns: [{ name: "id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "code", type: "TEXT", constraints: ["NOT NULL", "UNIQUE"] }, { name: "title", type: "TEXT", constraints: ["NOT NULL"] }, { name: "department_id", type: "INTEGER", constraints: ["NOT NULL"] }], foreignKeys: [{ columns: ["department_id"], referencedTable: "Departments", referencedColumns: ["id"] }] },
      { name: "Enrollments", columns: [{ name: "student_id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "course_id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "grade", type: "TEXT", constraints: [] }], foreignKeys: [{ columns: ["student_id"], referencedTable: "Students", referencedColumns: ["id"] }, { columns: ["course_id"], referencedTable: "Courses", referencedColumns: ["id"] }] },
    ],
    schemaSql: `CREATE TABLE Departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE Students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER, department_id INTEGER NOT NULL REFERENCES Departments(id));
CREATE TABLE Courses (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, department_id INTEGER NOT NULL REFERENCES Departments(id));
CREATE TABLE Enrollments (student_id INTEGER, course_id INTEGER, grade TEXT, PRIMARY KEY (student_id, course_id), FOREIGN KEY (student_id) REFERENCES Students(id), FOREIGN KEY (course_id) REFERENCES Courses(id));`,
    seedSql: `INSERT INTO Departments VALUES (1, 'Computer Science'), (2, 'Mathematics');
INSERT INTO Students VALUES (1, 'Anika Bose', 20, 1), (2, 'Mateo Silva', 22, 1), (3, 'Nora Chen', 21, 2);
INSERT INTO Courses VALUES (101, 'CS201', 'Data Structures', 1), (102, 'MATH210', 'Discrete Mathematics', 2);
INSERT INTO Enrollments VALUES (1, 101, 'A'), (2, 101, 'B+'), (3, 102, 'A-');`,
    recordCounts: { Departments: 2, Students: 3, Courses: 2, Enrollments: 3 },
  },
  {
    id: "bookstore",
    version: "1.0.0",
    name: "Northstar Bookstore",
    description: "A compact retail schema for aggregate and multi-table practice.",
    difficulty: "intermediate",
    dialect: "sqlite",
    tables: [
      { name: "Authors", columns: [{ name: "id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "name", type: "TEXT", constraints: ["NOT NULL"] }], foreignKeys: [] },
      { name: "Books", columns: [{ name: "id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "title", type: "TEXT", constraints: ["NOT NULL"] }, { name: "price", type: "NUMERIC", constraints: ["NOT NULL"] }, { name: "author_id", type: "INTEGER", constraints: ["NOT NULL"] }], foreignKeys: [{ columns: ["author_id"], referencedTable: "Authors", referencedColumns: ["id"] }] },
      { name: "Sales", columns: [{ name: "id", type: "INTEGER", constraints: ["PRIMARY KEY"] }, { name: "book_id", type: "INTEGER", constraints: ["NOT NULL"] }, { name: "quantity", type: "INTEGER", constraints: ["NOT NULL"] }], foreignKeys: [{ columns: ["book_id"], referencedTable: "Books", referencedColumns: ["id"] }] },
    ],
    schemaSql: `CREATE TABLE Authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE Books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, price NUMERIC NOT NULL, author_id INTEGER NOT NULL REFERENCES Authors(id));
CREATE TABLE Sales (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES Books(id), quantity INTEGER NOT NULL CHECK (quantity > 0));`,
    seedSql: `INSERT INTO Authors VALUES (1, 'Mira Sen'), (2, 'Jon Bell');
INSERT INTO Books VALUES (1, 'The Quiet Compiler', 18.50, 1), (2, 'Graphs at Dawn', 24.00, 2);
INSERT INTO Sales VALUES (1, 1, 2), (2, 2, 1), (3, 1, 3);`,
    recordCounts: { Authors: 2, Books: 2, Sales: 3 },
  },
];

export const examples: SqlExample[] = [
  { id: "students-over-20", version: "1.0.0", title: "Filter students by age", difficulty: "beginner", datasetId: "college", operation: "WHERE", sql: "SELECT name, age FROM Students WHERE age > 20 ORDER BY age DESC;", explanation: "WHERE removes rows that do not satisfy the age comparison before ORDER BY sorts the result." },
  { id: "students-by-department", version: "1.0.0", title: "Join students to departments", difficulty: "intermediate", datasetId: "college", operation: "JOIN", sql: "SELECT s.name, d.name AS department FROM Students AS s INNER JOIN Departments AS d ON d.id = s.department_id ORDER BY d.name, s.name;", explanation: "The foreign-key values connect each student row with its matching department row." },
  { id: "enrollment-counts", version: "1.0.0", title: "Count enrollments per course", difficulty: "intermediate", datasetId: "college", operation: "GROUP BY", sql: "SELECT c.code, COUNT(*) AS enrollment_count FROM Courses AS c LEFT JOIN Enrollments AS e ON e.course_id = c.id GROUP BY c.id, c.code ORDER BY enrollment_count DESC;", explanation: "LEFT JOIN keeps courses without enrollments and GROUP BY creates one aggregate group per course." },
  { id: "book-revenue", version: "1.0.0", title: "Calculate revenue by book", difficulty: "advanced", datasetId: "bookstore", operation: "AGGREGATE", sql: "SELECT b.title, SUM(b.price * s.quantity) AS revenue FROM Books AS b JOIN Sales AS s ON s.book_id = b.id GROUP BY b.id, b.title ORDER BY revenue DESC;", explanation: "SUM combines each book price with all quantities sold inside its group." },
];

export const lessons: Lesson[] = [
  { id: "filter-and-sort", version: "1.0.0", title: "Filtering and sorting rows", summary: "Use WHERE and ORDER BY to shape a result without changing stored data.", difficulty: "beginner", datasetId: "college", objectives: ["Distinguish source rows from result rows", "Apply comparison predicates", "Control result order"], operations: ["SELECT", "WHERE", "ORDER BY"], exampleIds: ["students-over-20"] },
  { id: "relational-joins", version: "1.0.0", title: "Following table relationships", summary: "Connect rows using primary- and foreign-key values.", difficulty: "intermediate", datasetId: "college", objectives: ["Read a foreign-key relationship", "Compare INNER and LEFT joins", "Use table aliases"], operations: ["INNER JOIN", "LEFT JOIN"], exampleIds: ["students-by-department", "enrollment-counts"] },
  { id: "grouped-analytics", version: "1.0.0", title: "Grouped analytics", summary: "Build aggregate results with grouping and arithmetic expressions.", difficulty: "advanced", datasetId: "bookstore", objectives: ["Form stable groups", "Calculate aggregate values", "Order derived results"], operations: ["GROUP BY", "SUM", "COUNT", "ORDER BY"], exampleIds: ["book-revenue"] },
];
