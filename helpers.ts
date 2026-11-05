import type {Store} from '../src/storage';
export function memory() {
  const data = new Map<string, string>();
  const calls: string[] = [];
  const store: Store & {fail?: 'read' | 'write'} = {
    getItem: async k => {if (store.fail === 'read') throw new Error('disk unavailable'); return data.get(k) ?? null;},
    setItem: async (k, v) => {if (store.fail === 'write') throw new Error('disk full'); calls.push('set:' + k); data.set(k, v);},
    multiSet: async pairs => {if (store.fail === 'write') throw new Error('disk full'); calls.push('multiSet:' + pairs.map(p => p[0]).join(',')); for (const [k, v] of pairs) data.set(k, v);},
    multiRemove: async keys => {calls.push('remove'); keys.forEach(k => data.delete(k));},
    getAllKeys: async () => [...data.keys()],
  };
  return {data, calls, store};
}

