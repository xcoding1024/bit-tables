export default {
  id: "sheet_demo_power",
  name: "强度推算",
  kind: "exclusive" as const,
  match: { table: "sheet_demo", sheet: "items", field: "power" },
  params: [{ key: "source", label: "来源", type: "ref" }],
  compute(ctx: { args: { source?: string }; get: (ref: string) => unknown }) {
    const n = Number(ctx.get(String(ctx.args.source || "")));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  },
};
