import { Btn, Dialog } from "./ui";
import type { ExportProgress, ExportReport } from "../lib/deps";

export function ExportDialog({
  open,
  busy,
  progress,
  report,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  progress?: ExportProgress | null;
  report: ExportReport | null;
  onClose: () => void;
}) {
  const hasError = Boolean(report?.errors.length);
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const running = progress?.running ?? [];
  return (
    <Dialog
      open={open}
      title={busy ? "正在导出…" : hasError ? "导出完成（有错误）" : "导出完成"}
      onClose={busy ? () => undefined : onClose}
      width="max-w-[560px]"
      footer={busy ? undefined : <Btn onClick={onClose}>关闭</Btn>}
    >
      <div data-testid="export-dialog">
        {busy ? (
          <div data-testid="export-progress" className="space-y-2 py-2 text-[13px]">
            <div className="text-secondary">
              已完成 {done} / {total}
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-hover">
              <div
                className="h-full bg-accent"
                style={{ width: total ? `${Math.round((done / total) * 100)}%` : "0%" }}
              />
            </div>
            {progress?.writing ? (
              <div className="text-muted">正在写入文件</div>
            ) : running.length ? (
              <div className="truncate font-mono text-[12px] text-muted">正在导出 {running.join("、")}</div>
            ) : (
              <div className="text-muted">正在准备…</div>
            )}
          </div>
        ) : null}
        {report ? (
          <div className="space-y-3 text-[13px]">
            {report.clientPath || report.serverPath ? (
              <div>
                <div className="text-muted">产物目录</div>
                {report.clientPath ? (
                  <div className="mt-0.5 break-all font-mono text-[12px] text-secondary" data-testid="export-path-client">
                    客户端 {report.clientPath}
                  </div>
                ) : null}
                {report.serverPath ? (
                  <div className="mt-0.5 break-all font-mono text-[12px] text-secondary" data-testid="export-path-server">
                    服务端 {report.serverPath}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <div className="text-muted">导出的表</div>
              <div className="mt-0.5 font-mono text-[12px] text-secondary">
                {report.tableIds.length ? report.tableIds.join("、") : "无"}
              </div>
            </div>
            {report.written.length ? (
              <div>
                <div className="text-muted">写入文件</div>
                <ul className="mt-1 list-disc pl-5 text-secondary">
                  {report.written.map((item) => (
                    <li key={`${item.side}-${item.tableId}-${item.name}`}>
                      <span className="font-mono">{item.side}/{item.name}</span>
                      <span className="text-muted">（{item.tableId}）</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-muted">没有写入文件</div>
            )}
            {report.skipped.length ? (
              <div>
                <div className="text-muted">跳过</div>
                <ul className="mt-1 list-disc pl-5 text-secondary">
                  {report.skipped.map((item) => (
                    <li key={item.tableId}>
                      <span className="font-mono">{item.tableId}</span>：{item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.errors.length ? (
              <div data-testid="export-errors">
                <div className="text-danger">错误</div>
                <ul className="mt-1 list-disc pl-5 text-danger">
                  {report.errors.map((item, index) => (
                    <li key={`${item.tableId}-${index}`}>
                      {item.tableId ? <span className="font-mono">{item.tableId}：</span> : null}
                      {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
