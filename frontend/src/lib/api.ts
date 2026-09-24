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
};

export type RootInfo = {
  path: string;
  guide?: boolean;
};

async function api<T>(path: string, opt?: RequestInit): Promise<T> {
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
  putPlugins: (id: string, plugins: string) =>
    api<{ id: string; plugins: string }>(`/api/tables/${encodeURIComponent(id)}/plugins`, {
      method: "PUT",
      body: JSON.stringify({ plugins }),
    }),
  plugins: () => api<{ script: string }>("/api/plugins"),
  editorURL: (id: string, key: number) => `/api/tables/${encodeURIComponent(id)}/editor?t=${key}`,
  exportInfo: () => api<ExportInfo>("/api/export"),
  writeExport: (payload: { client: ExportWriteFile[]; server: ExportWriteFile[] }) =>
    api<ExportWriteResult>("/api/export", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
