import type { DevCard, Resource, ResourceBag, Terrain } from '@/engine/types';
import { RESOURCES } from '@/engine/types';

export const RESOURCE_LABEL: Record<Resource, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  ore: 'Ore',
  grain: 'Grain',
  wool: 'Wool',
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  hills: 'Hills',
  forest: 'Forest',
  mountains: 'Mountains',
  fields: 'Fields',
  pasture: 'Pasture',
  desert: 'Desert',
};

export const DEV_LABEL: Record<DevCard, string> = {
  knight: 'Knight',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
  victoryPoint: 'Victory Point',
};

export const DEV_DESCRIPTION: Record<DevCard, string> = {
  knight: 'Move the robber and steal 1 card from a player next to it. Three knights earn Largest Army (2 points).',
  roadBuilding: 'Place 2 roads for free.',
  yearOfPlenty: 'Take any 2 resources from the bank.',
  monopoly: 'Name a resource. Every other player gives you all of theirs.',
  victoryPoint: 'Worth 1 victory point. Counts automatically when you reach 10.',
};

export function bagText(bag: ResourceBag, none = 'nothing'): string {
  const parts = RESOURCES.filter((r) => bag[r] > 0).map((r) => `${bag[r]} ${RESOURCE_LABEL[r]}`);
  if (parts.length === 0) return none;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
