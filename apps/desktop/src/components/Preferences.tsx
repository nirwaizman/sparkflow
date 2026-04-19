import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import type { Prefs } from '../types/sparkflow';

export function Preferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void window.sparkflow.prefs.get().then(setPrefs);
  }, []);

  if (!prefs) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  }

  async function save() {
    if (!prefs) return;
    const next = await window.sparkflow.prefs.set(prefs);
    setPrefs(next);
    setSavedAt(Date.now());
  }

  async function pickFolder() {
    const folder = await window.sparkflow.prefs.pickFolder();
    if (folder) update('workspaceFolder', folder);
  }

  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Preferences</h1>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Backend URL</span>
        <input
          type="url"
          className="rounded border border-slate-300 px-3 py-2"
          value={prefs.backendUrl}
          onChange={(e) => update('backendUrl', e.target.value)}
          placeholder="http://localhost:3000"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">API Token (optional)</span>
        <input
          type="password"
          className="rounded border border-slate-300 px-3 py-2"
          value={prefs.apiToken}
          onChange={(e) => update('apiToken', e.target.value)}
          placeholder="Bearer token"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Default Workspace Folder</span>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            className="flex-1 rounded border border-slate-300 bg-slate-50 px-3 py-2"
            value={prefs.workspaceFolder || '(none selected)'}
          />
          <button
            type="button"
            onClick={() => void pickFolder()}
            className="flex items-center gap-1 rounded bg-slate-900 px-3 py-2 text-white"
          >
            <Folder className="h-4 w-4" /> Choose…
          </button>
        </div>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.autoLaunch}
          onChange={(e) => update('autoLaunch', e.target.checked)}
        />
        Launch SparkFlow at login
      </label>

      <div className="mt-auto flex items-center justify-end gap-3">
        {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
        <button
          type="button"
          onClick={() => void save()}
          className="rounded bg-sky-600 px-4 py-2 text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
