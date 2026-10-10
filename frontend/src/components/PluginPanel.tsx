import { useEffect, useMemo, useState } from "react";
import { Btn, Field, Input } from "./ui";
import { PLUGIN_COL_ROW, bindingRefText, isColRow, pluginMatches, selectionToRef, type PluginBinding, type PluginDef, type PluginSelection } from "../lib/plugins";

export type PluginPick = { kind: "source"; pluginId: string; key: string };
export type PluginSource = { ref: string; label: string };
type PickedRef = { pluginId: string; key: string; ref: string } | null;

type PanelProps = {
  tableId: string;
  sheetId: string;
  target: PluginSelection | null;
  plugins: PluginDef[];
  bindings: PluginBinding[];
  busy?: boolean;
  picking: PluginPick | null;
  pickedRef: PickedRef;
  onStartPick: (pick: PluginPick) => void;
  onCancelPick: () => void;
  onFinishPick: () => void;
  onSourcesChange: (sources: PluginSource[], pluginId?: string) => void;
  onLocate: (ref: string) => void;
  onBind: (binding: PluginBinding) => void;
  onUnbind: (binding: PluginBinding) => void;
  onRecompute: () => void;
};

export function PluginPanel(props: PanelProps) {
  const { tableId, sheetId, target, plugins, bindings, picking, busy, onLocate, onSourcesChange } = props;
  const cell = target?.cells[0];
  const bound = cell ? findBinding(bindings, sheetId, cell.field, cell.id) : undefined;
  const [activePlugin, setActivePlugin] = useState(bound?.plugin || "");
  const matched = useMemo(() => {
    if (!cell) return [];
    return plugins.filter((p) => pluginMatches(p, { table: tableId, sheet: sheetId, field: cell.field, type: cell.type, widget: cell.widget }))
      .sort((a, b) => Number(b.id === bound?.plugin) - Number(a.id === bound?.plugin) || a.name.localeCompare(b.name, "zh"));
  }, [plugins, tableId, sheetId, cell, bound?.plugin]);
  useEffect(() => {
    if (bound) setActivePlugin(bound.plugin);
  }, [bound?.plugin]);
  useEffect(() => {
    if (!activePlugin) onSourcesChange([]);
  }, [activePlugin, onSourcesChange]);
  if (!cell) return <div className="text-muted">先选中单元格或列</div>;
  return (
    <div className="flex flex-col gap-3" data-testid="plugin-panel">
      {picking ? <div className="text-accent" data-testid="plugin-pick-mode">选择来源：可拖拽框选或选列，目标已锁定</div> : null}
      <Field label="目标">
        <div className="flex gap-1">
          <Input data-testid="plugin-target" style={{ minWidth: 0, flex: "1 1 0%" }} value={selectionToRef(target)} title={selectionToRef(target)} readOnly />
          {!picking ? <Btn className="shrink-0" onClick={() => onLocate(selectionToRef(target))}>选中</Btn> : null}
        </div>
      </Field>
      {!matched.length ? <div className="text-muted">当前选区没有可用插件</div> : null}
      {matched.map((plugin) => (
        <PluginCard key={plugin.id} {...props} plugin={plugin} field={cell.field}
          row={target?.mode === "col" || isColRow(cell.id) ? PLUGIN_COL_ROW : cell.id}
          binding={bound?.plugin === plugin.id ? bound : undefined}
          otherBound={Boolean(bound && bound.plugin !== plugin.id)}
          open={activePlugin === plugin.id}
          onToggle={() => { onSourcesChange([]); setActivePlugin(activePlugin === plugin.id ? "" : plugin.id); }} />
      ))}
      <Btn disabled={busy || !bound || Boolean(picking)} onClick={props.onRecompute}>重算</Btn>
    </div>
  );
}

function PluginCard({ plugin, tableId, sheetId, field, row, binding, otherBound, busy, picking, pickedRef, open, onToggle,
  onStartPick, onCancelPick, onFinishPick, onSourcesChange, onLocate, onBind, onUnbind }: PanelProps & {
  plugin: PluginDef; field: string; row: string; binding?: PluginBinding; otherBound: boolean; open: boolean; onToggle: () => void;
}) {
  const [args, setArgs] = useState<Record<string, string>>(() => stringifyArgs(binding?.args));
  useEffect(() => { setArgs(stringifyArgs(binding?.args)); }, [binding]);
  const pickingThis = picking?.pluginId === plugin.id;
  const preview = pickingThis && pickedRef?.pluginId === plugin.id && pickedRef.key === picking.key ? pickedRef : null;
  const sources = useMemo(() => (plugin.params || []).filter((p) => p.type === "ref").map((p) => ({
    ref: preview?.key === p.key ? preview.ref : args[p.key] || "",
    label: p.label || p.key,
  })).filter((p) => p.ref), [plugin.params, args, preview]);
  useEffect(() => { if (open) onSourcesChange(sources, plugin.id); }, [open, sources, onSourcesChange, plugin.id]);
  const apply = () => {
    const next: Record<string, unknown> = {};
    for (const p of plugin.params || []) next[p.key] = p.type === "number" ? Number(args[p.key] ?? "") : args[p.key] ?? "";
    onBind({ sheet: sheetId, row, field, plugin: plugin.id, args: next });
  };
  return (
    <section className="rounded border border-line bg-bg px-2 py-2">
      <button type="button" data-testid={`plugin-card-${plugin.id}`} disabled={Boolean(picking)}
        aria-expanded={open} className="flex w-full items-center justify-between text-left disabled:opacity-60" onClick={onToggle}>
        <span>{plugin.name}<span className="ml-2 text-muted">{plugin.kind === "exclusive" ? "专属" : "通用"}</span></span>
        <span className="text-muted">{binding ? "已激活" : open ? "收起" : "展开"}</span>
      </button>
      {!open && binding ? <div className="mt-2 text-muted">目标：{bindingRefText(tableId, sheetId, field, binding.row)}</div> : null}
      {open ? <div className="mt-2" data-testid={`plugin-controls-${plugin.id}`}>
        {(plugin.params || []).map((param) => {
          const selecting = pickingThis && picking.key === param.key;
          if (param.type === "ref") return (
            <Field key={param.key} label={param.label || "来源"} hint={selecting ? "拖拽框选范围，或点击列表头选择列" : undefined}>
              <div className="flex gap-1">
                <Input data-testid={`plugin-arg-${plugin.id}-${param.key}`} style={{ minWidth: 0, flex: "1 1 0%" }} readOnly
                  value={preview?.key === param.key ? preview.ref : args[param.key] || ""} placeholder="点更改选择来源" />
                {!picking ? <Btn className="shrink-0" disabled={!args[param.key]} onClick={() => onLocate(args[param.key])}>选中</Btn> : null}
                {selecting ? <>
                  <Btn className="shrink-0" data-testid="plugin-pick-cancel" onClick={onCancelPick}>取消</Btn>
                  <Btn className="shrink-0" data-testid="plugin-pick-finish" disabled={!preview} onClick={() => {
                    if (!preview) return;
                    setArgs((prev) => ({ ...prev, [param.key]: preview.ref }));
                    onFinishPick();
                  }}>完成</Btn>
                </> : <Btn className="shrink-0" disabled={Boolean(picking) || busy} data-testid={`plugin-change-${plugin.id}-${param.key}`}
                  onClick={() => onStartPick({ kind: "source", pluginId: plugin.id, key: param.key })}>更改</Btn>}
              </div>
            </Field>
          );
          return <Field key={param.key} label={param.label || param.key}>
            <Input data-testid={`plugin-arg-${plugin.id}-${param.key}`} disabled={Boolean(picking) || busy}
              value={args[param.key] ?? ""} onChange={(ev) => setArgs((prev) => ({ ...prev, [param.key]: ev.target.value }))} />
          </Field>;
        })}
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" disabled={busy || Boolean(picking) || (plugin.params || []).some((p) => p.type === "ref" && !args[p.key])}
            data-testid={`plugin-apply-${plugin.id}`} onClick={apply}>{binding ? "应用" : otherBound ? "替换插件" : "激活"}</Btn>
          {binding ? <Btn disabled={busy || Boolean(picking)} data-testid={`plugin-unbind-${plugin.id}`} onClick={() => onUnbind(binding)}>解除绑定</Btn> : null}
        </div>
      </div> : null}
    </section>
  );
}

function findBinding(bindings: PluginBinding[], sheet: string, field: string, row: string) {
  return bindings.find((b) => b.sheet === sheet && b.field === field && b.row === row)
    || bindings.find((b) => b.sheet === sheet && b.field === field && isColRow(b.row));
}
function stringifyArgs(args?: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(args || {}).map(([key, value]) => [key, value == null ? "" : String(value)]));
}
