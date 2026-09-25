export const clientId = Math.random().toString(36).slice(2, 10);

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  getConfig: () => request('GET', '/api/config'),
  saveConfig: (config) => request('PUT', '/api/config', { config, clientId }),
  status: () => request('GET', '/api/status'),
  press: (profileId, pageId, index) => request('POST', '/api/press', { profileId, pageId, index }),
  test: (action) => request('POST', '/api/test', { action }),
  control: (profileId, pageId, index, input) => request('POST', '/api/press', { profileId, pageId, index, input: { ...input, clientId } }),
  sync: (profileId, pageId, index) => request('POST', '/api/press', { profileId, pageId, index, syncOnly: true }),
  windows: () => request('GET', '/api/windows'),
  msfsInputs: (refresh = false) => request('GET', `/api/msfs/inputs${refresh ? '?refresh=1' : ''}`),
  msfsRead: (what) => request('POST', '/api/msfs/read', what),
  simhubProperties: () => request('GET', '/api/simhub/properties'),
  update: () => request('GET', '/api/update'),
  checkUpdate: () => request('POST', '/api/update/check'),
  installUpdate: () => request('POST', '/api/update/install'),
};

// Flux d'événements temps réel (reconnexion automatique gérée par EventSource).
export function subscribe(handlers) {
  const es = new EventSource('/api/events');
  for (const [event, fn] of Object.entries(handlers)) {
    if (event === 'open' || event === 'error') continue;
    es.addEventListener(event, (e) => fn(JSON.parse(e.data)));
  }
  es.onopen = () => handlers.open?.();
  es.onerror = () => handlers.error?.();
  return es;
}
