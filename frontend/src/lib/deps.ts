import { collectEnumRefs, parseEnumRef } from "./tableHost";

export type TableSnap = { id: string; struct: unknown };

export type DepEdge = {
  from: string;
  to: string;
  refs: string[];
};

export type DepNode = {
  id: string;
  name: string;
  refs: string[];
  dependents: string[];
};

export type DepGraph = {
  nodes: DepNode[];
  edges: DepEdge[];
};

export type DepLayoutNode = DepNode & {
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
};

export type DepLayoutEdge = DepEdge & { path: string };

export type DepLayout = {
  width: number;
  height: number;
  nodes: DepLayoutNode[];
  edges: DepLayoutEdge[];
};

export type ExportReport = {
  path: string;
  tableIds: string[];
  written: { tableId: string; name: string }[];
  skipped: { tableId: string; reason: string }[];
  errors: { tableId: string; message: string }[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function tableDisplayName(struct: unknown, id: string): string {
  const rec = asRecord(struct);
  const name = String(rec?.name || "").trim();
  return name || id;
}

export function emptyExportReport(partial?: Partial<ExportReport>): ExportReport {
  return {
    path: "",
    tableIds: [],
    written: [],
    skipped: [],
    errors: [],
    ...partial,
  };
}

export function buildDepGraph(tables: TableSnap[]): DepGraph {
  const ids = new Set<string>();
  const nameById = new Map<string, string>();
  for (const table of tables) {
    const id = String(table.id || "").trim();
    if (!id) continue;
    ids.add(id);
    nameById.set(id, tableDisplayName(table.struct, id));
  }

  const edgeMap = new Map<string, DepEdge>();
  for (const table of tables) {
    const from = String(table.id || "").trim();
    if (!from || !ids.has(from)) continue;
    for (const ref of collectEnumRefs(table.struct)) {
      const parsed = parseEnumRef(ref, from);
      if (!parsed) continue;
      const to = parsed.tableId;
      if (to === from || !ids.has(to)) continue;
      const key = `${from}\0${to}`;
      const hit = edgeMap.get(key);
      if (hit) {
        if (!hit.refs.includes(ref)) hit.refs.push(ref);
      } else {
        edgeMap.set(key, { from, to, refs: [ref] });
      }
    }
  }

  const refsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const id of ids) {
    refsOf.set(id, []);
    dependentsOf.set(id, []);
  }
  const edges = [...edgeMap.values()].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });
  for (const edge of edges) {
    edge.refs.sort();
    const refs = refsOf.get(edge.from);
    if (refs && !refs.includes(edge.to)) refs.push(edge.to);
    const dependents = dependentsOf.get(edge.to);
    if (dependents && !dependents.includes(edge.from)) dependents.push(edge.from);
  }

  const nodes: DepNode[] = [...ids]
    .sort()
    .map((id) => ({
      id,
      name: nameById.get(id) || id,
      refs: (refsOf.get(id) || []).slice().sort(),
      dependents: (dependentsOf.get(id) || []).slice().sort(),
    }));

  return { nodes, edges };
}

export function exportSet(graph: DepGraph, tableId: string): string[] {
  const id = String(tableId || "").trim();
  if (!id) return [];
  const dependents = new Map<string, string[]>();
  for (const node of graph.nodes) dependents.set(node.id, []);
  for (const edge of graph.edges) {
    const list = dependents.get(edge.to) || [];
    if (!list.includes(edge.from)) list.push(edge.from);
    dependents.set(edge.to, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (cur: string) => {
    if (seen.has(cur)) return;
    seen.add(cur);
    out.push(cur);
    for (const dep of dependents.get(cur) || []) visit(dep);
  };
  visit(id);
  return out.sort();
}

const NODE_W = 156;
const NODE_H = 48;
const COL_GAP = 88;
const ROW_GAP = 28;
const PAD = 28;

export function layoutDepGraph(graph: DepGraph): DepLayout {
  const rankMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) outgoing.set(node.id, node.refs.slice());

  function rankOf(id: string): number {
    const cached = rankMemo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const next = outgoing.get(id) || [];
    let rank = 0;
    for (const to of next) {
      rank = Math.max(rank, rankOf(to) + 1);
    }
    visiting.delete(id);
    rankMemo.set(id, rank);
    return rank;
  }

  const columns = new Map<number, DepNode[]>();
  let maxRank = 0;
  for (const node of graph.nodes) {
    const rank = rankOf(node.id);
    maxRank = Math.max(maxRank, rank);
    const col = columns.get(rank) || [];
    col.push(node);
    columns.set(rank, col);
  }
  for (const col of columns.values()) {
    col.sort((a, b) => a.id.localeCompare(b.id));
  }

  const placed = new Map<string, DepLayoutNode>();
  let maxRows = 1;
  for (const [rank, col] of columns) {
    maxRows = Math.max(maxRows, col.length);
    col.forEach((node, index) => {
      placed.set(node.id, {
        ...node,
        rank,
        w: NODE_W,
        h: NODE_H,
        x: PAD + rank * (NODE_W + COL_GAP),
        y: PAD + index * (NODE_H + ROW_GAP),
      });
    });
  }

  const layoutNodes = graph.nodes
    .map((node) => placed.get(node.id))
    .filter((item): item is DepLayoutNode => Boolean(item));

  const layoutEdges: DepLayoutEdge[] = graph.edges.map((edge) => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) return { ...edge, path: "" };
    const x1 = from.x;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w;
    const y2 = to.y + to.h / 2;
    const dx = Math.max(40, Math.abs(x1 - x2) / 2);
    return {
      ...edge,
      path: `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`,
    };
  });

  const width = PAD * 2 + (maxRank + 1) * NODE_W + maxRank * COL_GAP;
  const height = PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;
  return { width: Math.max(width, 240), height: Math.max(height, 160), nodes: layoutNodes, edges: layoutEdges };
}
