import { useMemo, useState } from 'react';
import Autosuggest, { type SuggestionsFetchRequestedParams } from 'react-autosuggest';
import FlowFrame from '../FlowFrame';

const suggestionMap: Record<string, string[]> = {
  A: ['analytics', 'automation', 'api gateway', 'accounting', 'ads'],
  B: ['budgeting', 'brand kit', 'business plan', 'backend', 'billing'],
  C: ['customer success', 'crm', 'cloud storage', 'compliance', 'conversion'],
  D: ['dashboards', 'data lake', 'design system', 'devops', 'deliverability'],
  E: ['engagement', 'etl pipeline', 'email templates', 'experiments', 'ecosystem'],
  F: ['forecasting', 'feature flags', 'feedback loops', 'finops', 'fraud checks'],
  G: ['growth metrics', 'go-to-market', 'graphql', 'governance', 'gdpr'],
  H: ['help center', 'heatmaps', 'hiring plan', 'hybrid cloud', 'heuristics'],
  I: ['integrations', 'incident response', 'inbox zero', 'identity', 'infrastructure'],
  J: ['journey mapping', 'job postings', 'jwt auth', 'jira sync', 'json schema'],
  K: ['kpis', 'knowledge base', 'key accounts', 'kubernetes', 'kanban boards'],
  L: ['lead scoring', 'lifecycle email', 'load testing', 'latency', 'log analysis'],
  M: ['market sizing', 'metrics stack', 'marketing ops', 'machine learning', 'mrr'],
  N: ['nps tracking', 'notion sync', 'network policy', 'newsletter', 'notifications'],
  O: ['onboarding', 'okr templates', 'observability', 'ops review', 'optimization'],
  P: [
    'pricing model',
    'product roadmap',
    'pipeline velocity',
    'payment retry',
    'personalization'
  ],
  Q: ['quarterly review', 'query optimizer', 'quality assurance', 'quota planning', 'queue metrics'],
  R: ['retention', 'revenue model', 'risk scoring', 'rollout plan', 'reporting'],
  S: ['support macros', 'sales enablement', 'search ranking', 'segmentation', 'security audit'],
  T: ['trial conversion', 'telemetry', 'task automation', 'team goals', 'time to value'],
  U: ['usage analytics', 'user research', 'uptime status', 'unified inbox', 'ux audit'],
  V: ['velocity report', 'vendor review', 'vision deck', 'value prop', 'voice of customer'],
  W: ['workflow builder', 'webhooks', 'weekly summary', 'warehouse sync', 'win loss'],
  X: ['x-ray insights', 'xml feeds', 'x-platform sdk', 'xdr security', 'x-axis charts'],
  Y: ['yearly planning', 'yield forecast', 'yoy growth', 'yammer alternatives', 'yarn workspace'],
  Z: ['zero trust', 'zendesk sync', 'zapier alternatives', 'zone routing', 'z-score']
};

type Suggestion = {
  label: string;
};

export default function SearchEngineFlow() {
  const allSuggestions = useMemo(
    () =>
      Object.values(suggestionMap)
        .flat()
        .map((label) => ({ label })),
    []
  );
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const onSuggestionsFetchRequested = ({ value }: SuggestionsFetchRequestedParams) => {
    const nextValue = value.trim().toLowerCase();
    if (!nextValue) {
      setSuggestions(allSuggestions.slice(0, 10));
      return;
    }
    const filtered = allSuggestions
      .filter((item) => item.label.toLowerCase().includes(nextValue))
      .slice(0, 10);
    setSuggestions(filtered);
  };

  const onSuggestionsClearRequested = () => {
    setSuggestions([]);
  };

  return (
    <FlowFrame title="Northstar Search" subtitle="Flow: search_engine" theme="search">
      <div className="search">
        <div className="search__header">
          <div className="search__logo">NS</div>
          <div className="search__input">
            <Autosuggest
              suggestions={suggestions}
              onSuggestionsFetchRequested={onSuggestionsFetchRequested}
              onSuggestionsClearRequested={onSuggestionsClearRequested}
              getSuggestionValue={(suggestion) => suggestion.label}
              renderSuggestion={(suggestion) => <span>{suggestion.label}</span>}
              inputProps={{
                value: query,
                onChange: (_, { newValue }) => setQuery(newValue),
                placeholder: 'Search for metrics, docs, or answers'
              }}
              theme={{
                container: 'autosuggest',
                input: 'autosuggest__input',
                suggestionsContainer: 'autosuggest__menu',
                suggestion: 'autosuggest__item',
                suggestionHighlighted: 'autosuggest__item--highlighted'
              }}
            />
            <button className="btn btn--primary">Search</button>
          </div>
        </div>
        <div className="search__chips">
          <span className="pill">All</span>
          <span className="pill">Docs</span>
          <span className="pill">People</span>
          <span className="pill">Workflows</span>
        </div>
        <div className="search__grid">
          <div className="search__card">
            <p className="muted">Trending query</p>
            <h4>Quarterly revenue breakdown</h4>
            <p className="muted">Last searched 2h ago by 23 people</p>
          </div>
          <div className="search__card">
            <p className="muted">Suggested workflow</p>
            <h4>Convert leads to pipeline</h4>
            <p className="muted">3-step automation with chat handoff</p>
          </div>
        </div>
      </div>
    </FlowFrame>
  );
}
