/** Side-effect module: registers every bot tier with the registry. */
import { registerBot } from './registry';
import { RandomBot } from './RandomBot';

registerBot('easy', () => new RandomBot());
