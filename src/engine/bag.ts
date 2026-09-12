import { EMPTY_BAG } from './constants';
import { RESOURCES, type Resource, type ResourceBag } from './types';

export function bag(partial: Partial<ResourceBag> = {}): ResourceBag {
  return { ...EMPTY_BAG, ...partial };
}

export function bagTotal(b: ResourceBag): number {
  return b.brick + b.lumber + b.ore + b.grain + b.wool;
}

export function bagAdd(a: ResourceBag, b: ResourceBag): ResourceBag {
  return {
    brick: a.brick + b.brick,
    lumber: a.lumber + b.lumber,
    ore: a.ore + b.ore,
    grain: a.grain + b.grain,
    wool: a.wool + b.wool,
  };
}

export function bagSub(a: ResourceBag, b: ResourceBag): ResourceBag {
  return {
    brick: a.brick - b.brick,
    lumber: a.lumber - b.lumber,
    ore: a.ore - b.ore,
    grain: a.grain - b.grain,
    wool: a.wool - b.wool,
  };
}

export function bagCovers(have: ResourceBag, need: ResourceBag): boolean {
  return RESOURCES.every((r) => have[r] >= need[r]);
}

export function bagIsEmpty(b: ResourceBag): boolean {
  return bagTotal(b) === 0;
}

export function bagNonNegative(b: ResourceBag): boolean {
  return RESOURCES.every((r) => b[r] >= 0 && Number.isInteger(b[r]));
}

/** Resources that appear in both bags (used to reject like-for-like trades). */
export function bagOverlap(a: ResourceBag, b: ResourceBag): boolean {
  return RESOURCES.some((r) => a[r] > 0 && b[r] > 0);
}

export function bagEntries(b: ResourceBag): [Resource, number][] {
  return RESOURCES.filter((r) => b[r] > 0).map((r) => [r, b[r]]);
}

export function bagFromList(list: readonly Resource[]): ResourceBag {
  const out = bag();
  for (const r of list) out[r]++;
  return out;
}

export function bagToList(b: ResourceBag): Resource[] {
  const out: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < b[r]; i++) out.push(r);
  return out;
}

/** Amount still missing to afford `need` from `have`. */
export function bagMissing(have: ResourceBag, need: ResourceBag): ResourceBag {
  const out = bag();
  for (const r of RESOURCES) out[r] = Math.max(0, need[r] - have[r]);
  return out;
}
