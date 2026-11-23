import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLAUSES, CLAUSE_CATEGORIES, CLAUSE_LEGAL_CONTEXT, findClauses, getClause } from '../src/clauses.ts';

describe('Clause Library', () => {
  it('has at least 30 fully populated entries across the five categories', () => {
    assert.ok(CLAUSES.length >= 30);
    assert.equal(Object.keys(CLAUSE_CATEGORIES).length, 5);
    assert.deepEqual(new Set(CLAUSES.map(({ category }) => category)), new Set(Object.keys(CLAUSE_CATEGORIES)));
    for (const clause of CLAUSES) {
      assert.match(clause.id, /^[a-z]+(?:-[a-z]+)*$/);
      for (const text of [clause.name, clause.meaning, clause.example, clause.importance, clause.checks]) {
        assert.ok(text.trim(), clause.id);
      }
      assert.ok(clause.keywords.length > 0 && clause.keywords.every((keyword) => keyword.trim()), clause.id);
      assert.ok(clause.questions.length >= 2 && clause.questions.length <= 3, clause.id);
      assert.ok(clause.questions.every((question) => question.endsWith('?')), clause.id);
    }
    assert.match(CLAUSE_LEGAL_CONTEXT, /full agreement and applicable law/);
  });

  it('uses unique IDs and names, and resolves every related entry', () => {
    assert.equal(new Set(CLAUSES.map(({ id }) => id)).size, CLAUSES.length);
    assert.equal(new Set(CLAUSES.map(({ name }) => name.toLowerCase())).size, CLAUSES.length);
    for (const clause of CLAUSES) {
      assert.equal(getClause(clause.id), clause);
      assert.ok(clause.related.length > 0, clause.id);
      assert.equal(new Set(clause.related).size, clause.related.length, clause.id);
      for (const id of clause.related) {
        assert.notEqual(id, clause.id);
        assert.ok(getClause(id), `${clause.id} links to unknown entry ${id}`);
      }
    }
    assert.equal(getClause('missing-clause'), undefined);
  });

  it('searches by title or keywords, ignoring case and punctuation', () => {
    assert.deepEqual(findClauses(' NON–COMPETE ').map(({ id }) => id), ['non-compete']);
    assert.deepEqual(findClauses('CAP liability').map(({ id }) => id), ['limitation-of-liability']);
    assert.deepEqual(findClauses('NDA').map(({ id }) => id), ['confidentiality']);
    assert.deepEqual(findClauses('upti').map(({ id }) => id), ['service-level-agreement']);
    assert.deepEqual(findClauses('unknown keyword'), []);
  });

  it('combines keywords with category filters and restores the full list when cleared', () => {
    assert.equal(findClauses('automatic renewal').length, 2);
    assert.deepEqual(findClauses('automatic renewal', 'rental').map(({ id }) => id), ['lease-renewal']);
    assert.deepEqual(findClauses('automatic renewal', 'services').map(({ id }) => id), ['automatic-renewal']);
    assert.deepEqual(findClauses('automatic renewal', 'employment'), []);
    for (const category of Object.keys(CLAUSE_CATEGORIES) as (keyof typeof CLAUSE_CATEGORIES)[]) {
      assert.deepEqual(findClauses('', category), CLAUSES.filter((clause) => clause.category === category));
    }
    assert.deepEqual(findClauses('', 'all'), CLAUSES);
  });
});
