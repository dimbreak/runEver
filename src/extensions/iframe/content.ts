// 呢段會喺每個 frame 跑（main frame + iframe），最早 document_start

if (window !== window.top) {
  (async () => {
    console.log('[EXT injected]2', window.location.href, 'top?', window);
    const miniHtml = await import('./miniHtml.js');
    console.log(miniHtml);
  })();
}

// 例：你可以將可見文字上報
// window.postMessage({ type: "FRAME_TEXT", href: location.href, text: document.body?.innerText?.slice(0, 2000) }, "*");
