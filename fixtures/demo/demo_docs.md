# demo

## 结构

- 表名：控件演示表
- 视图：表格、卡片，默认表格
- 分组：基础信息、数值与开关、展示与扩展
- 字段：
  - id：英文标识，必填，创建后不建议改
  - name：名称，必填
  - kind：分类，枚举 weapon / armor / consumable / material
  - rarity：稀有度，枚举 common / rare / epic / legendary
  - desc：描述
  - enabled：是否启用
  - stack：堆叠上限，1–999
  - weight：重量
  - power：强度，0–100
  - atk / def：攻击、防御
  - color：品质色 #RRGGBB
  - available_from：上架日期
  - tags：标签，逗号分隔

## 检查规则

- struct 里 `required` 字段必填；缺省时至少检查 id、name
- id 须小写字母开头，仅字母数字下划线，且不重复
- kind、rarity 须落在枚举内
- stack 须在 1–999，power 须在 0–100
- color 须为 `#RRGGBB`
- 对应 `demo_checker.js` 的 `BitTableChecker.check`

## 导出规则

- 对应 `demo_export.js` 的 `BitTableExporter.export`
- 导出 `demo.json`（`JSON.stringify(data)`）
