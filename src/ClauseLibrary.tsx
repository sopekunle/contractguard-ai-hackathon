import { useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Briefcase, Gavel, Handshake, House, Info, Landmark,
  Search, SearchX,
} from 'lucide-react';
import {
  CLAUSE_CATEGORIES, CLAUSE_LEGAL_CONTEXT, CLAUSES, findClauses, getClause,
  type ClauseCategory, type ClauseEntry,
} from './clauses';
import './clauseLibrary.css';

export const CLAUSE_LIBRARY_HASH = '#clause-library';

const categoryIcons = {
  employment: Briefcase,
  rental: House,
  services: Handshake,
  liability: Gavel,
  finance: Landmark,
};

const categories = Object.keys(CLAUSE_CATEGORIES) as ClauseCategory[];

function ClauseDetails({ clause }: { clause: ClauseEntry }) {
  const CategoryIcon = categoryIcons[clause.category];

  return (
    <article className="clause-detail">
      <header className="clause-detail-header">
        <a className="clause-back" href={CLAUSE_LIBRARY_HASH}><ArrowLeft size={17} aria-hidden="true"/> Back to clause search</a>
        <p className="clause-category"><CategoryIcon size={15} aria-hidden="true"/> {CLAUSE_CATEGORIES[clause.category]}</p>
        <h1 tabIndex={-1}>{clause.name}</h1>
      </header>
      <div className="clause-detail-grid">
        <div className="clause-detail-body panel">
          <section>
            <h2>What it means</h2>
            <p>{clause.meaning}</p>
          </section>
          <section>
            <h2>Fictional example</h2>
            <blockquote>“{clause.example}”</blockquote>
          </section>
          <section>
            <h2>Why it matters</h2>
            <p>{clause.importance}</p>
          </section>
          <section>
            <h2>What to check</h2>
            <p>{clause.checks}</p>
          </section>
        </div>
        <div className="clause-detail-aside">
          <section className="clause-questions">
            <h2>Questions to ask before signing</h2>
            <ul>{clause.questions.map((question) => <li key={question}>{question}</li>)}</ul>
          </section>
          <section className="clause-related panel">
            <h2>Related clauses</h2>
            <ul>
              {clause.related.map((id) => {
                const related = getClause(id);
                return related && <li key={id}><a href={`${CLAUSE_LIBRARY_HASH}/${id}`}>{related.name}<ArrowRight size={15} aria-hidden="true"/></a></li>;
              })}
            </ul>
          </section>
        </div>
      </div>
      <p className="clause-context"><Info size={17} aria-hidden="true"/> {CLAUSE_LEGAL_CONTEXT}</p>
    </article>
  );
}

export function ClauseLibrary({ hidden, clause }: { hidden: boolean; clause?: ClauseEntry }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ClauseCategory | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  if (hidden) return null;
  const results = findClauses(query, category);
  const filtered = category !== 'all' || query.length > 0;
  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    searchRef.current?.focus();
  };

  return (
    <div className="library-view">
      {clause ? <ClauseDetails clause={clause}/> : <>
        <header className="library-hero">
          <div className="library-hero-inner">
            <BookOpen size={30} aria-hidden="true"/>
            <h1 tabIndex={-1}>Clause Library</h1>
            <p>Explore common contract clauses in plain English. Learn what they mean, what to look for, and which questions to ask before signing.</p>
          </div>
        </header>
        <section className="library-content" aria-labelledby="browse-clauses">
          <h2 id="browse-clauses">Browse clauses</h2>
          <label className="clause-search">
            <span>Search clauses</span>
            <span className="clause-search-input">
              <Search size={20} aria-hidden="true"/>
              <input ref={searchRef} type="search" value={query} placeholder="Try “automatic renewal” or “liability cap”" onChange={(event) => setQuery(event.target.value)}/>
            </span>
          </label>
          <div className="clause-filters" role="group" aria-label="Filter by category">
            <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All categories</button>
            {categories.map((key) => {
              const CategoryIcon = categoryIcons[key];
              return <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>
                <CategoryIcon size={15} aria-hidden="true"/> {CLAUSE_CATEGORIES[key]}
              </button>;
            })}
          </div>
          <div className="clause-results-bar">
            <p role="status">{filtered ? `${results.length} of ${CLAUSES.length} clauses` : `${CLAUSES.length} clauses`}</p>
            <button type="button" className="clause-clear" disabled={!filtered} onClick={clearFilters}>Clear filters</button>
          </div>
          {results.length ? <ul className="clause-grid">
            {results.map((entry) => {
              const CategoryIcon = categoryIcons[entry.category];
              return (
                <li key={entry.id}>
                  <article className="clause-card panel">
                    <p className="clause-category"><CategoryIcon size={15} aria-hidden="true"/> {CLAUSE_CATEGORIES[entry.category]}</p>
                    <h3><a href={`${CLAUSE_LIBRARY_HASH}/${entry.id}`}>{entry.name}</a></h3>
                    <p className="clause-card-description">{entry.meaning}</p>
                    <ArrowRight className="clause-card-arrow" size={19} aria-hidden="true"/>
                  </article>
                </li>
              );
            })}
          </ul> : <div className="clause-empty panel">
            <SearchX size={25} aria-hidden="true"/>
            <h3>No clauses match your search</h3>
            <p>Try a different keyword or clear the filters to browse all clauses.</p>
          </div>}
        </section>
      </>}
    </div>
  );
}
