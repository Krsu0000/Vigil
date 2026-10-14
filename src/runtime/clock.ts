export type Clock = Readonly<{ wallNow: () => number; monotonicNow: () => number }>;
export type Scheduler = Readonly<{
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
}>;

export const browserClock: Clock = {
  wallNow: () => Date.now(), monotonicNow: () => performance.now(),
};
export const browserScheduler: Scheduler = {
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (handle) => window.clearTimeout(handle as number),
};
