/**
 * The cast, as data. These are stand-ins: rules read only this table, and the look comes from
 * the view's art registry (src/view/art/registry.ts) under the same id. To add an entity, add a
 * row here: it joins the waves from `unlockWave` with placeholder art until it gets its own.
 */
export interface EntityDef {
  readonly id: string;
  readonly label: string;
  /** Multiplier on the wave's base fall speed. */
  readonly speed: number;
  /** First wave it can appear in as a regular threat. */
  readonly unlockWave: number;
  /** Boss of boss waves; never spawns as a regular threat. */
  readonly boss?: boolean;
}

export const ENTITIES = [
  { id: 'vacuum', label: 'grumpy vacuum', speed: 1, unlockWave: 1 },
  { id: 'sprayBottle', label: 'spray bottle', speed: 1.1, unlockWave: 1 },
  { id: 'cucumber', label: 'cucumber', speed: 0.9, unlockWave: 2 },
  { id: 'bathTub', label: 'bubbly bath tub', speed: 0.8, unlockWave: 3 },
  { id: 'thunderCloud', label: 'thunder cloud', speed: 1, unlockWave: 4 },
  { id: 'doorbell', label: 'noisy doorbell', speed: 1.2, unlockWave: 5 },
  { id: 'bathTime', label: 'Bath Time tub', speed: 1, unlockWave: 5, boss: true },
] as const satisfies readonly EntityDef[];

export type EntityId = (typeof ENTITIES)[number]['id'];

const byId = new Map<string, EntityDef>(ENTITIES.map((e) => [e.id, e]));

export function entityDef(id: string): EntityDef | undefined {
  return byId.get(id);
}

/** Speed multiplier for an entity (1 for unknown ids). */
export function speedOf(id: string): number {
  return byId.get(id)?.speed ?? 1;
}

export const BOSS_ID: EntityId = 'bathTime';

/** Regular (non-boss) entities available in this wave. */
export function entitiesFor(wave: number): EntityId[] {
  return ENTITIES.filter((e) => !('boss' in e && e.boss) && e.unlockWave <= wave).map((e) => e.id);
}
