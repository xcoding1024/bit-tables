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
  rememberRoot: (dir: string) => Promise<string>;
  createSample: (parent: string, name: string) => Promise<string>;
};

declare global {
  interface Window {
    bitTablesShell?: BitTablesShell;
  }
}

export {};
