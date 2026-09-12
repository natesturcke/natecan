import type { Difficulty } from '@/engine/types';
import type { Bot } from './Bot';
import { RandomBot } from './RandomBot';

const factories: Record<Difficulty, () => Bot> = {
  easy: () => new RandomBot(),
  medium: () => new RandomBot(),
  hard: () => new RandomBot(),
};

export function registerBot(difficulty: Difficulty, factory: () => Bot): void {
  factories[difficulty] = factory;
}

export function createBot(difficulty: Difficulty): Bot {
  return factories[difficulty]();
}
