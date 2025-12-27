import FlowFrame from '../FlowFrame';

const results = [
  {
    title: 'Customer retention benchmarks 2025',
    url: 'northstar.io/insights/retention-2025',
    snippet: 'See how top SaaS teams reduced churn with in-product milestones.'
  },
  {
    title: 'Onboarding checklist template',
    url: 'northstar.io/templates/onboarding',
    snippet: 'A ready-to-run onboarding plan for your new product launches.'
  },
  {
    title: 'Pipeline velocity calculator',
    url: 'northstar.io/tools/pipeline',
    snippet: 'Estimate revenue impact across stages using real conversion ratios.'
  }
];

export default function SearchResultFlow() {
  return (
    <FlowFrame title="Results" subtitle="Flow: search_result" theme="results">
      <div className="results">
        <div className="results__summary">
          <p>
            About <strong>12,430</strong> results for <strong>"pipeline velocity"</strong>
          </p>
          <div className="results__filters">
            <button className="pill pill--active">All</button>
            <button className="pill">Recent</button>
            <button className="pill">Verified</button>
            <button className="pill">Images</button>
          </div>
        </div>
        <div className="results__list">
          {results.map((result) => (
            <article key={result.title} className="results__item">
              <p className="results__url">{result.url}</p>
              <h3>{result.title}</h3>
              <p className="muted">{result.snippet}</p>
            </article>
          ))}
        </div>
      </div>
    </FlowFrame>
  );
}
