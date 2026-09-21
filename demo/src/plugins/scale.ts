export default {
  id: "scale",
  name: "按比例",
  kind: "generic" as const,
  match: { type: "int" },
  params: [
    { key: "source", label: "来源", type: "ref" },
    { key: "factor", label: "系数", type: "number" },
  ],
  compute(ctx: { args: { source?: string; factor?: number }; get: (ref: string) => unknown }) {
    return Math.round(Number(ctx.get(String(ctx.args.source || ""))) * Number(ctx.args.factor ?? 1));
  },
};
