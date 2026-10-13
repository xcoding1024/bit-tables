import { defineConfig } from "vitepress";

export default defineConfig({
  srcDir: "site",
  lang: "zh-CN",
  title: "bit-tables 教程",
  description: "bit-tables 本机配表工作台的完整用户教程",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { name: "theme-color", content: "#087f6a" }],
    ["meta", { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }],
  ],
  themeConfig: {
    logo: "/brand-mark.svg",
    siteTitle: "bit-tables 教程",
    outline: { level: [2, 3], label: "本页目录" },
    lastUpdated: { text: "最后更新" },
    docFooter: { prev: "上一篇", next: "下一篇" },
    returnToTopLabel: "返回顶部",
    sidebarMenuLabel: "目录",
    darkModeSwitchLabel: "外观",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "搜索教程", buttonAriaLabel: "搜索教程" },
          modal: {
            displayDetails: "显示详细列表",
            resetButtonTitle: "清除查询条件",
            backButtonTitle: "关闭搜索",
            noResultsText: "没有找到相关内容",
            footer: { selectText: "选择", selectKeyAriaLabel: "回车", navigateText: "切换", navigateUpKeyAriaLabel: "向上", navigateDownKeyAriaLabel: "向下", closeText: "关闭", closeKeyAriaLabel: "Esc" },
          },
        },
      },
    },
    nav: [
      { text: "开始使用", link: "/getting-started/installation" },
      { text: "编辑数据", link: "/guides/editing" },
      { text: "检查与导出", link: "/guides/validation-export" },
      { text: "故障排查", link: "/reference/troubleshooting" },
    ],
    sidebar: [
      {
        text: "开始使用",
        items: [
          { text: "教程首页", link: "/" },
          { text: "安装与启动", link: "/getting-started/installation" },
          { text: "打开第一个项目", link: "/getting-started/first-project" },
        ],
      },
      {
        text: "基础概念",
        items: [
          { text: "示例项目", link: "/concepts/demo-project" },
          { text: "文件结构", link: "/concepts/file-structure" },
          { text: "工作台界面", link: "/guides/workbench" },
        ],
      },
      {
        text: "功能教程",
        items: [
          { text: "编辑、填充与批量操作", link: "/guides/editing" },
          { text: "多 Sheet 与 Excel", link: "/guides/sheets-excel" },
          { text: "插件与引用", link: "/guides/plugins" },
          { text: "检查与导出", link: "/guides/validation-export" },
          { text: "枚举、依赖与模板", link: "/guides/project-tools" },
          { text: "历史记录", link: "/guides/history" },
          { text: "使用 AI 修改配表", link: "/guides/ai-workflow" },
        ],
      },
      {
        text: "参考",
        items: [
          { text: "快捷键", link: "/reference/shortcuts" },
          { text: "故障排查", link: "/reference/troubleshooting" },
        ],
      },
    ],
    socialLinks: [],
  },
});
