export default {
  id: "reference",
  name: "引用",
  kind: "generic" as const,
  match: {},
  params: [{ key: "source", label: "来源", type: "ref" }],
  compute(ctx: { args: { source?: string }; get: (ref: string) => unknown }) {
    return ctx.get(String(ctx.args.source || ""));
  },
};
