import { createHandler } from './handler.ts';
import { createRepository } from './repository.ts';

export default { fetch: createHandler(createRepository) };
