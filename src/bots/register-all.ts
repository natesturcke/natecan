/** Side-effect module: registers every bot tier with the registry. */
import { registerBot } from './registry';
import { RandomBot } from './RandomBot';
import { SearchBot } from './SearchBot';
import { ValueFunctionBot } from './ValueFunctionBot';

registerBot('easy', () => new RandomBot());
registerBot('medium', () => new ValueFunctionBot());
registerBot('hard', () => new SearchBot());
