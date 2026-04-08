type SessionValue = string | number | boolean | object | null;

export function readSession<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage for ${key}`, error);
    return fallback;
  }
}

export function writeSession(key: string, value: SessionValue) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeSession(key: string) {
  localStorage.removeItem(key);
}

const RESULTS_KEY = 'runEverMark_benchmark_results';

export function getBenchmarkResults(): Record<string, Record<string, boolean>> {
  return readSession(RESULTS_KEY, {});
}

export function setBenchmarkResult(entryPoint: string, task: string, success: boolean) {
  const key = entryPoint.replace('#/', '')
  const results = getBenchmarkResults();
  if (!results[key]) {
    results[key] = {};
  }
  results[key][task] = success;
  writeSession(RESULTS_KEY, results);
}

export function clearBenchmarkResult(entryPoint: string) {
  const results = getBenchmarkResults();
  if (results[entryPoint]) {
    delete results[entryPoint];
    writeSession(RESULTS_KEY, results);
  }
}
