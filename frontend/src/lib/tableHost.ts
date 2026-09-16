export type TableCheckError = { path: string; message: string };

export type TableCheckResult = {
  ok: boolean;
  errors: TableCheckError[];
};

export function unquoteYAML(value: string): string {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export type HistoryTurn = {
  when: string;
  who: string;
  user: string;
  agent: string;
};

export function historySection(text: string, mode: "struct" | "data"): string {
  const src = (text || "").replace(/\r\n/g, "\n");
  const tag = mode === "struct" ? "struct" : "data";
  const open = `<!-- bit-history:${tag} -->`;
  const close = `<!-- /bit-history:${tag} -->`;
  const a = src.indexOf(open);
  const b = src.indexOf(close);
  if (a >= 0 && b > a) {
    return src.slice(a + open.length, b).trim();
  }
  const heading = mode === "struct" ? "## 结构" : "## 数据";
  const other = mode === "struct" ? "## 数据" : "## 结构";
  const start = src.indexOf(heading);
  if (start < 0) return "";
  let body = src.slice(start + heading.length);
  const cut = body.indexOf("\n" + other);
  if (cut >= 0) body = body.slice(0, cut);
  return body.trim();
}

export function parseHistoryTurns(section: string): HistoryTurn[] {
  const src = (section || "").replace(/\r\n/g, "\n");
  if (!src.trim()) return [];
  const turnRe = /^### (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}) · (.+)$/gm;
  const matches = [...src.matchAll(turnRe)];
  if (!matches.length) return [];
  return matches.map((m, i) => {
    const start = (m.index || 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index || src.length : src.length;
    const body = src.slice(start, end);
    const userAt = body.indexOf("**用户**");
    const agentAt = body.indexOf("**Agent**");
    let user = "";
    let agent = "";
    if (userAt >= 0) {
      user = body.slice(userAt + "**用户**".length, agentAt >= 0 ? agentAt : undefined).trim();
    }
    if (agentAt >= 0) {
      agent = body.slice(agentAt + "**Agent**".length).trim();
    }
    return { when: m[1], who: m[2].trim(), user, agent };
  });
}

export function parseTableDoc(text: string): unknown {
  const raw = (text || "").trim();
  if (!raw) return { rows: [] };
  if (raw.startsWith("{") || raw.startsWith("[")) {
    return JSON.parse(raw);
  }
  const rows: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*-\s+/.test(line)) {
      if (current) rows.push(current);
      current = {};
      const kv = line.match(/^\s*-\s+(\w+)\s*:\s*(.*)$/);
      if (kv) current[kv[1]] = unquoteYAML(kv[2]);
      continue;
    }
    const kv = line.match(/^\s+(\w+)\s*:\s*(.*)$/);
    if (kv && current) {
      current[kv[1]] = unquoteYAML(kv[2]);
    }
  }
  if (current) rows.push(current);
  return { rows };
}

export function stringifyTableDoc(data: unknown): string {
  if (typeof data === "string") return data;
  const rec = data as { rows?: Record<string, unknown>[] } | null;
  if (rec && Array.isArray(rec.rows)) {
    if (rec.rows.length === 0) return "rows: []\n";
    let out = "rows:\n";
    for (const row of rec.rows) {
      const keys = Object.keys(row || {});
      keys.forEach((key, i) => {
        const prefix = i === 0 ? "  - " : "    ";
        out += `${prefix}${key}: ${String(row[key] ?? "").replace(/\n/g, " ")}\n`;
      });
    }
    return out;
  }
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function runTableChecker(checkerJs: string, data: unknown, struct: unknown): Promise<TableCheckResult> {
  if (!checkerJs.trim()) {
    return Promise.resolve({ ok: true, errors: [] });
  }
  return new Promise((resolve) => {
    const html = `<!doctype html><meta charset="utf-8"><script>${checkerJs.replace(/<\/script/gi, "<\\/script")}</script><script>
      window.addEventListener("message", function (ev) {
        try {
          var fn = window.BitTableChecker && window.BitTableChecker.check;
          var result = fn ? fn(ev.data.data, ev.data.struct) : { ok: true, errors: [] };
          parent.postMessage({ type: "result", result: result }, "*");
        } catch (err) {
          parent.postMessage({ type: "result", result: { ok: false, errors: [{ path: "", message: String(err) }] } }, "*");
        }
      });
      parent.postMessage({ type: "ready" }, "*");
    </script>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.display = "none";
    iframe.src = url;
    const finish = (result: TableCheckResult) => {
      window.removeEventListener("message", onMsg);
      iframe.remove();
      URL.revokeObjectURL(url);
      resolve({
        ok: Boolean(result?.ok),
        errors: Array.isArray(result?.errors) ? result.errors : [],
      });
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow || !ev.data || typeof ev.data !== "object") return;
      if (ev.data.type === "ready") {
        iframe.contentWindow?.postMessage({ data, struct }, "*");
      } else if (ev.data.type === "result") {
        finish(ev.data.result as TableCheckResult);
      }
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
    window.setTimeout(() => finish({ ok: false, errors: [{ path: "", message: "检查器超时" }] }), 4000);
  });
}
