export class FirstTokenMonitor {
  private interval: NodeJS.Timeout | undefined;
  private startTime: number;
  private cacheKey: string;
  private hasReceivedFirstToken: boolean = false;
  private readonly checkIntervalMs: number;

  constructor(cacheKey: string = '', checkIntervalMs: number = 3000) {
    this.cacheKey = cacheKey;
    this.startTime = Date.now();
    this.checkIntervalMs = checkIntervalMs;
  }

  public start(): void {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      console.log(
        'Waiting for first token',
        this.cacheKey,
        Date.now() - this.startTime,
        !this.hasReceivedFirstToken,
      );
    }, this.checkIntervalMs);
  }

  public onFirstToken(token?: string): void {
    if (this.hasReceivedFirstToken) {
      return; // Already handled
    }

    this.hasReceivedFirstToken = true;
    this.stop();

    console.log(
      'Stream first token',
      this.cacheKey,
      Date.now() - this.startTime,
      token,
    );
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  public hasReceived(): boolean {
    return this.hasReceivedFirstToken;
  }

  public getElapsedTime(): number {
    return Date.now() - this.startTime;
  }
}
