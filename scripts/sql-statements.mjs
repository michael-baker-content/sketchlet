// Migration files may contain PL/pgSQL bodies with their own semicolons.
export function sqlStatements(source) {
  const statements = [];
  let start = 0, quote = null, dollar = null, block = 0, line = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) {
      if (c === '/' && next === '*') { block++; i++; }
      else if (c === '*' && next === '/') { block--; i++; }
      continue;
    }
    if (dollar) {
      if (source.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; }
      continue;
    }
    if (quote) {
      if (c === quote) { if (next === quote) i++; else quote = null; }
      continue;
    }
    if (c === '-' && next === '-') { line = true; i++; }
    else if (c === '/' && next === '*') { block = 1; i++; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '$') {
      const match = /^(?:\$[a-zA-Z_][a-zA-Z_0-9]*\$|\$\$)/.exec(source.slice(i));
      if (match) { dollar = match[0]; i += dollar.length - 1; }
    } else if (c === ';') {
      const statement = source.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  if (quote || dollar || block) throw new Error('Unterminated SQL migration');
  const last = source.slice(start).trim();
  if (last && !/^(?:--[^\n]*(?:\n|$)\s*)+$/.test(last)) statements.push(last);
  return statements;
}
