import { useEffect, useMemo, useState } from "react";
import { Btn, Field, Input } from "./ui";
import type { PluginBinding, PluginDef, PluginSelection } from "../lib/plugins";
import { pluginMatches } from "../lib/plugins";

export type PluginPick = { pluginId: string; key: string };

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
  onStartPick: (pluginId: string, key: string) => void;
  onCancelPick: () => void;
  onBind: (binding: PluginBinding) => void;
  onUnbind: (binding: PluginBinding) => void;
  onRecompute: () => void;
}) {
  const cell = target?.tableId === tableId && target.sheet === sheetId ? target.cells[0] : null;
  const matched = useMemo(() => {
    if (!cell) return [];
    const sel = { table: tableId, sheet: sheetId, field: cell.field, type: cell.type, widget: cell.widget };
    const bound = bindings.find((b) => b.sheet === sheetId && b.row === cell.id && b.field === cell.field);
    const list = plugins.filter((p) => pluginMatches(p, sel));
    list.sort((a, b) => {
      const aOn = bound?.plugin === a.id ? 0 : 1;
      const bOn = bound?.plugin === b.id ? 0 : 1;
      return aOn - bOn || a.name.localeCompare(b.name, "zh");
    });
    return list;
  }, [bindings, cell, plugins, sheetId, tableId]);

  if (!cell) {
    return <div className="text-muted">先选中单元格</div>;
  }
  if (!matched.length) {
    return <div className="text-muted">当前单元格没有可用插件</div>;
  }

  const bound = bindings.find((b) => b.sheet === sheetId && b.row === cell.id && b.field === cell.field);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted">
        {tableId}.{sheetId}!{cell.field}[{cell.id}]
      </div>
      {picking ? <div className="text-accent">在表格中单击选择来源，可切换表或 sheet</div> : null}
      {matched.map((plugin) => (
        <PluginCard
          key={`${cell.id}-${plugin.id}`}
          plugin={plugin}
          cell={cell}
          sheetId={sheetId}
          binding={bound?.plugin === plugin.id ? bound : undefined}
          otherBound={Boolean(bound && bound.plugin !== plugin.id)}
          busy={busy}
          picking={picking}
          pickedRef={pickedRef}
          onStartPick={onStartPick}
          onCancelPick={onCancelPick}
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
  cell,
  sheetId,
  binding,
  otherBound,
  busy,
  picking,
  pickedRef,
  onStartPick,
  onCancelPick,
  onBind,
  onUnbind,
}: {
  plugin: PluginDef;
  cell: { id: string; field: string };
  sheetId: string;
  binding?: PluginBinding;
  otherBound?: boolean;
  busy?: boolean;
  picking: PluginPick | null;
  pickedRef: { pluginId: string; key: string; ref: string } | null;
  onStartPick: (pluginId: string, key: string) => void;
  onCancelPick: () => void;
  onBind: (binding: PluginBinding) => void;
  onUnbind: (binding: PluginBinding) => void;
}) {
  const [open, setOpen] = useState(Boolean(binding));
  const [args, setArgs] = useState<Record<string, string>>(() => stringifyArgs(binding?.args));
  const bound = Boolean(binding);
  const kindLabel = plugin.kind === "exclusive" ? "专属" : "通用";

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
      row: cell.id,
      field: cell.field,
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
      {open ? (
        <div className="mt-2">
          {(plugin.params || []).map((param) => {
            const pickingThis = picking?.pluginId === plugin.id && picking.key === param.key;
            if (param.type === "ref") {
              return (
                <Field key={param.key} label={param.label || param.key} hint={pickingThis ? "单击表格中的单元格" : "点选或粘贴 表.sheet!字段[行id]"}>
                  <div className="flex gap-1">
                    <Input
                      data-testid={`plugin-arg-${plugin.id}-${param.key}`}
                      value={args[param.key] ?? ""}
                      onChange={(ev) => setArgs((prev) => ({ ...prev, [param.key]: ev.target.value }))}
                      onFocus={() => onStartPick(plugin.id, param.key)}
                      placeholder="表.sheet!字段[行id]"
                      className={pickingThis ? "border-accent" : ""}
                    />
                    {pickingThis ? (
                      <Btn onClick={onCancelPick}>完成</Btn>
                    ) : (
                      <Btn onClick={() => onStartPick(plugin.id, param.key)}>点选</Btn>
                    )}
                  </div>
                </Field>
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
                    row: cell.id,
                    field: cell.field,
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

function stringifyArgs(args?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args || {})) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}
