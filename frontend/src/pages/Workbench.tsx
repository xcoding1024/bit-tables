import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Btn, Dialog, Field, Input } from "../components/ui";
import { tablesApi, type TableFiles, type TableInfo } from "../lib/api";
import {
  historySection,
  parseHistoryTurns,
  parseTableDoc,
  runTableChecker,
  stringifyTableDoc,
  type TableCheckError,
} from "../lib/tableHost";

function readTableParam() {
  return new URLSearchParams(location.search).get("table") || "";
}

function writeTableParam(id: string) {
  const next = new URL(location.href);
  if (id) next.searchParams.set("table", id);
  else next.searchParams.delete("table");
  history.replaceState(null, "", next);
}

export default function Workbench({ rootPath }: { rootPath: string }) {
  const [list, setList] = useState<TableInfo[]>([]);
  const [tableId, setTableId] = useState(readTableParam);
  const [files, setFiles] = useState<TableFiles | null>(null);
  const [mode, setMode] = useState<"struct" | "data">("struct");
  const [error, setError] = useState("");
  const [checkOK, setCheckOK] = useState(false);
  const [checkErrors, setCheckErrors] = useState<TableCheckError[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const filesRef = useRef<TableFiles | null>(null);
  filesRef.current = files;
  const turns = parseHistoryTurns(historySection(files?.history || "", mode));

  const runCheck = useCallback(async (next: TableFiles, data?: unknown) => {
    const parsed = data ?? parseTableDoc(next.data);
    let struct: unknown = {};
    if (next.struct) {
      const raw = next.struct.trim();
      if (raw.charAt(0) !== "{" && raw.charAt(0) !== "[") {
        struct = { raw: next.struct };
      } else {
        struct = parseTableDoc(next.struct);
      }
    }
    const result = await runTableChecker(next.checker, parsed, struct);
    setCheckOK(result.ok);
    setCheckErrors(result.ok ? [] : result.errors);
  }, []);

  const loadList = useCallback(async () => {
    const next = await tablesApi.list();
    setList(next.tables || []);
    return next.tables || [];
  }, []);

  const selectTable = useCallback(
    async (id: string, remount: boolean) => {
      setTableId(id);
      writeTableParam(id);
      setError("");
      if (!id) {
        setFiles(null);
        setCheckOK(false);
        setCheckErrors([]);
        return;
      }
      const next = await tablesApi.files(id);
      setFiles(next);
      if (remount) {
        setEditorKey((n) => n + 1);
      } else if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "replaceData", data: parseTableDoc(next.data) }, "*");
      }
      await runCheck(next);
    },
    [runCheck],
  );

  useEffect(() => {
    let cancelled = false;
    loadList()
      .then(async (tables) => {
        if (cancelled) return;
        const current = readTableParam();
        if (current && !tables.some((item) => item.id === current)) {
          await selectTable("", true);
          return;
        }
        if (current) {
          await selectTable(current, true);
          return;
        }
        if (tables.length === 1) {
          await selectTable(tables[0].id, true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [loadList, selectTable]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || ev.source !== frame.contentWindow || !ev.data || typeof ev.data !== "object") return;
      const msg = ev.data as { type?: string; data?: unknown };
      const cur = filesRef.current;
      if (msg.type === "ready" && cur) {
        let struct: unknown = cur.struct;
        try {
          struct = parseTableDoc(cur.struct);
        } catch {
          struct = cur.struct;
        }
        frame.contentWindow?.postMessage(
          { type: "init", tableId: cur.id, struct, data: parseTableDoc(cur.data), theme: "dark" },
          "*",
        );
      } else if (msg.type === "save") {
        if (!cur) return;
        void tablesApi
          .putData(cur.id, stringifyTableDoc(msg.data))
          .then(() => tablesApi.files(cur.id))
          .then((next) => {
            setFiles(next);
            return runCheck(next, msg.data);
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "保存失败");
          });
      } else if (msg.type === "askAI") {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, "*");
        } else {
          setError("请用 Cursor / Codex 直接改表目录中的文件");
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [runCheck, editorKey]);

  useEffect(() => {
    if (!window.EventSource) return;
    const es = new EventSource("/api/events");
    es.addEventListener("file_changed", () => {
      const id = filesRef.current?.id || readTableParam();
      if (!id) {
        void loadList();
        return;
      }
      const prevEditor = filesRef.current?.editor;
      const prevStruct = filesRef.current?.struct;
      void tablesApi
        .files(id)
        .then((next) => {
          setFiles(next);
          if (next.editor !== prevEditor || next.struct !== prevStruct) {
            return selectTable(id, true);
          }
          iframeRef.current?.contentWindow?.postMessage({ type: "replaceData", data: parseTableDoc(next.data) }, "*");
          return runCheck(next);
        })
        .then(() => loadList())
        .catch(() => undefined);
    });
    return () => es.close();
  }, [loadList, runCheck, selectTable]);

  async function handleCreate() {
    const id = newId.trim();
    if (!id) return;
    try {
      await tablesApi.create(id);
      setNewOpen(false);
      setNewId("");
      await loadList();
      await selectTable(id, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[var(--sidebar-width)] shrink-0 flex-col bg-sidebar">
        <div className="border-b border-line px-3 py-2">
          <div className="truncate font-mono text-[11px] text-muted" data-testid="tables-root-current" title={rootPath}>
            {rootPath}
          </div>
        </div>
        <div className="p-3">
          <button
            type="button"
            data-testid="tables-new"
            onClick={() => setNewOpen(true)}
            className="flex h-8 w-full items-center justify-center gap-1 rounded bg-accent text-accent-fg hover:bg-accent-hover"
          >
            <Plus size={14} /> 新建表
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2" data-testid="tables-list">
          {list.length === 0 ? (
            <div className="px-2 py-6 text-center text-muted">暂无配置表</div>
          ) : (
            list.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`tables-item-${item.id}`}
                className={`mb-1 block w-full rounded-md px-2 py-1.5 text-left ${
                  tableId === item.id ? "bg-active" : "hover:bg-hover"
                }`}
                onClick={() => void selectTable(item.id, true).catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "加载失败");
                })}
              >
                <div className="truncate text-[13px]">{item.id}</div>
                {item.complete ? null : <div className="text-[11px] text-muted">四件套不完整</div>}
              </button>
            ))
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {!tableId ? (
          <div className="m-auto text-muted" data-testid="tables-editor-empty">
            选择或新建一张配置表
          </div>
        ) : (
          <>
            {error ? <div className="px-4 pt-2 text-danger">{error}</div> : null}
            {checkOK ? (
              <div className="px-4 pt-2 text-success" data-testid="tables-check-ok">
                检查通过
              </div>
            ) : null}
            {checkErrors.length ? (
              <div className="px-4 pt-2 text-danger" data-testid="tables-check-errors">
                {checkErrors.map((item, i) => (
                  <div key={`${item.path}-${i}`}>
                    {item.path ? `${item.path}：` : ""}
                    {item.message}
                  </div>
                ))}
              </div>
            ) : null}
            <iframe
              ref={iframeRef}
              key={`${tableId}-${editorKey}`}
              data-testid="table-editor-frame"
              title={`${tableId} 编辑器`}
              className="min-h-0 flex-1 border-0 bg-bg"
              sandbox="allow-scripts"
              src={tablesApi.editorURL(tableId, editorKey)}
            />
          </>
        )}
      </section>
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-line">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
          <button
            type="button"
            data-testid="tables-history-struct"
            className={`h-7 rounded px-2 ${mode === "struct" ? "bg-active text-ink" : "text-muted hover:bg-hover"}`}
            onClick={() => setMode("struct")}
          >
            结构
          </button>
          <button
            type="button"
            data-testid="tables-history-data"
            className={`h-7 rounded px-2 ${mode === "data" ? "bg-active text-ink" : "text-muted hover:bg-hover"}`}
            onClick={() => setMode("data")}
          >
            数据
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3" data-testid="tables-history">
          {turns.length === 0 ? (
            <div className="text-muted">暂无{mode === "struct" ? "结构" : "数据"}历史</div>
          ) : (
            turns.map((turn, i) => (
              <div key={`${turn.when}-${i}`} className="mb-4">
                <div className="mb-1 text-[11px] text-muted">
                  {turn.when} · {turn.who}
                </div>
                <div className="whitespace-pre-wrap">
                  {turn.user}
                  {turn.agent ? `\n\n${turn.agent}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-line px-3 py-2 text-muted">改结构或数据请直接编辑表目录文件，或用 Cursor / Codex。</div>
      </aside>

      <Dialog
        open={newOpen}
        title="新建表"
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <Btn onClick={() => setNewOpen(false)}>取消</Btn>
            <Btn variant="primary" data-testid="tables-new-submit" disabled={!newId.trim()} onClick={() => void handleCreate()}>
              创建
            </Btn>
          </>
        }
      >
        <Field label="表 id" hint="小写字母开头，仅字母数字下划线">
          <Input
            data-testid="tables-new-id"
            placeholder="item"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
        </Field>
      </Dialog>
    </div>
  );
}
