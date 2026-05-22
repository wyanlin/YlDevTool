# 日志逐行注解功能 — 设计文档

## 概述

在现有"天通日志诊断"工具（ttlogdiag）内部增强，新增逐行注解和状态追踪两个子功能。

## 设计原则

- 在现有 ttlogdiag 工具内部增强，不新建独立工具
- 共享日志解析、过滤、源分类管线
- 注解流程独立于事件扫描流程——用户可仅注解、仅扫描、或两者都做
- 数据与逻辑分离：AT 指令字典、注解器、状态追踪器都是纯数据数组，扩展只需添加条目

## 新增数据结构

### TT_AT_COMMAND_DICT
AT 指令字典，key 为指令 basename（不带 `AT` 前缀），value 为 `{ name, desc }`。

### TT_LOG_ANNOTATORS
注解器数组，每个条目有 `type`、`category`、`match(line)` 方法，返回 `{ annotations: [{text, severity, fields?}] }`。

### TT_LOG_STATE_TRACKERS
状态追踪器数组，每个条目有 `id`、`label`、`extract(line, lineNumber)` 方法，返回采样数据点。

### 辅助解释函数
- `interpretRssi(rssi)` — RSSI 数值分级
- `interpretSnr(snr)` — SNR 数值分级
- `interpretCregState(state)` — 网络注册状态翻译

## 新增核心函数

| 函数 | 作用 |
|------|------|
| `parseAtCommandsFromLine(line)` | 从日志行提取 AT 指令，查字典返回解释 |
| `scanTtLogAnnotations(text, options)` | 注解扫描主函数，返回 `{ annotatedLines, annotationCount }` |
| `extractTtLogStateSnapshots(text)` | 状态采样提取 |
| `summarizeTtLogStateChanges(snapshots)` | 状态变化趋势汇总 |
| `renderTtLogAnnotationSummary(result)` | 渲染注解统计卡片 |
| `renderTtLogAnnotationList(result)` | 渲染逐行注解列表 |
| `renderTtLogStatePanel(snapshots, summaries)` | 渲染状态追踪面板 |

## HTML 变更

在 ttlogdiag 视图"关键时间线"panel 之后新增：
1. 逐行注解 panel — `#ttLogAnnotationList`
2. 状态变化追踪 panel — `#ttLogStatePanel`

## CSS 变更

新增 `.tt-annotation-list`、`.annotation-item`、`.annotation-badge`、`.state-section`、`.state-sample` 等样式类。

## Release Notes

### v1.1.0 — 日志逐行注解功能

**新增：**
- 逐行注解：自动识别日志中的 AT 指令并解释其含义
- 信号强度解读：RSSI/SNR 数值自动分级（强/中等/弱/极弱）
- 网络状态翻译：+CREG 状态码自动翻译为中文描述
- 进程事件识别：进程启动/崩溃/ANR 检测
- 异常检测：自动标注包含 fail/error/timeout 等关键词的行
- 状态变化追踪：信号趋势分析（范围、均值、变化方向）
- 网络状态追踪：注册状态变化序列

**设计约束：**
- AT 指令字典位于 `TT_AT_COMMAND_DICT`，按需扩展
- 注解器位于 `TT_LOG_ANNOTATORS`，新增匹配模式添加数组条目即可
- 状态追踪器位于 `TT_LOG_STATE_TRACKERS`，同理解释
