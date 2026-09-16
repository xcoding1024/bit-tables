export type TableInfo = {
  id: string;
  hasStruct: boolean;
  hasData: boolean;
  hasEditor: boolean;
  hasChecker: boolean;
  hasExport: boolean;
  hasDocs: boolean;
  complete: boolean;
};

export type TableFiles = TableInfo & {
  struct: string;
  data: string;
  editor: string;
  checker: string;
  export: string;
  docs: string;
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

export const tablesApi = {
  root: () => api<RootInfo>("/api/root"),
  setRoot: (path: string, opts?: { sample?: boolean; guide?: boolean }) =>
    api<RootInfo>("/api/root", {
      method: "PUT",
      body: JSON.stringify({ path, sample: Boolean(opts?.sample), guide: Boolean(opts?.guide) }),
    }),
  list: () => api<{ tables: TableInfo[]; path: string }>("/api/tables"),
  create: (id: string) =>
    api<TableInfo>("/api/tables", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  files: (id: string) => api<TableFiles>(`/api/tables/${encodeURIComponent(id)}/files`),
  putData: (id: string, data: string) =>
    api<{ id: string; data: string }>(`/api/tables/${encodeURIComponent(id)}/data`, {
      method: "PUT",
      body: JSON.stringify({ data }),
    }),
  editorURL: (id: string, key: number) => `/api/tables/${encodeURIComponent(id)}/editor?t=${key}`,
};
