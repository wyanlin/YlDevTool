# 关键时间线图表化 — 设计文档

## 概述

将"关键时间线"从逐条日志列表替换为 Canvas 折线图，展示 RSSI/SNR 时序变化，通话时段和短信事件以图层叠加方式显示。

## 设计原则

- 纯 Canvas 自绘，零外部依赖
- 复用已有 `extractTtLogStateSnapshots` 数据提取管线
- 勾选框控制通话/短信图层的显示/隐藏，即时重绘

## 新增函数

### 数据提取
| 函数 | 作用 |
|------|------|
| `parseTimestampToMs(timeStr)` | "MM-DD HH:MM:SS.mmm" → 毫秒偏移 |
| `formatTimeTick(ms)` | 毫秒 → "M:SS" 显示标签 |
| `extractCallPeriods(callSnapshots)` | 从 DSCI 采样提取通话时段 `[{startTime, endTime, direction, number}]` |
| `extractSmsMarkers(events)` | 从扫描事件提取 SMS 标记点 `[{time, text}]` |
| `computeYRange(values, padding)` | 自动 Y 轴范围 |
| `pickTimeTicks(minMs, maxMs, maxTicks)` | X 轴刻度选取（自动对齐整秒/整分） |

### 图表渲染
| 函数 | 作用 |
|------|------|
| `renderTtLogChart(scanState, text, options)` | Canvas 折线图主渲染函数 |

### 渲染流程
1. 背景填充 + 网格线
2. 通话时段半透明色块（可选，勾选框控制）
3. SMS 事件虚线标记（可选，勾选框控制）
4. Y 轴标签：左 RSSI (dBm)，右 SNR (dB)
5. X 轴时间标签
6. RSSI 折线（蓝色 #2563eb）
7. SNR 折线（绿色 #16a34a）
8. 图例

## HTML/CSS 变更

- "关键时间线"panel 改为 Canvas 图表 + 勾选框控件
- `.chart-controls` / `.chart-container` 样式

## Release Notes

### v1.2.0 — 关键时间线图表化

**新增：**
- Canvas 折线图：RSSI (dBm) + SNR (dB) 双 Y 轴时序图
- 通话时段叠加：主叫/被叫时段以不同颜色色块覆盖
- SMS 事件标记：短信收发时间点虚线标注
- 勾选框控制：通话时段/短信事件可独立显示/隐藏
- 自适应采样：>500 个信号点时只绘折线不绘数据点，保证性能

**移除：**
- 原有的列表式关键时间线（`renderTtLogTimeline` 不再调用）
