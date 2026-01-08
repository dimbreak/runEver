import { useState, type FormEvent } from 'react';
import { writeSession } from '../utils/session';

export default function SearchHomePage() {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    writeSession('runEverMark_search_query', query || 'default benchmark query');
    window.location.hash = '#/search/results';
  };

  return (
    <section className="panel search-hero">
      <h2>runEverMark Search</h2>
      <p className="muted">Search results mix correct and scrum responses.</p>
      <form className="search-box" onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search benchmark data"
        />
        <button className="button" type="submit">
          Search
        </button>
      </form>
    </section>
  );
}
