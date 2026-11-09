// 编辑 iframe 为不透明源，显示偏好由工作台按项目、目录、表和分页保存。
export function columnLayoutKey(root: string, editorURL: string, table: string, sheet: string): string {
  const url = new URL(editorURL, window.location.href);
  return `bit-tables:columns:${JSON.stringify([url.searchParams.get("projectId") || "", root, table, sheet])}`;
}

const memory = new Map<string, unknown>();
export function loadColumnLayout(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return memory.get(key) || null; }
}

export function saveColumnLayout(key: string, layout: unknown): void {
  memory.set(key, layout);
  try { localStorage.setItem(key, JSON.stringify(layout)); } catch { /* 存储不可用时保留本次会话设置。 */ }
}
