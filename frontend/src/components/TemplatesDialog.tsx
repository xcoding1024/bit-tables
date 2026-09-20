import { useState, type ReactNode } from "react";
import { Btn, Dialog } from "./ui";

type EditorTemplate = {
  id: string;
  name: string;
  summary: string;
  demoTable: string;
  importHint: string;
  usage: string[];
  preview: ReactNode;
};

const TEMPLATES: EditorTemplate[] = [
  {
    id: "table",
    name: "表格",
    summary: "行列网格控件：表头筛选、横向滚动、勾选批量改删、单元格内联编辑。",
    demoTable: "sheet_demo.items",
    importHint: 'import { BitTableEditorBase } from "bit-tables.editor";\nimport type { ParamField, Row } from "bit-tables.types";',
    usage: [
      "配表根上一级放 src/（如 demo/src），表脚本即可 import \"bit-tables.*\"。",
      "sheet 设 view: table（默认）；按需打开 enableColFilters / enableTableScroll。表格默认只读；单击或拖拽框选，Ctrl+C / Ctrl+V 复制粘贴；双击单元格编辑；可选择每页行数，默认 100。",
      "复杂对象字段用 widget: params，在子类实现 paramsSchema / paramsTitle / formatParamValue。",
      "参考 sheet_demo 的 items sheet。",
    ],
    preview: <TablePreview />,
  },
  {
    id: "card",
    name: "卡片",
    summary: "按行分块的表单控件：分组字段网格、适合字段多、阅读优先的编辑。",
    demoTable: "sheet_demo.packs",
    importHint: 'import { BitTableEditorBase } from "bit-tables.editor";',
    usage: [
      "sheet 设 view: card，编辑器按卡片渲染分组表单。",
      "字段来自 sheet.fields；字段上的 group + 编辑器 groupNames 决定分组标题。",
      "参考 sheet_demo 的 packs sheet。",
    ],
    preview: <CardPreview />,
  },
  {
    id: "enum",
    name: "枚举编辑器",
    summary: "薄包装表格，专用于 kind: enum 的 id / name 维护与跨表引用。",
    demoTable: "enum_demo",
    importHint: 'import { BitTableEditorBase } from "bit-tables.editor";',
    usage: [
      "struct 里 sheet 设 kind: enum，字段推荐 id + name。",
      "他表字段用 enum: kinds 或 enum: enum_demo.rarities；存 id，下拉显示 name。",
      "子类通常只改 testPrefix / toolbarHint，并把 idReadonly = false。",
      "参考 enum_demo_editor.ts。",
    ],
    preview: <EnumPreview />,
  },
  {
    id: "chart",
    name: "图表编辑器",
    summary: "上方 SVG 预览（折线 / 柱状 / 饼图），下方仍用表格改数。",
    demoTable: "chart_demo",
    importHint: 'import { BitTableEditorBase } from "bit-tables.editor";\nimport { escapeHtml, num } from "bit-tables.dom";',
    usage: [
      "继承 BitTableEditorBase，重写渲染：先画 SVG 图表，再复用行编辑。",
      "按当前 sheet 字段推断图种（month→折线、category→柱、label→饼）。",
      "数值用 bit-tables.dom 的 num；文案转义用 escapeHtml。",
      "参考 chart_demo_editor.ts。",
    ],
    preview: <ChartPreview />,
  },
  {
    id: "checker",
    name: "检查器基类",
    summary: "按 sheet 遍历校验 required / id / 枚举引用，可挂额外规则。",
    demoTable: "sheet_demo · enum_demo · chart_demo",
    importHint: 'import { BitTableCheckerBase } from "bit-tables.checker";\nimport type { FieldDef, Row } from "bit-tables.types";',
    usage: [
      "继承 BitTableCheckerBase，重写 extraRequired / checkRow 等钩子。",
      "window.BitTableChecker = new YourChecker()；宿主调用 check(data, struct, enums)。",
      "错误路径形如 sheets.items.rows.0.id。",
      "参考各演示表的 *_checker.ts。",
    ],
    preview: <CheckerPreview />,
  },
  {
    id: "export",
    name: "导出基类",
    summary: "把整表 data 分别写成客户端与服务端产物。",
    demoTable: "sheet_demo · enum_demo · chart_demo",
    importHint: 'import { BitTableExporterBase } from "bit-tables.export";',
    usage: [
      "继承 BitTableExporterBase，设置 fileName（默认 JSON.stringify 整表 data）。",
      "window.BitTableExporter = new YourExporter()；返回 { client:[{ name, content }], server:[{ name, content }] }。",
      "可用 clientFileName / serverFileName 区分两端文件名；需要不同内容时重写 export。",
      "产物写入配表根上一级 build/client 与 build/server。",
    ],
    preview: <ExportPreview />,
  },
];

export function TemplatesDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState(TEMPLATES[0]?.id || "");
  const selected = TEMPLATES.find((item) => item.id === activeId) || TEMPLATES[0] || null;

  return (
    <Dialog
      open={open}
      title="编辑模板"
      onClose={onClose}
      width="max-w-[820px]"
      footer={<Btn onClick={onClose}>关闭</Btn>}
    >
      <div className="mb-2 text-[12px] text-muted">
        可复用控件与基类。实现在配表根上一级{" "}
        <span className="font-mono text-secondary">src/</span>
        ，用 <span className="font-mono text-secondary">bit-tables.*</span> 引用。
      </div>
      <div className="flex min-h-[380px] gap-3" data-testid="templates-browser">
        <div className="w-[200px] shrink-0 overflow-auto rounded border border-line">
          {TEMPLATES.map((item) => {
            const active = selected?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`templates-item-${item.id}`}
                className={`block w-full border-b border-line px-2 py-2 text-left last:border-b-0 ${
                  active ? "bg-active text-ink" : "hover:bg-hover"
                }`}
                onClick={() => setActiveId(item.id)}
              >
                <div className="truncate text-[13px]">{item.name}</div>
                <div className="truncate font-mono text-[11px] text-muted">{item.id}</div>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 overflow-auto rounded border border-line">
          {!selected ? (
            <div className="p-3 text-muted">选择左侧模板</div>
          ) : (
            <div className="space-y-3 p-3" data-testid={`templates-detail-${selected.id}`}>
              <div>
                <div className="text-[15px] font-medium">{selected.name}</div>
                <div className="mt-1 text-[13px] text-secondary">{selected.summary}</div>
                <div className="mt-1 font-mono text-[11px] text-muted">示例表：{selected.demoTable}</div>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] text-muted">预览</div>
                <div className="overflow-hidden rounded border border-line bg-bg p-2">{selected.preview}</div>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] text-muted">引用</div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-line bg-bg px-2 py-1.5 font-mono text-[12px] text-secondary">
                  {selected.importHint}
                </pre>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] text-muted">使用说明</div>
                <ul className="list-disc space-y-1 pl-4 text-[13px] text-secondary">
                  {selected.usage.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function TablePreview() {
  return (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center gap-2 text-muted">
        <span className="rounded bg-active px-1.5 py-0.5 text-ink">表格</span>
        <span className="ml-auto">表头漏斗 · 已选 1 行</span>
      </div>
      <div className="overflow-hidden rounded border border-line">
        <div className="grid grid-cols-[28px_1fr_1fr_1fr] border-b border-line bg-elevated text-muted">
          <div className="px-1 py-1">☐</div>
          <div className="px-1 py-1">id ▾</div>
          <div className="px-1 py-1">名称</div>
          <div className="px-1 py-1">分类</div>
        </div>
        {[
          ["☑", "sword", "铁剑", "武器"],
          ["☐", "potion", "药水", "消耗"],
          ["☐", "ore", "矿石", "材料"],
        ].map((row) => (
          <div key={row[1]} className="grid grid-cols-[28px_1fr_1fr_1fr] border-b border-line last:border-b-0">
            {row.map((cell) => (
              <div key={`${row[1]}-${cell}`} className="truncate px-1 py-1 text-secondary">
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardPreview() {
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center gap-2 text-muted">
        <span className="rounded bg-active px-1.5 py-0.5 text-ink">卡片</span>
        <span className="ml-auto">按行分块 · 分组表单</span>
      </div>
      {[
        { id: "sword", name: "铁剑", kind: "武器" },
        { id: "potion", name: "药水", kind: "消耗" },
      ].map((row) => (
        <div key={row.id} className="overflow-hidden rounded border border-line bg-elevated">
          <div className="flex items-center justify-between border-b border-line px-2 py-1.5 font-mono text-secondary">
            <span>
              ☐ {row.id} · {row.name}
            </span>
            <span className="text-danger">删除</span>
          </div>
          <div className="grid grid-cols-2 gap-2 p-2">
            <div>
              <div className="mb-0.5 text-muted">名称</div>
              <div className="rounded border border-line bg-bg px-1.5 py-1 text-secondary">{row.name}</div>
            </div>
            <div>
              <div className="mb-0.5 text-muted">分类</div>
              <div className="rounded border border-line bg-bg px-1.5 py-1 text-secondary">{row.kind}</div>
            </div>
            <div className="col-span-2">
              <div className="mb-0.5 text-muted">基础信息</div>
              <div className="rounded border border-dashed border-line px-1.5 py-2 text-muted">分组字段网格…</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EnumPreview() {
  return (
    <div className="overflow-hidden rounded border border-line text-[11px]">
      <div className="grid grid-cols-[28px_1fr_1fr] border-b border-line bg-elevated text-muted">
        <div className="px-1 py-1">☐</div>
        <div className="px-1 py-1">id</div>
        <div className="px-1 py-1">名称</div>
      </div>
      {[
        ["common", "普通"],
        ["rare", "稀有"],
        ["epic", "史诗"],
      ].map(([id, name]) => (
        <div key={id} className="grid grid-cols-[28px_1fr_1fr] border-b border-line last:border-b-0">
          <div className="px-1 py-1 text-secondary">☐</div>
          <div className="px-1 py-1 font-mono text-secondary">{id}</div>
          <div className="px-1 py-1 text-secondary">{name}</div>
        </div>
      ))}
    </div>
  );
}

function ChartPreview() {
  return (
    <div className="space-y-2 text-[11px]">
      <svg viewBox="0 0 240 88" className="h-[88px] w-full rounded bg-[#111]" aria-hidden>
        <polyline
          fill="none"
          stroke="#3794ff"
          strokeWidth="2"
          points="20,68 60,42 100,50 140,28 180,36 220,18"
        />
        {[20, 60, 100, 140, 180, 220].map((x, i) => (
          <circle key={x} cx={x} cy={[68, 42, 50, 28, 36, 18][i]} r="3" fill="#3794ff" />
        ))}
        <text x="120" y="82" textAnchor="middle" fill="#737373" fontSize="10">
          折线预览 · 下行可改数
        </text>
      </svg>
      <div className="grid grid-cols-2 gap-1 font-mono text-muted">
        <div className="rounded border border-line px-1 py-0.5">1月 → 12</div>
        <div className="rounded border border-line px-1 py-0.5">2月 → 18</div>
      </div>
    </div>
  );
}

function CheckerPreview() {
  return (
    <div className="space-y-1 rounded border border-line bg-elevated p-2 font-mono text-[11px]">
      <div className="text-danger">sheets.items.rows.0.id · id 不能为空</div>
      <div className="text-danger">sheets.items.rows.1.kind · 不在枚举 kinds 中</div>
      <div className="text-success">ok: false · errors: 2</div>
    </div>
  );
}

function ExportPreview() {
  return (
    <div className="space-y-2 rounded border border-line bg-elevated p-2 font-mono text-[11px] text-secondary">
      <div>
        <div className="text-muted">client[0]</div>
        <div>name: sheet_demo.json</div>
        <div className="truncate">{'→ build/client/'}</div>
      </div>
      <div>
        <div className="text-muted">server[0]</div>
        <div>name: sheet_demo.json</div>
        <div className="truncate">{'→ build/server/'}</div>
      </div>
    </div>
  );
}
