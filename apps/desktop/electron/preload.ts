import { contextBridge, ipcRenderer } from 'electron';

export type Prefs = {
  backendUrl: string;
  apiToken: string;
  workspaceFolder: string;
  autoLaunch: boolean;
  sessionCookie?: string;
};

const api = {
  prefs: {
    get: (): Promise<Prefs> => ipcRenderer.invoke('prefs:get'),
    set: (patch: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke('prefs:set', patch),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('prefs:pickFolder'),
  },
  fs: {
    read: (p: string): Promise<string> => ipcRenderer.invoke('fs:read', p),
    writeSafe: (p: string, contents: string): Promise<{ ok: true; path: string }> =>
      ipcRenderer.invoke('fs:writeSafe', p, contents),
  },
  chat: {
    /**
     * Stream a chat completion from the web backend. Yields text chunks as they arrive.
     */
    async *stream(args: {
      prompt: string;
      signal?: AbortSignal;
    }): AsyncGenerator<string, void, void> {
      const prefs = await api.prefs.get();
      const url = `${prefs.backendUrl.replace(/\/$/, '')}/api/chat/stream`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-guest-mode': '1',
      };
      if (prefs.apiToken) headers['Authorization'] = `Bearer ${prefs.apiToken}`;
      if (prefs.sessionCookie) headers['Cookie'] = prefs.sessionCookie;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: [{ role: 'user', content: args.prompt }] }),
        signal: args.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Chat stream failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) yield decoder.decode(value, { stream: true });
      }
    },
    async uploadFiles(files: File[]): Promise<unknown> {
      const prefs = await api.prefs.get();
      const url = `${prefs.backendUrl.replace(/\/$/, '')}/api/files`;
      const form = new FormData();
      for (const f of files) form.append('files', f, f.name);
      const headers: Record<string, string> = { 'x-guest-mode': '1' };
      if (prefs.apiToken) headers['Authorization'] = `Bearer ${prefs.apiToken}`;
      if (prefs.sessionCookie) headers['Cookie'] = prefs.sessionCookie;
      const res = await fetch(url, { method: 'POST', headers, body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json();
    },
  },
  window: {
    hideQuick: (): Promise<void> => ipcRenderer.invoke('window:hideQuick'),
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url),
  },
};

contextBridge.exposeInMainWorld('sparkflow', api);

export type SparkflowApi = typeof api;
