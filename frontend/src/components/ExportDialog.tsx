import { Btn, Dialog } from "./ui";
import type { ExportReport } from "../lib/deps";

export function ExportDialog({
  open,
  busy,
  report,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  report: ExportReport | null;
  onClose: () => void;
}) {
  const hasError = Boolean(report?.errors.length);
  return (
    <Dialog
      open={open}
      title={busy ? "正在导出…" : hasError ? "导出完成（有错误）" : "导出完成"}
      onClose={busy ? () => undefined : onClose}
      width="max-w-[560px]"
      footer={busy ? undefined : <Btn onClick={onClose}>关闭</Btn>}
    >
      <div data-testid="export-dialog">
        {busy && !report ? <div className="py-6 text-center text-muted">正在运行各表 export.ts…</div> : null}
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
