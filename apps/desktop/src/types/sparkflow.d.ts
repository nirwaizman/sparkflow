/**
 * Renderer-side ambient types for the preload bridge.
 *
 * We don't import the preload module directly (it lives in the main-process build),
 * so we redeclare the shape here.
 */

export type Prefs = {
  backendUrl: string;
  apiToken: string;
  workspaceFolder: string;
  autoLaunch: boolean;
  sessionCookie?: string;
};

export type SparkflowApi = {
  prefs: {
    get(): Promise<Prefs>;
    set(patch: Partial<Prefs>): Promise<Prefs>;
    pickFolder(): Promise<string | null>;
  };
  fs: {
    read(p: string): Promise<string>;
    writeSafe(p: string, contents: string): Promise<{ ok: true; path: string }>;
  };
  chat: {
    stream(args: { prompt: string; signal?: AbortSignal }): AsyncGenerator<string, void, void>;
    uploadFiles(files: File[]): Promise<unknown>;
  };
  window: { hideQuick(): Promise<void> };
  shell: { openExternal(url: string): Promise<void> };
};

declare global {
  interface Window {
    sparkflow: SparkflowApi;
  }
}

export {};
