if (window !== window.top) {
  (async () => {
    const iframeLazy = await import('./iframeLazy.js');
  })();
}
