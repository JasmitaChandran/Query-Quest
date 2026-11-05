export const DEFAULT_SQL_QUERY = `SELECT
  first_name,
  last_name,
  year_level
FROM Students
WHERE year_level > 2
ORDER BY year_level DESC, last_name ASC
LIMIT 5;`;
