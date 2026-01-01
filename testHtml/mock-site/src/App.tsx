import { useMemo } from 'react';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EmailListPage from './pages/EmailListPage';
import SearchEnginePage from './pages/SearchEnginePage';
import SearchResultPage from './pages/SearchResultPage';
import EcommercePage from './pages/EcommercePage';

const flowMap = {
  login: LoginPage,
  register: RegisterPage,
  email_list: EmailListPage,
  search_engine: SearchEnginePage,
  search_result: SearchResultPage,
  ecommerce: EcommercePage
};

type FlowKey = keyof typeof flowMap;

function parseFlowSequence() {
  const params = new URLSearchParams(window.location.search);
  const flowParam = params.get('flow') ?? '';
  return flowParam
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseStepIndex(max: number) {
  const params = new URLSearchParams(window.location.search);
  const raw = Number(params.get('step') ?? 0);
  if (Number.isNaN(raw)) {
    return 0;
  }
  return Math.min(Math.max(raw, 0), Math.max(max, 0));
}

export default function App() {
  const flowSequence = useMemo(() => parseFlowSequence(), []);
  const hasFlows = flowSequence.length > 0;
  const stepIndex = useMemo(() => parseStepIndex(flowSequence.length - 1), [flowSequence.length]);

  const activeFlowId = hasFlows ? flowSequence[stepIndex] : undefined;
  const ActiveFlow = activeFlowId ? flowMap[activeFlowId as FlowKey] : undefined;

  return (
    <div className="page">
      {!hasFlows && <LandingPage />}
      <main className="flows">
        {hasFlows && !ActiveFlow && (
          <section className="flow flow--missing">
            <h2>Page not found</h2>
            <p className="muted">This destination is not available.</p>
          </section>
        )}
        {ActiveFlow && <ActiveFlow />}
      </main>
    </div>
  );
}
