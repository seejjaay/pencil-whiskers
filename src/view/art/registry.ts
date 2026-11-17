/**
 * Entity id -> art. Rules know entities only by id (src/game/entities.ts); this is where an id
 * gets its look. Ids without art fall back to a labelled placeholder, so a new entity works as
 * soon as it has a row in the entity table.
 */
import { entityDef } from '../../game/entities';
import type { ThreatKind } from '../../game/waves';
import { drawPlaceholderEntity, drawThreat } from './threats';

export interface EntityArt {
  draw(ctx: CanvasRenderingContext2D, now: number, id: number): void;
  /** 'big' art (bosses) is scaled with the window height. */
  size: 'normal' | 'big';
  /** How far above its centre, at scale 1, the thought bubble sits. */
  bubbleRise: number;
}

const drawn = (kind: ThreatKind, size: EntityArt['size'] = 'normal', bubbleRise = 64): EntityArt => ({
  draw: (ctx, now, id) => drawThreat(ctx, kind, now, id),
  size,
  bubbleRise,
});

const ART: Readonly<Record<string, EntityArt>> = {
  vacuum: drawn('vacuum'),
  sprayBottle: drawn('sprayBottle'),
  cucumber: drawn('cucumber'),
  bathTub: drawn('bathTub'),
  thunderCloud: drawn('thunderCloud'),
  doorbell: drawn('doorbell'),
  bathTime: drawn('bathTime', 'big', 84),
};

export function artFor(kind: string): EntityArt {
  const known = ART[kind];
  if (known) return known;
  const def = entityDef(kind);
  return {
    draw: (ctx, now, id) => drawPlaceholderEntity(ctx, def?.label ?? kind, now, id),
    size: def?.boss ? 'big' : 'normal',
    bubbleRise: 64,
  };
}
