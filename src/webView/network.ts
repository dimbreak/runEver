import { Util } from './util';

export namespace Network {
  export const networkIdle0 = Util.newLock();
  export const networkIdle2 = Util.newLock();
  export const initMonitor = () => {
    let idle0Timeout: NodeJS.Timeout | null = null;
    window.addEventListener('message', (e) => {
      if (e.data.network) {
        const { inflight } = e.data.network;
        if (inflight <= 2) {
          networkIdle2.unlock();
          if (inflight === 0) {
            idle0Timeout = setTimeout(() => {
              networkIdle0.unlock();
            }, 500);
          } else {
            networkIdle0.tryLock();
            if (idle0Timeout) {
              clearTimeout(idle0Timeout);
            }
          }
        } else {
          networkIdle2.tryLock();
        }
      }
    });
  };
  const networkFilterExcludeUrlRx =
    /google-analytics|doubleclick|segment|hotjar/i;
  export const networkRequestFilter = (url: string, type: string) => {
    if (!type) return true;
    if (type === 'Media' || type === 'Image' || type === 'Font') return false;

    if (type === 'WebSocket' || type === 'EventSource') return false;

    return !(url && networkFilterExcludeUrlRx.test(url));
  };
}
