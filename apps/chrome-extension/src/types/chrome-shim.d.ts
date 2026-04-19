// TODO: delete this file after running `pnpm install` — @types/chrome will
// supply the real, exhaustive type definitions for the `chrome.*` globals.
// This shim exists only so `tsc --noEmit` can pass in a fresh checkout before
// dependencies are installed. It is intentionally narrow: it covers just the
// APIs touched by this extension.

declare namespace chrome {
  // ---- chrome.runtime ---------------------------------------------------
  namespace runtime {
    interface MessageSender {
      tab?: chrome.tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
      origin?: string;
    }

    interface InstalledDetails {
      reason: "install" | "update" | "chrome_update" | "shared_module_update";
      previousVersion?: string;
    }

    const lastError: { message?: string } | undefined;
    const id: string;

    function sendMessage<T = unknown, R = unknown>(
      message: T,
      responseCallback?: (response: R) => void
    ): Promise<R>;
    function sendMessage<T = unknown, R = unknown>(
      extensionId: string,
      message: T,
      responseCallback?: (response: R) => void
    ): Promise<R>;
    function openOptionsPage(callback?: () => void): Promise<void>;
    function getURL(path: string): string;

    const onInstalled: {
      addListener(cb: (details: InstalledDetails) => void): void;
    };
    const onMessage: {
      addListener(
        cb: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void
        ) => boolean | void | Promise<unknown>
      ): void;
    };
  }

  // ---- chrome.storage ---------------------------------------------------
  namespace storage {
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }
    interface StorageArea {
      get(
        keys?: string | string[] | Record<string, unknown> | null
      ): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: StorageArea;
    const sync: StorageArea;
    const session: StorageArea;
    const onChanged: {
      addListener(
        cb: (
          changes: Record<string, StorageChange>,
          areaName: "local" | "sync" | "session" | "managed"
        ) => void
      ): void;
    };
  }

  // ---- chrome.tabs ------------------------------------------------------
  namespace tabs {
    interface Tab {
      id?: number;
      index: number;
      windowId: number;
      url?: string;
      title?: string;
      active: boolean;
      pinned: boolean;
      highlighted: boolean;
    }
    function query(queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
      lastFocusedWindow?: boolean;
      windowId?: number;
    }): Promise<Tab[]>;
    function sendMessage<T = unknown, R = unknown>(
      tabId: number,
      message: T
    ): Promise<R>;
  }

  // ---- chrome.contextMenus ---------------------------------------------
  namespace contextMenus {
    type ContextType =
      | "all"
      | "page"
      | "frame"
      | "selection"
      | "link"
      | "editable"
      | "image"
      | "video"
      | "audio";
    interface CreateProperties {
      id?: string;
      title?: string;
      contexts?: ContextType[];
      documentUrlPatterns?: string[];
    }
    interface OnClickData {
      menuItemId: string | number;
      selectionText?: string;
      pageUrl?: string;
      linkUrl?: string;
      frameUrl?: string;
      srcUrl?: string;
      editable: boolean;
    }
    function create(
      props: CreateProperties,
      callback?: () => void
    ): string | number;
    function removeAll(callback?: () => void): Promise<void>;
    const onClicked: {
      addListener(
        cb: (info: OnClickData, tab?: chrome.tabs.Tab) => void
      ): void;
    };
  }

  // ---- chrome.sidePanel -------------------------------------------------
  namespace sidePanel {
    interface PanelOptions {
      tabId?: number;
      path?: string;
      enabled?: boolean;
    }
    interface OpenOptions {
      tabId?: number;
      windowId?: number;
    }
    function setOptions(options: PanelOptions): Promise<void>;
    function setPanelBehavior(behavior: {
      openPanelOnActionClick?: boolean;
    }): Promise<void>;
    function open(options: OpenOptions): Promise<void>;
  }

  // ---- chrome.action ----------------------------------------------------
  namespace action {
    const onClicked: {
      addListener(cb: (tab: chrome.tabs.Tab) => void): void;
    };
  }

  // ---- chrome.scripting -------------------------------------------------
  namespace scripting {
    interface InjectionTarget {
      tabId: number;
      allFrames?: boolean;
      frameIds?: number[];
    }
    interface ScriptInjection<Args extends unknown[] = unknown[], R = unknown> {
      target: InjectionTarget;
      func?: (...args: Args) => R;
      args?: Args;
      files?: string[];
      world?: "ISOLATED" | "MAIN";
    }
    interface InjectionResult<R = unknown> {
      frameId: number;
      result?: R;
    }
    function executeScript<Args extends unknown[], R>(
      injection: ScriptInjection<Args, R>
    ): Promise<InjectionResult<R>[]>;
  }
}
