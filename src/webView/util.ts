import { ToMainIpc } from '../contracts/toMain';

export namespace Util {
  export class Lock<T = void> {
    wait: Promise<T> = Promise.resolve() as Promise<T>;
    private unlockTo: NodeJS.Timeout | null = null;
    constructor(private logName?: string) {}
    unlocker: ((...v: T extends void ? [] : [T]) => void) | null = null;
    unlock(...v: T extends void ? [] : [T]) {
      if (this.logName) {
        console.log(`${this.logName} Unlock `, this.unlocker, ...v);
      }
      if (this.unlocker) {
        this.unlocker(...v);
        this.unlocker = null;
      }
    }
    delayUnlock(delayMs: number, ...v: T extends void ? [] : [T]) {
      if (this.logName) {
        console.log(
          `${this.logName} Delay unlock `,
          delayMs,
          this.unlocker,
          ...v,
        );
      }
      if (this.unlocker && this.unlockTo === null) {
        this.unlockTo = setTimeout(() => {
          this.unlock(...v);
          this.unlockTo = null;
        }, delayMs);
      }
    }
    async lock() {
      if (this.logName) {
        console.log(`${this.logName} Lock `);
      }
      if (this.unlocker) {
        await this.wait;
      }
      return this.doLock();
    }
    lockNowOrError() {
      if (this.unlocker) {
        throw new Error('Lock is already locked');
      }
      return this.doLock();
    }
    tryLock() {
      if (this.logName) {
        console.log(`${this.logName} Try lock `, this.unlocker);
      }
      if (!this.unlocker) {
        this.doLock();
        return true;
      }
      return false;
    }
    private doLock() {
      if (this.logName) {
        console.log(`${this.logName} Do lock `, this.unlockTo);
      }
      if (this.unlockTo !== null) {
        clearTimeout(this.unlockTo);
        this.unlockTo = null;
      }
      this.wait = new Promise<T>((resolve: (...v: any[]) => void) => {
        this.unlocker = (...v: T extends void ? [] : [T]) => {
          resolve(...v);
          this.unlocker = null;
        };
      });
      return this;
    }
  }

  export const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  export const newLock = <T = void>(logName?: string) => {
    return new Lock<T>(logName);
  };
  export const WaitTimeout: symbol = Symbol('WaitTimeout');
  export const awaitWithTimeout = async <T>(
    wait: Promise<T>,
    timeout: number,
  ): Promise<T | typeof WaitTimeout> => {
    const timeoutPromise = sleep(timeout).then(() => WaitTimeout);
    return Promise.race([wait, timeoutPromise]);
  };
  export const scrollAdjustmentLock = Util.newLock<number>().lockNowOrError();
  export const testScrollAdjustment = async (frameId: number) => {
    return new Promise<number>(async (resolve) => {
      const { scrollX, scrollY } = window;
      const scrollHandler = (e: WheelEvent) => {
        if (e.deltaY === -1 && e.deltaX === -1) {
          resolve(-1);
        } else {
          resolve(1);
        }
        window.scrollTo(scrollX, scrollY);
        window.removeEventListener('wheel', scrollHandler);
      };
      window.addEventListener('wheel', scrollHandler);
      await ToMainIpc.dispatchEvents.invoke({
        frameId,
        events: [
          {
            type: 'mouseWheel',
            deltaX: 1,
            deltaY: 1,
            x: 0,
            y: 0,
            scrollEl: '',
          },
        ],
      });
    });
  };
  export const formatError = (error: unknown) => {
    return error instanceof Error
      ? `${error.message}: ${JSON.stringify(error)}`
      : JSON.stringify(error);
  };
  export const isMac = process.platform === 'darwin';
}
