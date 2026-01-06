if (window !== window.top) {
  (async () => {
    console.log('[EXT injected]2', window.location.href, 'top?', window);
    const miniHtml = await import('./miniHtml.js');
    console.log(miniHtml);
  })();
}
