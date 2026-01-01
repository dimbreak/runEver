import { type WebContents } from 'electron';
import { Util } from './util';

export namespace Network {
  export const networkIdle0 = Util.newLock(); // for webview
  export const networkIdle2 = Util.newLock(); // for webview
  export const initMonitor = (
    webContents: WebContents,
    inflight: Set<string>,
  ): [Util.Lock, Util.Lock] => {
    const mainNetworkIdle0 = Util.newLock(); // for main tabWebview
    const mainNetworkIdle2 = Util.newLock(); // for main tabWebview
    webContents.debugger.attach('1.3');

    // setInterval(() => {
    //   console.log('network pending req', inflight);
    // }, 2000);

    webContents.debugger
      .sendCommand('Network.enable')
      .then(() => {
        webContents.debugger.on('message', (_event, method, params) => {
          // console.log(
          //   'network event',
          //   method,
          //   params.requestId,
          //   params.response?.url ?? params,
          //   params.type,
          // );
          if (method === 'Network.requestWillBeSent') {
            if (Network.networkRequestFilter(params.request.url, params.type)) {
              inflight.add(params.requestId);
            } else {
              return;
            }
          } else if (
            !(
              method === 'Network.loadingFinished' ||
              method === 'Network.loadingFailed'
            ) ||
            !inflight.delete(params.requestId)
          ) {
            return;
          }
          if (inflight.size < 4) {
            webContents.executeJavaScript(
              `window.postMessage({network: {inflight: ${inflight.size}}})`,
            );
            // maintain for main
            if (inflight.size <= 2) {
              mainNetworkIdle2.delayUnlock(500);
              if (inflight.size === 0) {
                mainNetworkIdle0.delayUnlock(500);
              } else {
                mainNetworkIdle0.tryLock();
              }
            } else {
              mainNetworkIdle2.tryLock();
            }
          }
        });
      })
      .catch(console.error);
    return [mainNetworkIdle0, mainNetworkIdle2];
  };
  export const initListener = () => {
    window.addEventListener('message', (e) => {
      if (e.data.network) {
        const { inflight } = e.data.network;
        // console.log('network inflight', inflight);
        // maintain for webview
        if (inflight <= 2) {
          networkIdle2.delayUnlock(500);
          if (inflight === 0) {
            networkIdle0.delayUnlock(500);
          } else {
            networkIdle0.tryLock();
          }
        } else {
          networkIdle2.tryLock();
        }
      }
    });
  };
  export const waitForNetworkIdle0 = async (
    waitIdle0 = networkIdle0,
    waitIdle2 = networkIdle2,
  ) => {
    await Promise.race([
      Util.sleep(5000).then(() => waitIdle2.wait),
      Promise.race([waitIdle0.wait, Util.sleep(5000)]),
    ]);
  };
  const networkFilterExcludeUrlRx =
    /google-analytics|doubleclick|segment|hotjar|browser-intake-datadoghq|youtube.com\/embed/i;
  export const networkRequestFilter = (url: string, type: string) => {
    if (!type) return true;
    if (type === 'Media' || type === 'Image' || type === 'Font') return false;

    if (type === 'WebSocket' || type === 'EventSource') return false;

    return !(url && networkFilterExcludeUrlRx.test(url));
  };
}
