/// <reference types="vite/client" />

export type BitTablesShell = {
  platform: string;
  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };
  pickDirectory: () => Promise<string>;
  openRoot: (dir: string) => Promise<void>;
  createSample: (parent: string, name: string) => Promise<void>;
};

declare global {
  interface Window {
    bitTablesShell?: BitTablesShell;
  }
}

export {};
