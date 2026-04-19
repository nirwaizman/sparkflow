// TODO: delete this shim after `pnpm install` populates node_modules with
// `electron`, `vite-plugin-electron`, `vite`, `@vitejs/plugin-react`, and React.
// It exists only so `tsc --noEmit` passes before the workspace has been installed.
// Real types from the `electron` package will take over once it resolves.

declare module 'electron' {
  export const app: any;
  export const ipcMain: any;
  export const globalShortcut: any;
  export const screen: any;
  export const dialog: any;
  export const shell: any;
  export const nativeImage: any;
  export const contextBridge: any;
  export const ipcRenderer: any;
  export const Menu: any;

  // Declared as classes so they can be used as both values and types.
  export class BrowserWindow {
    constructor(opts?: any);
    loadURL(url: string): Promise<void>;
    loadFile(file: string, opts?: any): Promise<void>;
    on(event: string, handler: (...args: any[]) => void): void;
    show(): void;
    hide(): void;
    focus(): void;
    isVisible(): boolean;
    isDestroyed(): boolean;
    setVisibleOnAllWorkspaces(visible: boolean, opts?: any): void;
  }
  export class Tray {
    constructor(icon: any);
    setToolTip(text: string): void;
    setContextMenu(menu: any): void;
    on(event: string, handler: (...args: any[]) => void): void;
  }
}

declare namespace Electron {
  type Event = any;
}

declare module 'vite';
declare module 'vite-plugin-electron';
declare module 'vite-plugin-electron/simple';
declare module '@vitejs/plugin-react';
