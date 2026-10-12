import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlStatements } from '../scripts/sql-statements.mjs';

test('migration splitting preserves function bodies, quoted delimiters and nested comments', () => {
  const result = sqlStatements(`-- a ; comment
    SELECT 'it''s ; text', "a;b";
    /* outer ; /* inner ; */ end */ SELECT 2;
    CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $body$
    BEGIN PERFORM ';'; RETURN; END; $body$;
    -- trailing comment`);
  assert.equal(result.length,3);
  assert.match(result[2],/BEGIN PERFORM ';'; RETURN; END;/);
  for (const source of ["SELECT 'oops",'SELECT $$oops','/* oops']) assert.throws(() => sqlStatements(source));
});
