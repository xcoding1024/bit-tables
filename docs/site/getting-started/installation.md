---
title: 安装与启动
description: 下载、解压并启动 bit-tables 桌面程序。
---

# 安装与启动

## 下载桌面版

从项目发布页下载与你的系统对应的压缩包：

- Windows x64：`bit-tables-<版本>-win-x64.zip`
- Linux x64：`bit-tables-<版本>-linux-x64.zip`
- macOS Intel：`bit-tables-<版本>-mac-x64.zip`
- macOS Apple Silicon：`bit-tables-<版本>-mac-arm64.zip`

[打开 bit-tables 发布页](https://github.com/xcoding1024/bit-tables/releases)

解压到固定目录后运行 `bit-tables`。Windows 首次运行若出现系统保护提示，先确认文件来自上述发布页，再选择继续运行。

## 首次启动

没有历史项目时会进入引导页，你可以：

- **打开已有项目**：选择包含 `tables` 子目录的项目根目录。
- **创建示例项目**：选择一个空目录，工作台会写入完整示例并打开其中的 `tables`。

不要直接选择 `tables` 目录；应选择它的上一级项目目录，这样资源、共享编辑组件和导出目录才能正确定位。

## 后续启动

应用会自动恢复上次打开的目录。需要切换时，使用“项目 → 打开…”或“项目 → 最近打开”。所有数据保存在本机目录中，关闭应用不会上传配置表。
