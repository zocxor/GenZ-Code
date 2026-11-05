// Web uses memory-only auth. Native builds resolve persistence.native.ts.
import {inMemoryPersistence} from 'firebase/auth';
export const persistence=inMemoryPersistence;
