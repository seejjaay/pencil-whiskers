/**
 * Power-ups, as data. They drop like threats carrying a normal shape; drawing that shape saves
 * them. A saved power is used by drawing its own activation shape (role 'power' in
 * src/recognizer/shapes.ts), which no threat ever carries.
 */
export type PowerKind = 'slow' | 'erase' | 'barrier';

export interface PowerDef {
  readonly kind: PowerKind;
  readonly label: string;
  /** Shape id drawn to use it. */
  readonly useShape: string;
  /** Relative chance of dropping. */
  readonly weight: number;
  /** How long it lasts (0 = instant). */
  readonly durationMs: number;
}

export const POWERS: readonly PowerDef[] = [
  { kind: 'slow', label: 'slow time', useShape: 'spiral', weight: 0.4, durationMs: 6000 },
  { kind: 'erase', label: 'erase all', useShape: 'infinity', weight: 0.25, durationMs: 0 },
  { kind: 'barrier', label: 'barrier', useShape: 'arch', weight: 0.35, durationMs: 8000 },
];

export const POWER_RULES = {
  /** Saved power-ups held at once; a pickup when full pays `fullBonus` instead. */
  inventoryMax: 3,
  fullBonus: 300,
  /** Drops start in this wave. */
  firstDropWave: 2,
  /** First drop of a run, then the gap between drops (field time, ms). */
  firstDropMs: [6000, 12000],
  dropEveryMs: [20000, 30000],
  /** Items fall slower than threats: they are a gift, not a test. */
  itemSpeedFactor: 0.6,
  /** Slow time runs the field at this fraction of normal speed (movement and spawns). */
  slowFactor: 0.35,
  /** The barrier line (playfield y) threats can't pass while it's up. */
  barrierY: 0.82,
  /** Erase all strips this many shapes off the boss instead of defeating it outright. */
  eraseBossShapes: 3,
} as const;

export function powerDef(kind: PowerKind): PowerDef {
  return POWERS.find((p) => p.kind === kind)!;
}

/** The power whose activation shape this is, if any. */
export function powerByShape(shape: string): PowerDef | undefined {
  return POWERS.find((p) => p.useShape === shape);
}
