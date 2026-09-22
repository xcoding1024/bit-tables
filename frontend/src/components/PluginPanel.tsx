import { useEffect, useMemo, useState } from "react";
import { Btn, Field, Input } from "./ui";
import {
  PLUGIN_COL_ROW,
  bindingRefText,
  isColRow,
  pluginMatches,
  selectionToRef,
  type PluginBinding,
  type PluginDef,
  type PluginSelection,
} from "../lib/plugins";

export type PluginPick = { kind: "target" } | { kind: "source"; pluginId: string; key: string };

export function PluginPanel({
  tableId,
  sheetId,
  target,
  plugins,
  bindings,
  busy,
  picking,
  pickedRef,
  onStartPick,
  onCancelPick,
  onLocate,
  onBind,
  onUnbind,
  onRecompute,
}: {
  tableId: string;
  sheetId: string;
  target: PluginSelection | null;
  plugins: PluginDef[];
  bindings: PluginBinding[];
  busy?: boolean;
  picking: PluginPick | null;
  pickedRef: { pluginId: string; key: string; ref: string } | null;
  onStartPick: (pick: PluginPick) => void;
  onCancelPick: () => void;
  onLocate: (ref: string) => void;
  onBind: (binding: PluginBinding) => void;
  onUnbind: (binding: PluginBinding) => void;
  onRecompute: () => void;
}) {
  const cell = target?.cells[0] || null;
  const colTarget = target?.mode === "col" || isColRow(cell?.id);
  const targetRef = selectionToRef(target);
  const matched = useMemo(() => {
    if (!cell) return [];
    const sel = { table: tableId, sheet: sheetId, field: cell.field, type: cell.type, widget: cell.widget };
    const bound = findBinding(bindings, sheetId, cell.field, cell.id);
    const list = plugins.filter((p) => pluginMatches(p, sel));
    list.sort((a, b) => {
      const aOn = bound?.plugin === a.id ? 0 : 1;
      const bOn = bound?.plugin === b.id ? 0 : 1;
      return aOn - bOn || a.name.localeCompare(b.name, "zh");
    });
    return list;
  }, [bindings, cell, plugins, sheetId, tableId]);

  if (!cell) {
    return <div className="text-muted">先选中单元格或列</div>;
  }
  if (!matched.length) {
    return (
      <div className="flex flex-col gap-3">
        <RefRow
          label="目标"
          value={targetRef}
          picking={picking?.kind === "target"}
          onLocate={() => onLocate(targetRef)}
          onStartChange={() => onStartPick({ kind: "target" })}
          onDone={onCancelPick}
        />
        <div className="text-muted">当前选区没有可用插件</div>
      </div>
    );
  }

  const bound = findBinding(bindings, sheetId, cell.field, cell.id);

  return (
    <div className="flex flex-col gap-3">
      {picking ? <div className="text-accent">在表格中单击单元格或列表头，可切换表或 sheet</div> : null}
      <RefRow
        label="目标"
        value={targetRef}
        picking={picking?.kind === "target"}
        onLocate={() => onLocate(targetRef)}
        onStartChange={() => onStartPick({ kind: "target" })}
        onDone={onCancelPick}
      />
      {matched.map((plugin) => (
        <PluginCard
          key={`${cell.field}-${cell.id}-${plugin.id}`}
          plugin={plugin}
          tableId={tableId}
          sheetId={sheetId}
          field={cell.field}
          row={colTarget ? PLUGIN_COL_ROW : cell.id}
          binding={bound?.plugin === plugin.id ? bound : undefined}
          otherBound={Boolean(bound && bound.plugin !== plugin.id)}
          busy={busy}
          picking={picking}
          pickedRef={pickedRef}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
          onLocate={onLocate}
          onBind={onBind}
          onUnbind={onUnbind}
        />
      ))}
      <Btn disabled={busy || !bound} onClick={onRecompute}>
        重算
      </Btn>
    </div>
  );
}

function PluginCard({
  plugin,
  tableId,
  sheetId,
  field,
  row,
  binding,
  otherBound,
  busy,
  picking,
  pickedRef,
  onStartPick,
  onCancelPick,
  onLocate,
  onBind,
  onUnbind,
}: {
  plugin: PluginDef;
  tableId: string;
  sheetId: string;
  field: string;
  row: string;
  binding?: PluginBinding;
  otherBound?: boolean;
  busy?: boolean;
  picking: PluginPick | null;
  pickedRef: { pluginId: string; key: string; ref: string } | null;
  onStartPick: (pick: PluginPick) => void;
  onCancelPick: () => void;
  onLocate: (ref: string) => void;
  onBind: (binding: PluginBinding) => void;
  onUnbind: (binding: PluginBinding) => void;
}) {
  const [open, setOpen] = useState(Boolean(binding));
  const [args, setArgs] = useState<Record<string, string>>(() => stringifyArgs(binding?.args));
  const bound = Boolean(binding);
  const kindLabel = plugin.kind === "exclusive" ? "专属" : "通用";
  const targetText = bindingRefText(tableId, sheetId, field, row);
  const sourceParam = (plugin.params || []).find((p) => p.type === "ref");
  const sourceText = sourceParam ? args[sourceParam.key] || "" : "";

  useEffect(() => {
    if (!pickedRef || pickedRef.pluginId !== plugin.id) return;
    setArgs((prev) => ({ ...prev, [pickedRef.key]: pickedRef.ref }));
    setOpen(true);
  }, [pickedRef, plugin.id]);

  const apply = () => {
    const next: Record<string, unknown> = {};
    for (const param of plugin.params || []) {
      const raw = args[param.key] ?? "";
      next[param.key] = param.type === "number" ? Number(raw) : raw;
    }
    onCancelPick();
    onBind({
      sheet: sheetId,
      row,
      field,
      plugin: plugin.id,
      args: next,
    });
  };

  return (
    <section className="rounded border border-line bg-bg px-2 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
        data-testid={`plugin-card-${plugin.id}`}
      >
        <span>
          {plugin.name}
          <span className="ml-2 text-muted">{kindLabel}</span>
        </span>
        <span className="text-muted">{bound ? "已绑定" : open ? "收起" : "展开"}</span>
      </button>
      {!open && bound ? (
        <div className="mt-2 flex flex-col gap-1 text-muted">
          <BoundLine label="目标" value={targetText} onLocate={() => onLocate(targetText)} />
          {sourceParam ? <BoundLine label="来源" value={sourceText} onLocate={() => onLocate(sourceText)} /> : null}
        </div>
      ) : null}
      {open ? (
        <div className="mt-2">
          {(plugin.params || []).map((param) => {
            const pickingThis = picking?.kind === "source" && picking.pluginId === plugin.id && picking.key === param.key;
            if (param.type === "ref") {
              return (
                <RefRow
                  key={param.key}
                  label={param.label || "来源"}
                  value={args[param.key] ?? ""}
                  picking={pickingThis}
                  placeholder="表.sheet!字段 或 表.sheet!字段[行id]"
                  testId={`plugin-arg-${plugin.id}-${param.key}`}
                  onChangeValue={(value) => setArgs((prev) => ({ ...prev, [param.key]: value }))}
                  onLocate={() => onLocate(args[param.key] ?? "")}
                  onStartChange={() => onStartPick({ kind: "source", pluginId: plugin.id, key: param.key })}
                  onDone={onCancelPick}
                />
              );
            }
            return (
              <Field key={param.key} label={param.label || param.key}>
                <Input
                  data-testid={`plugin-arg-${plugin.id}-${param.key}`}
                  value={args[param.key] ?? ""}
                  onChange={(ev) => setArgs((prev) => ({ ...prev, [param.key]: ev.target.value }))}
                />
              </Field>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" disabled={busy} onClick={apply}>
              {bound ? "应用" : otherBound ? "换绑" : "绑定"}
            </Btn>
            {bound ? (
              <Btn
                disabled={busy}
                onClick={() => {
                  onCancelPick();
                  onUnbind({
                    sheet: sheetId,
                    row: binding?.row || row,
                    field,
                    plugin: plugin.id,
                    args: binding?.args,
                  });
                }}
              >
                解除绑定
              </Btn>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RefRow({
  label,
  value,
  picking,
  placeholder,
  testId,
  onChangeValue,
  onLocate,
  onStartChange,
  onDone,
}: {
  label: string;
  value: string;
  picking: boolean;
  placeholder?: string;
  testId?: string;
  onChangeValue?: (value: string) => void;
  onLocate: () => void;
  onStartChange: () => void;
  onDone: () => void;
}) {
  return (
    <Field label={label} hint={picking ? "单击单元格或列表头" : undefined}>
      <div className="flex gap-1">
        <Input
          data-testid={testId}
          value={value}
          readOnly={!onChangeValue}
          onChange={onChangeValue ? (ev) => onChangeValue(ev.target.value) : undefined}
          onFocus={onChangeValue ? onStartChange : undefined}
          placeholder={placeholder}
          className={picking ? "border-accent" : ""}
        />
        <Btn disabled={!value} onClick={onLocate}>
          选中
        </Btn>
        {picking ? <Btn onClick={onDone}>完成</Btn> : <Btn onClick={onStartChange}>更改</Btn>}
      </div>
    </Field>
  );
}

function BoundLine({ label, value, onLocate }: { label: string; value: string; onLocate: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1 truncate" title={value}>
        {value || "—"}
      </span>
      <Btn disabled={!value} onClick={onLocate}>
        选中
      </Btn>
    </div>
  );
}

function findBinding(bindings: PluginBinding[], sheet: string, field: string, row: string): PluginBinding | undefined {
  const col = bindings.find((b) => b.sheet === sheet && b.field === field && isColRow(b.row));
  if (isColRow(row)) return col;
  return bindings.find((b) => b.sheet === sheet && b.field === field && b.row === row) || col;
}

function stringifyArgs(args?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args || {})) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}
