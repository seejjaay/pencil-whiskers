import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from '../src/sw/template';

/**
 * Runs the generated service worker against fake caches and a fake network, so the offline
 * behaviour is tested without a browser.
 */
type Req = { url: string; method: string; mode: string };
const ORIGIN = 'https://cj.github.io';
const BASE = `${ORIGIN}/pencil-whiskers/`;
const abs = (u: string) => new URL(u, BASE).href;
const key = (r: Req | string) => abs(typeof r === 'string' ? r : r.url);

function harness(cacheName: string, shell: string[], existing: Record<string, Record<string, string>> = {}) {
  const stores = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(existing)) stores.set(name, new Map(Object.entries(entries).map(([u, body]) => [abs(u), new Response(body)])));
  let online = true;
  const network: string[] = [];
  const fakeFetch = async (r: Req | string): Promise<Response> => {
    network.push(key(r));
    if (!online) throw new TypeError('offline');
    return new Response(`net:${key(r)}`, { status: 200 });
  };
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) store.set(abs(u), await fakeFetch(u));
      },
      put: async (r: Req | string, res: Response) => void store.set(key(r), res),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: Req | string) => {
      for (const store of stores.values()) {
        const hit = store.get(key(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  new Function('self', 'caches', 'fetch', serviceWorkerSource(cacheName, shell))(self, caches, fakeFetch);

  const lifecycle = async (type: 'install' | 'activate') => {
    let p: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const request = async (url: string, mode = 'no-cors', method = 'GET') => {
    let responded: Promise<Response> | null = null;
    listeners.fetch({ request: { url: abs(url), mode, method }, respondWith: (x: Promise<Response>) => (responded = x) });
    if (!responded) return null; // not intercepted: the browser handles it normally
    const res = await (responded as Promise<Response>);
    await new Promise((r) => setTimeout(r, 0)); // let remember() store its copy
    return res ? res.text() : undefined;
  };
  return { stores, network, lifecycle, request, setOnline: (v: boolean) => (online = v) };
}

describe('offline service worker', () => {
  const shell = ['./', './index.html', './assets/index-abc.js'];

  it('install precaches the app shell', async () => {
    const h = harness('pencil-whiskers-new', shell);
    await h.lifecycle('install');
    expect([...h.stores.get('pencil-whiskers-new')!.keys()]).toEqual(shell.map(abs));
  });

  it("activate deletes older builds' caches and leaves unrelated caches alone", async () => {
    const h = harness('pencil-whiskers-new', shell, { 'pencil-whiskers-old': { './x': 'old' }, 'someone-else': { './y': 'keep' } });
    await h.lifecycle('install');
    await h.lifecycle('activate');
    expect([...h.stores.keys()].sort()).toEqual(['pencil-whiskers-new', 'someone-else']);
  });

  it('serves the big model from cache after the first fetch, even offline', async () => {
    const h = harness('pencil-whiskers-new', shell);
    await h.lifecycle('install');
    const first = await h.request('./models/hand_landmarker.task');
    expect(first).toBe(`net:${abs('./models/hand_landmarker.task')}`);
    h.setOnline(false);
    const before = h.network.length;
    expect(await h.request('./models/hand_landmarker.task')).toBe(first);
    expect(h.network.length).toBe(before); // no network attempt at all
  });

  it('navigations go to the network first (new deploys show up) and fall back to the cache offline', async () => {
    const h = harness('pencil-whiskers-new', shell);
    await h.lifecycle('install');
    expect(await h.request('./?mouse', 'navigate')).toBe(`net:${abs('./?mouse')}`);
    h.setOnline(false);
    expect(await h.request('./?mouse', 'navigate')).toBe(`net:${abs('./?mouse')}`); // the copy stored above
    expect(await h.request('./?seed=1', 'navigate')).toBe(`net:${abs('./')}`); // unseen URL: the shell page
  });

  it('leaves cross-origin requests and non-GET requests to the browser', async () => {
    const h = harness('pencil-whiskers-new', shell);
    expect(await h.request('https://example.com/x.js')).toBeNull();
    expect(await h.request('./api', 'cors', 'POST')).toBeNull();
  });
});
