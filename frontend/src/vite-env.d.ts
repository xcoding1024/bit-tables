/// <reference types="vite/client" />

export type BitTablesShell = {
  platform: string;
  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    toggleFullscreen: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };
  openTableWindow: (target: { rootPath: string; tableId: string }) => Promise<void>;
  pickDirectory: () => Promise<string>;
  rememberRoot: (dir: string) => Promise<string>;
  listRecentRoots: () => Promise<string[]>;
};

declare global {
  interface Window {
    bitTablesShell?: BitTablesShell;
  }
}

export {};
