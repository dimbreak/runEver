const DISABLED_SIGNALS = new Set(['SIGINT', 'SIGTERM']);
const PATCH_FLAG = '__runeverDisableSigintPatched__';

if (!process[PATCH_FLAG]) {
  const wrapSignalMethod = (methodName) => {
    const originalMethod = process[methodName];

    if (typeof originalMethod !== 'function') {
      return;
    }

    process[methodName] = function patchedSignalMethod(event, listener) {
      if (DISABLED_SIGNALS.has(event)) {
        return this;
      }

      return originalMethod.call(this, event, listener);
    };
  };

  wrapSignalMethod('on');
  wrapSignalMethod('addListener');
  wrapSignalMethod('once');
  wrapSignalMethod('prependListener');
  wrapSignalMethod('prependOnceListener');

  Object.defineProperty(process, PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
