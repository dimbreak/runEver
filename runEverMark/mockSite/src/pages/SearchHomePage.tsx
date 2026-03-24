import { useState, type FormEvent, useEffect } from 'react';
import { clearBenchmarkResult, writeSession, setBenchmarkResult } from '../utils/session';

export default function SearchHomePage({
  nextHash = '#/search/results',
  entryPoint,
  expectedQuery
}: {
  nextHash?: string;
  entryPoint?: string;
  expectedQuery?: string;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (entryPoint) {
      clearBenchmarkResult(entryPoint);
    }
  }, [entryPoint]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (entryPoint) {
       setBenchmarkResult(entryPoint, 'submit_query', true);
       if (expectedQuery && query.toLowerCase().includes(expectedQuery.toLowerCase())) {
          setBenchmarkResult(entryPoint, 'input_query', true);
       }
    }
    writeSession('runEverMark_search_query', query || 'default benchmark query');

    window.location.hash = nextHash;
  };

  return (
    <div className="google-home">
      <div className="google-logo">
        <span className="g-blue">G</span>
        <span className="g-red">o</span>
        <span className="g-yellow">g</span>
        <span className="g-blue">o</span>
      </div>

      <form className="google-search-bar" onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (entryPoint) {
              setBenchmarkResult(entryPoint, 'focus_input', true);
            }
          }}
          title="Search"
        />
        {/* Simple mic icon SVG could go here */}
      </form>

      <div className="google-buttons">
        <button className="google-btn" onClick={handleSubmit as any}>
          Gogo Search
        </button>
        <button className="google-btn">I'm Feeling Lucky</button>
      </div>
    </div>
  );
}
