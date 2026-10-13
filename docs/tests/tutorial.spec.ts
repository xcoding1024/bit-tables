import { expect, test } from "@playwright/test";

test("首页展示自带 demo 工作台并进入编辑教程", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "bit-tables 教程", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: "bit-tables 在自带示例项目中切换表格、卡片与图表" })).toHaveAttribute("src", /workbench\.gif$/);
  await page.getByRole("link", { name: /3\. 编辑与填充/ }).click();
  await expect(page).toHaveURL(/\/guides\/editing$/);
  await expect(page.getByRole("heading", { name: "编辑、填充与批量操作", level: 1 })).toBeVisible();
});

test("编辑教程使用 fill_demo 并展示填充素材", async ({ page }) => {
  await page.goto("/guides/editing");
  await expect(page.getByText("fill_demo", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "在 fill_demo 中选择单元格并向下填充后撤销" })).toHaveAttribute("src", /editing-fill\.gif$/);
  await expect(page.getByRole("img", { name: "fill_demo 的选区、填充柄和编辑工具栏" })).toHaveAttribute("src", /editing-toolbar\.png$/);
  await expect(page.getByText("xq-common", { exact: false })).toHaveCount(0);
});

test("多 Sheet、插件和质量教程包含真实截图", async ({ page }) => {
  await page.goto("/guides/sheets-excel");
  await expect(page.getByRole("img", { name: "sheet_demo 中的只读 Excel 来源页面" })).toHaveAttribute("src", /excel-source\.png$/);
  await page.goto("/guides/plugins");
  await expect(page.getByRole("img", { name: "sheet_demo 右侧的插件绑定面板" })).toHaveAttribute("src", /plugin-binding\.png$/);
  await page.goto("/guides/validation-export");
  await expect(page.getByRole("img", { name: "bit-tables 检查菜单中的当前表与全部表入口" })).toHaveAttribute("src", /check-menu\.png$/);
  await expect(page.getByText("build/client", { exact: false }).first()).toBeVisible();
});

test("站内搜索可定位枚举与依赖教程", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "搜索教程" }).click();
  const search = page.getByPlaceholder("搜索文档").or(page.getByRole("searchbox"));
  await search.fill("依赖关系");
  const result = page.getByRole("listbox").getByRole("link", { name: /枚举、依赖与模板/ }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/guides\/project-tools(?:#.*)?$/);
});

test("移动端目录可打开故障排查", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "仅移动端验证折叠菜单");
  await page.goto("/getting-started/installation");
  await page.getByRole("button", { name: "目录", exact: true }).click();
  const sidebar = page.getByRole("navigation", { name: "Sidebar Navigation" });
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("link", { name: "故障排查", exact: true }).click();
  await expect(page).toHaveURL(/\/reference\/troubleshooting$/);
});
