export namespace Util {
  export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  export const newLock = <T = void>() => {
    let resolver: T extends void ? () => void : (v: T) => void;
    const wait = new Promise<T>((resolve) => {
      resolver = resolve as T extends void ? () => void : (v: T) => void;
    });
    return { wait, unlock: resolver! };
  };
  export const scrollAdjustmentLock = Util.newLock<number>();
}
