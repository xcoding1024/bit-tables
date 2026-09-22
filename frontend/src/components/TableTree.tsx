import { useState } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, Folder, FolderOpen } from "lucide-react";
import type { TableInfo, TreeNode } from "../lib/api";

function treeFromTables(tables: TableInfo[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, TreeNode>();

  const ensureDir = (path: string, name: string, parent: TreeNode[]) => {
    const hit = folders.get(path);
    if (hit) return hit;
    const node: TreeNode = { name, path, kind: "dir", children: [] };
    folders.set(path, node);
    parent.push(node);
    return node;
  };

  for (const item of tables) {
    const rel = (item.path || item.id).replace(/\\/g, "/");
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let parent = root;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      parent = ensureDir(acc, parts[i], parent).children!;
    }
    parent.push({
      name: parts[parts.length - 1],
      path: rel,
      kind: "table",
      table: item,
    });
  }
  return root;
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .map((node) => (node.children ? { ...node, children: sortNodes(node.children) } : node))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function resolveTree(tree: TreeNode[] | undefined, tables: TableInfo[]): TreeNode[] {
  if (tree && tree.length) return tree;
  if (tables.length) return sortNodes(treeFromTables(tables));
  return tree || [];
}

export function TableTree({
  tree,
  activeId,
  openIds,
  errorCounts,
  expandAll,
  emptyText = "暂无配置表",
  onOpen,
}: {
  tree: TreeNode[];
  activeId: string;
  openIds: string[];
  errorCounts?: Record<string, number>;
  expandAll?: boolean;
  emptyText?: string;
  onOpen: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (tree.length === 0) {
    return <div className="px-2 py-6 text-center text-muted">{emptyText}</div>;
  }

  const render = (nodes: TreeNode[], depth: number) =>
    nodes.map((node) => {
      const pad = { paddingLeft: 8 + depth * 12 };
      if (node.kind === "dir") {
        const closed = expandAll ? false : Boolean(collapsed[node.path]);
        return (
          <div key={node.path}>
            <button
              type="button"
              data-testid={`tables-folder-${node.path}`}
              style={pad}
              className="mb-0.5 flex h-7 w-full items-center gap-1 rounded-md text-left text-muted hover:bg-hover hover:text-ink"
              onClick={() => setCollapsed((prev) => ({ ...prev, [node.path]: !prev[node.path] }))}
            >
              {closed ? <ChevronRight size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
              {closed ? <Folder size={13} className="shrink-0" /> : <FolderOpen size={13} className="shrink-0" />}
              <span className="truncate text-[13px]">{node.name}</span>
            </button>
            {closed ? null : render(node.children || [], depth + 1)}
          </div>
        );
      }
      const item = node.table;
      if (!item) return null;
      const active = activeId === item.id;
      const opened = openIds.includes(item.id);
      return (
        <button
          key={node.path}
          type="button"
          data-testid={`tables-item-${item.id}`}
          style={pad}
          className={`mb-0.5 block w-full rounded-md py-1.5 pr-2 text-left ${
            active ? "bg-active" : opened ? "bg-hover" : "hover:bg-hover"
          }`}
          onClick={() => onOpen(item.id)}
        >
          <div className="flex items-start gap-1">
            <FileSpreadsheet size={13} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              {item.name?.trim() ? (
                <>
                  <div className="truncate text-[13px]">{item.name.trim()}</div>
                  <div className="truncate font-mono text-[11px] text-muted">{item.id}</div>
                </>
              ) : (
                <div className="truncate text-[13px]">{item.id}</div>
              )}
            </div>
            {errorCounts?.[item.id] ? (
              <span
                data-testid={`tables-error-${item.id}`}
                title={`${errorCounts[item.id]} 个错误`}
                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-danger"
              />
            ) : null}
          </div>
          {item.complete ? null : <div className="pl-4 text-[11px] text-muted">五件套不完整</div>}
        </button>
      );
    });

  return <>{render(tree, 0)}</>;
}
