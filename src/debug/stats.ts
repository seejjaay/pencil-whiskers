/** Counts events in a sliding time window. `now` is passed in so it is testable. */
export class RateMeter {
  private times: number[] = [];

  constructor(private readonly windowMs = 1000) {}

  tick(now: number): void {
    this.times.push(now);
    this.prune(now);
  }

  /** Events per second over the last window. */
  rate(now: number): number {
    this.prune(now);
    return (this.times.length * 1000) / this.windowMs;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.times.length && this.times[i] <= cutoff) i++;
    if (i > 0) this.times.splice(0, i);
  }
}

/** Fixed-size ring buffer of samples with percentile/mean queries. */
export class Sampler {
  private buf: Float64Array;
  private n = 0;
  private head = 0;

  constructor(readonly capacity = 120) {
    this.buf = new Float64Array(capacity);
  }

  add(v: number): void {
    if (!Number.isFinite(v)) return;
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.n < this.capacity) this.n++;
  }

  get count(): number {
    return this.n;
  }

  values(): number[] {
    return Array.from(this.buf.subarray(0, this.n));
  }

  /** Nearest-rank percentile, p in [0, 100]. NaN when empty. */
  percentile(p: number): number {
    if (this.n === 0) return NaN;
    const sorted = this.values().sort((a, b) => a - b);
    const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length);
    return sorted[Math.max(0, rank - 1)];
  }

  mean(): number {
    if (this.n === 0) return NaN;
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.buf[i];
    return s / this.n;
  }

  max(): number {
    if (this.n === 0) return NaN;
    let m = -Infinity;
    for (let i = 0; i < this.n; i++) m = Math.max(m, this.buf[i]);
    return m;
  }

  reset(): void {
    this.n = 0;
    this.head = 0;
  }
}
