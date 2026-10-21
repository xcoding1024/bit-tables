import { withWindowRoot } from "./tableWindow";
import type { ExcelWorkbook } from "./excel";
export type TableInfo = {
  id: string;
  name?: string;
  path?: string;
  hasStruct: boolean;
  hasData: boolean;
  hasEditor: boolean;
  hasChecker: boolean;
  hasExport: boolean;
  hasDocs: boolean;
  complete: boolean;
};

export type TreeNode = {
  name: string;
  path: string;
  kind: "dir" | "table";
  table?: TableInfo;
  children?: TreeNode[];
};

export type TableFiles = TableInfo & {
  excel?: ExcelWorkbook[];
  struct: string;
  data: string;
  editor: string;
  checker: string;
  export: string;
  docs: string;
  plugins?: string;
  plugin?: string;
};

export type HistoryKind = "struct" | "check" | "export" | "data";

export type HistoryEntry = {
  id: string;
  author: string;
  when: string;
  message: string;
  kinds: HistoryKind[];
};

export type TableHistory = {
  id: string;
  vcs: "git" | "svn" | "";
  entries: HistoryEntry[];
  error?: string;
};

export type TableSnapshot = {
  vcs: "git" | "svn";
  revision: string;
  struct: string | null;
  data: string | null;
  fileRevisions?: Record<string, string>;
};

export type RootInfo = {
  path: string;
  guide?: boolean;
};

function api<T>(path: string, opt?: RequestInit): Promise<T> {
  return request<T>(withWindowRoot(path), opt);
}

async function request<T>(path: string, opt?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opt,
  });
  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("json")) {
    const body = (await res.json()) as {
      ok: boolean;
      data?: T;
      error?: { message?: string };
    };
    if (!body.ok) {
      throw new Error(body.error?.message || res.statusText);
    }
    return body.data as T;
  }
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return (await res.text()) as T;
}

export type ExportWriteFile = { name: string; content: string };

export type ExportInfo = { client: string; server: string };

export type ExportWriteResult = {
  client: string;
  server: string;
  written: { side: "client" | "server"; name: string }[];
};

export const tablesApi = {
  rendererReader: (id: string) => {
    const url = withWindowRoot(`/api/tables/${encodeURIComponent(id)}/renderer`);
    return (revision: string, signal?: AbortSignal) => request<{ html: string }>(`${url}${url.includes("?") ? "&" : "?"}revision=${encodeURIComponent(revision)}`, { signal });
  },
  comparisonAssetBase: (id: string) => withWindowRoot(`/api/tables/${encodeURIComponent(id)}/asset`) + (withWindowRoot(`/api/tables/${encodeURIComponent(id)}/asset`).includes("?") ? "" : "?comparison=1"),
  snapshotReader: (id: string) => {
    const url = withWindowRoot(`/api/tables/${encodeURIComponent(id)}/snapshot`);
    return (revision: string, signal?: AbortSignal) => request<TableSnapshot>(`${url}${url.includes("?") ? "&" : "?"}revision=${encodeURIComponent(revision)}`, { signal });
  },
  excelHashes: (id: string) => api<{ excel?: ExcelWorkbook[] }>(`/api/tables/${encodeURIComponent(id)}/files?view=excel-hashes`),
  root: () => api<RootInfo>("/api/root"),
  setRoot: (path: string, opts?: { sample?: boolean; guide?: boolean }) =>
    api<RootInfo>("/api/root", {
      method: "PUT",
      body: JSON.stringify({ path, sample: Boolean(opts?.sample), guide: Boolean(opts?.guide) }),
    }),
  list: () => api<{ tables: TableInfo[]; tree?: TreeNode[]; path: string }>("/api/tables"),
  create: (id: string) =>
    api<TableInfo>("/api/tables", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  files: (id: string) => api<TableFiles>(`/api/tables/${encodeURIComponent(id)}/files`),
  exportSource: (id: string) =>
    api<{ struct: string; data: string; export: string; hasExport: boolean }>(
      `/api/tables/${encodeURIComponent(id)}/files?view=export`,
    ),
  history: (id: string) => api<TableHistory>(`/api/tables/${encodeURIComponent(id)}/history`),
  putData: (id: string, data: string) =>
    api<{ id: string; data: string }>(`/api/tables/${encodeURIComponent(id)}/data`, {
      method: "PUT",
      body: JSON.stringify({ data }),
    }),
  stateWriter: (id: string) => {
    const url = withWindowRoot(`/api/tables/${encodeURIComponent(id)}/state`);
    return (data: string, plugins: string) => request<{ id: string; data: string; plugins: string }>(url, { method: "PUT", body: JSON.stringify({ data, plugins }) });
  },
  putPlugins: (id: string, plugins: string) =>
    api<{ id: string; plugins: string }>(`/api/tables/${encodeURIComponent(id)}/plugins`, {
      method: "PUT",
      body: JSON.stringify({ plugins }),
    }),
  plugins: () => api<{ script: string }>("/api/plugins"),
  editorURL: (id: string, key: number) => withWindowRoot(`/api/tables/${encodeURIComponent(id)}/editor?t=${key}`),
  eventsURL: () => withWindowRoot("/api/events"),
  exportInfo: () => api<ExportInfo>("/api/export"),
  writeExport: (payload: { client: ExportWriteFile[]; server: ExportWriteFile[] }) =>
    api<ExportWriteResult>("/api/export", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
