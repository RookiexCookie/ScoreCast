/* Storage: thin localStorage wrapper. Fails soft when storage is unavailable or full. */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const P = 'scorecast.';
  const MODEL_VERSION = 1;
  const MAX_HISTORY = 200;

  function get(key, fallback) {
    try {
      const v = localStorage.getItem(P + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function set(key, value) {
    try { localStorage.setItem(P + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(P + key); } catch (e) { /* ignore */ }
  }

  S.storage = {
    getTheme: () => get('theme', null),
    setTheme: (t) => set('theme', t),

    getBands: () => get('bands', null),
    setBands: (b) => set('bands', b),

    getHistory: () => {
      const h = get('history', []);
      return Array.isArray(h) ? h : [];
    },
    addHistory(entry) {
      const h = this.getHistory();
      h.unshift(entry);
      set('history', h.slice(0, MAX_HISTORY));
    },
    clearHistory: () => remove('history'),

    getModel(hash) {
      const m = get('model', null);
      return m && m.version === MODEL_VERSION && m.hash === hash ? m : null;
    },
    setModel(hash, payload) {
      return set('model', Object.assign({ version: MODEL_VERSION, hash }, payload));
    },
    clearModel: () => remove('model'),
  };
})();
