export const COLLEGE_DATABASE_ID = "sample-college";

export const COLLEGE_SAMPLE_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE Departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  building TEXT NOT NULL,
  annual_budget INTEGER NOT NULL CHECK (annual_budget > 0)
);

CREATE TABLE Students (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  year_level INTEGER NOT NULL CHECK (year_level BETWEEN 1 AND 4),
  department_id INTEGER NOT NULL,
  FOREIGN KEY (department_id) REFERENCES Departments(id)
);

CREATE TABLE Courses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits BETWEEN 1 AND 6),
  department_id INTEGER NOT NULL,
  FOREIGN KEY (department_id) REFERENCES Departments(id)
);

CREATE TABLE Enrollments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  semester TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  grade TEXT,
  FOREIGN KEY (student_id) REFERENCES Students(id),
  FOREIGN KEY (course_id) REFERENCES Courses(id),
  UNIQUE (student_id, course_id, semester, academic_year)
);

INSERT INTO Departments (id, name, building, annual_budget) VALUES
  (1, 'Computer Science', 'Ada Hall', 1850000),
  (2, 'Mathematics', 'Ramanujan Centre', 1320000),
  (3, 'Environmental Studies', 'Riverstone Lab', 1180000),
  (4, 'Literature', 'Tagore House', 980000);

INSERT INTO Students (id, first_name, last_name, email, year_level, department_id) VALUES
  (1001, 'Anika', 'Rao', 'anika.rao@northstar.edu', 2, 1),
  (1002, 'Kabir', 'Mehta', 'kabir.mehta@northstar.edu', 3, 2),
  (1003, 'Mira', 'Sen', 'mira.sen@northstar.edu', 1, 4),
  (1004, 'Dev', 'Kapoor', 'dev.kapoor@northstar.edu', 4, 1),
  (1005, 'Leena', 'Joseph', 'leena.joseph@northstar.edu', 2, 3),
  (1006, 'Arjun', 'Bose', 'arjun.bose@northstar.edu', 3, 1),
  (1007, 'Tara', 'Iyer', 'tara.iyer@northstar.edu', 4, 3),
  (1008, 'Rohan', 'Das', 'rohan.das@northstar.edu', 1, 2);

INSERT INTO Courses (id, code, title, credits, department_id) VALUES
  (201, 'CS201', 'Data Structures', 4, 1),
  (202, 'CS305', 'Database Systems', 4, 1),
  (203, 'CS412', 'Distributed Computing', 3, 1),
  (204, 'MATH210', 'Discrete Mathematics', 3, 2),
  (205, 'MATH330', 'Applied Statistics', 4, 2),
  (206, 'ENV220', 'Urban Ecology', 3, 3),
  (207, 'ENV315', 'Climate Data Analysis', 4, 3),
  (208, 'LIT240', 'Modern World Fiction', 3, 4);

INSERT INTO Enrollments (id, student_id, course_id, semester, academic_year, grade) VALUES
  (1, 1001, 201, 'Autumn', '2026-27', 'A'),
  (2, 1001, 204, 'Autumn', '2026-27', 'A-'),
  (3, 1002, 205, 'Autumn', '2026-27', 'B+'),
  (4, 1002, 202, 'Autumn', '2026-27', 'A-'),
  (5, 1003, 208, 'Autumn', '2026-27', 'A'),
  (6, 1004, 203, 'Autumn', '2026-27', 'B+'),
  (7, 1004, 202, 'Spring', '2025-26', 'A'),
  (8, 1005, 206, 'Autumn', '2026-27', 'A-'),
  (9, 1005, 205, 'Autumn', '2026-27', 'B'),
  (10, 1006, 202, 'Autumn', '2026-27', 'A'),
  (11, 1007, 207, 'Autumn', '2026-27', 'A'),
  (12, 1008, 204, 'Autumn', '2026-27', NULL);
`;
