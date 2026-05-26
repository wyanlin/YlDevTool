# 天通日志诊断界面更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将天通日志诊断从“规则配置优先”的复杂界面，调整为“快速诊断优先、专家配置后置”的单入口多任务视图。

**Architecture:** 保留 `ttlogdiag` 一个工具入口，不拆成多个独立页面。通过首屏快速诊断、结果标签页、高级规则折叠区、场景化预设降低首次使用门槛，同时继续复用现有日志读取、TAG 分类、事件扫描、逐行注解和状态追踪逻辑。

**Tech Stack:** 静态 HTML/CSS/JavaScript；主要修改 `index.html`、`styles.css`、`main.js`，不引入新框架。

---

## 设计原则

- 不拆多个工具页：通话、音频、入网短信、功耗休眠共享同一份日志、同一套 TAG 配置和同一条时间线。
- 拆界面层级：普通用户默认只看到“上传日志、选择场景、开始诊断”；高级 TAG/关键词配置默认折叠。
- 用问题场景组织功能：用户通常是来查“打不通、无声、入网失败、功耗高”，不是来维护 TAG 规则。
- 结果区按任务视图组织：概览、通话链路、音频链路、入网/信号、功耗休眠、逐行注解、报告。
- 保留专家能力：导入/导出配置、真实 TAG 匹配、去重策略仍然可用，但不要抢占首屏。

## 文件结构

- Modify: `index.html`
  - 重排 `ttlogdiag` 输入区。
  - 新增快速诊断区、结果标签页、高级规则折叠区。
  - 调整按钮分组和说明文案。
- Modify: `styles.css`
  - 新增诊断目标卡片/分段控件、折叠高级区、结果标签页、空状态和提示样式。
  - 保持现有工具箱视觉风格，不引入大面积新主题。
- Modify: `main.js`
  - 扩展天通日志场景预设。
  - 新增结果标签切换逻辑。
  - 将现有扫描、注解、状态追踪结果按视图过滤展示。
  - 增加 0 命中时的引导提示和日志高频 TAG 建议。
- Optional Modify: `RELEASE_NOTES.md`
  - 记录界面信息架构更新。

---

### Task 1: 重排首屏输入区

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: 将输入区改为快速诊断优先**

在 `index.html` 的 `data-view="ttlogdiag"` 下保留日志上传，但把首屏顺序调整为：

1. 日志文件
2. 诊断目标
3. 主操作按钮
4. 高级规则折叠区

建议文案：

```html
<h2>快速诊断</h2>
<p class="panel-caption">上传 Android/RIL 日志后选择要排查的问题，工具会优先使用内置天通规则扫描。TAG 不一致时再展开高级规则调整。</p>
```

- [ ] **Step 2: 将“分析场景”改名为“诊断目标”**

把现有 checkbox 文案调整为更问题导向：

```html
<label><input type="checkbox" name="ttLogProfile" value="tt_call" checked> 通话拨打/挂断</label>
<label><input type="checkbox" name="ttLogProfile" value="tt_audio"> 语音/音频路由</label>
<label><input type="checkbox" name="ttLogProfile" value="tt_sms"> 入网/信号/短信</label>
<label><input type="checkbox" name="ttLogProfile" value="power_sleep"> 功耗/休眠</label>
```

- [ ] **Step 3: 将高级字段放入折叠区**

把以下字段移入 `<details class="advanced-panel">`：

- 日志来源预设
- 原始串口 TAG
- RIL业务 TAG
- 辅助 TAG/关键词
- 匹配策略
- 导入配置
- 导出配置

折叠标题建议：

```html
<summary>高级规则：TAG、关键词和匹配策略</summary>
```

- [ ] **Step 4: 给高级字段增加短说明**

每个高级字段下增加一行 `.field-note`：

```html
<p class="field-note">只有日志里的 AT 交互 TAG 不是 RIL_TT-AT 时才需要修改。</p>
<p class="field-note">用于识别 RIL 层拨号、注册、状态变化等业务日志。</p>
<p class="field-note">用于补充 Audio、Telecom、PowerManager、wakelock 等系统侧线索。</p>
```

- [ ] **Step 5: 调整按钮分组**

按钮分成三组：

```html
<div class="action-group primary-actions">
  <button id="scanTtLogBtn" class="primary" type="button">开始诊断</button>
</div>
<div class="action-group report-actions">
  <button id="buildTtLogReportBtn" type="button">生成报告</button>
  <button id="copyTtLogReportBtn" type="button">复制报告</button>
  <button id="downloadTtLogReportBtn" type="button">下载报告.md</button>
</div>
<div class="action-group config-actions">
  <button id="exportTtLogConfigBtn" type="button">导出规则</button>
  <button id="importTtLogConfigBtn" type="button">导入规则</button>
  <button id="clearTtLogBtn" data-status="ttLogStatus" class="clear-btn" type="button">清空</button>
</div>
```

- [ ] **Step 6: 添加样式**

在 `styles.css` 新增：

```css
.advanced-panel {
    grid-column: 1 / -1;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    background: var(--surface-muted);
}

.advanced-panel summary {
    cursor: pointer;
    font-weight: 700;
}

.field-note {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
}

.action-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
```

如果现有变量名与上述不一致，使用项目已有颜色变量替换，不新增一套主题变量。

---

### Task 2: 扩展场景化预设

**Files:**
- Modify: `main.js`
- Modify: `index.html`

- [ ] **Step 1: 扩展 `TT_LOG_SOURCE_PRESETS`**

在 `main.js` 中保留 `tt_default`，新增场景预设：

```js
const TT_LOG_SOURCE_PRESETS = {
    tt_default: {
        label: "天通默认 RIL 链路",
        atTags: "RIL_TT-AT",
        rilTags: "RIL_TT",
        helperKeywords: "AudioService,AudioManager,AudioFlinger,Telecom,InCall,PowerManager,wakelock,wake_lock,modem sleep,CP2AP_WAKEUP,suspend,resume,SMS,CREG,SATSIGNAL",
        matchRealTagOnly: true,
        dedupeEnabled: true,
    },
    tt_call_basic: {
        label: "通话拨打/挂断",
        atTags: "RIL_TT-AT",
        rilTags: "RIL_TT",
        helperKeywords: "Telecom,InCall,Call,DSCI,CLCC,NO CARRIER",
        matchRealTagOnly: true,
        dedupeEnabled: true,
    },
    tt_audio_route: {
        label: "语音/音频路由",
        atTags: "RIL_TT-AT",
        rilTags: "RIL_TT",
        helperKeywords: "AudioService,AudioManager,AudioFlinger,AudioPolicy,MODE_IN_CALL,MODE_IN_COMMUNICATION,PCM,VOICEDLDATA,VOICEULDATA",
        matchRealTagOnly: true,
        dedupeEnabled: true,
    },
    tt_network_sms: {
        label: "入网/信号/短信",
        atTags: "RIL_TT-AT",
        rilTags: "RIL_TT",
        helperKeywords: "CREG,CEREG,SATSIGNAL,CSQ,SMS,CPMS,CMGS,CMGL",
        matchRealTagOnly: true,
        dedupeEnabled: true,
    },
    tt_power_sleep: {
        label: "功耗/休眠",
        atTags: "RIL_TT-AT",
        rilTags: "RIL_TT",
        helperKeywords: "PowerManager,wakelock,wake_lock,CP2AP_WAKEUP,suspend,resume,modem sleep,requestScreenState,TIME_CHANGED_MASK",
        matchRealTagOnly: false,
        dedupeEnabled: true,
    },
};
```

- [ ] **Step 2: 更新预设下拉框**

在 `index.html` 的 `#ttLogPresetSelect` 中加入：

```html
<option value="tt_default">综合诊断：天通默认 RIL 链路</option>
<option value="tt_call_basic">通话拨打/挂断</option>
<option value="tt_audio_route">语音/音频路由</option>
<option value="tt_network_sms">入网/信号/短信</option>
<option value="tt_power_sleep">功耗/休眠</option>
<option value="custom">自定义</option>
```

- [ ] **Step 3: 选择诊断目标时同步推荐预设**

在 `attachTtLogDiagnostic()` 中增加映射：

```js
const TT_LOG_PROFILE_RECOMMENDED_PRESET = {
    tt_call: "tt_call_basic",
    tt_audio: "tt_audio_route",
    tt_sms: "tt_network_sms",
    power_sleep: "tt_power_sleep",
};
```

当用户只勾选一个诊断目标且当前不是自定义配置时，自动套用对应预设。多选时使用 `tt_default`。

---

### Task 3: 结果区改成多任务视图

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `main.js`

- [ ] **Step 1: 增加结果标签页**

在事件概览前加入：

```html
<div class="tt-result-tabs" role="tablist" aria-label="诊断结果视图">
  <button type="button" class="tt-result-tab is-active" data-tt-result-tab="overview">概览</button>
  <button type="button" class="tt-result-tab" data-tt-result-tab="call">通话链路</button>
  <button type="button" class="tt-result-tab" data-tt-result-tab="audio">音频链路</button>
  <button type="button" class="tt-result-tab" data-tt-result-tab="network">入网/信号</button>
  <button type="button" class="tt-result-tab" data-tt-result-tab="power">功耗休眠</button>
  <button type="button" class="tt-result-tab" data-tt-result-tab="annotation">逐行注解</button>
  <button type="button" class="tt-result-tab" data-tt-result-tab="report">报告</button>
</div>
```

- [ ] **Step 2: 给现有结果 section 加视图归属**

示例：

```html
<section class="panel tt-result-panel" data-tt-result-panel="overview">...</section>
<section class="panel tt-result-panel" data-tt-result-panel="call network power">...</section>
<section class="panel tt-result-panel" data-tt-result-panel="annotation">...</section>
<section class="panel tt-result-panel" data-tt-result-panel="report">...</section>
```

第一版可以不拆具体事件列表，只先控制各模块显隐，降低页面长度。

- [ ] **Step 3: 添加标签切换逻辑**

在 `main.js` 增加：

```js
function attachTtLogResultTabs() {
    const tabs = [...document.querySelectorAll(".tt-result-tab")];
    const panels = [...document.querySelectorAll(".tt-result-panel")];
    if (!tabs.length || !panels.length) return;

    const activate = (tabName) => {
        tabs.forEach((tab) => {
            const active = tab.dataset.ttResultTab === tabName;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        panels.forEach((panel) => {
            const names = String(panel.dataset.ttResultPanel || "").split(/\s+/);
            panel.classList.toggle("is-hidden", !names.includes(tabName));
        });
    };

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => activate(tab.dataset.ttResultTab));
    });

    activate("overview");
}
```

在页面初始化时调用 `attachTtLogResultTabs()`。

- [ ] **Step 4: 添加样式**

```css
.tt-result-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0;
}

.tt-result-tab {
    min-height: 34px;
}

.tt-result-tab.is-active {
    background: var(--accent);
    color: var(--accent-contrast);
}
```

按现有按钮样式微调变量名，避免视觉割裂。

---

### Task 4: 增加 0 命中引导和高频 TAG 建议

**Files:**
- Modify: `main.js`
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: 增加日志 TAG 统计函数**

在 `main.js` 增加：

```js
function collectTtLogTagSuggestions(text, limit = 12) {
    const counts = new Map();
    splitLogLines(text).forEach((line, index) => {
        const parsed = parseTtLogLine(line, index + 1);
        if (!parsed.tag) return;
        counts.set(parsed.tag, (counts.get(parsed.tag) || 0) + 1);
    });
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count }));
}
```

- [ ] **Step 2: 增加空结果提示容器**

在事件概览 section 内加入：

```html
<div id="ttLogEmptyHint" class="tt-empty-hint" hidden></div>
```

- [ ] **Step 3: 扫描完成但 0 命中时渲染提示**

在扫描完成逻辑中，如果 `scanState.events.length === 0`：

```js
renderTtLogEmptyHint(text, sourceConfig);
```

提示内容包括：

- 当前使用的 AT TAG / RIL TAG / 辅助关键词。
- 建议检查日志中是否存在 `RIL_TT-AT` 或 `RIL_TT`。
- 展示高频 TAG，例如 `RILJ`、`ATC`、`AudioService`。
- 提醒用户展开“高级规则”调整 TAG。

- [ ] **Step 4: 添加一键加入 TAG 的轻量交互**

第一版只提供复制建议，不直接修改输入框，避免误改配置：

```html
<p>可以展开高级规则，将实际 TAG 加入对应输入框。</p>
```

后续再做“一键加入”。

---

### Task 5: 修正文案与匹配策略一致性

**Files:**
- Modify: `index.html`
- Modify: `main.js`

- [ ] **Step 1: 明确 `matchRealTagOnly` 的作用范围**

当前逻辑中 helper 来源仍会进入扫描，只是在 `tt_call` 核心事件处跳过 helper。将 UI 文案改为：

```html
<label><input id="ttLogMatchRealTagOnly" type="checkbox" checked> 通话核心事件只使用真实 AT/RIL TAG</label>
```

- [ ] **Step 2: 如需更严格语义，再调整逻辑**

如果希望所有核心事件都排除 helper，则将 `ttLogLineMatchesSource()` 改为：

```js
function ttLogLineMatchesSource(parsed, sourceConfig) {
    const source = classifyTtLogSource(parsed, sourceConfig);
    if (source.kind === "at" || source.kind === "ril") {
        return source;
    }
    if (!sourceConfig.matchRealTagOnly && source.kind === "helper") {
        return source;
    }
    return null;
}
```

推荐第一阶段只改文案，不改逻辑，避免影响已有扫描结果。

---

### Task 6: 验证

**Files:**
- Verify only

- [ ] **Step 1: 静态打开页面**

Run:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Expected:

- 页面可访问 `http://127.0.0.1:4173/`
- 打开“天通日志诊断”无控制台错误

- [ ] **Step 2: 首屏检查**

Expected:

- 首屏能看到日志上传、诊断目标、开始诊断。
- 高级 TAG 配置默认不抢占主要视线。
- 按钮分组清晰。

- [ ] **Step 3: 默认扫描检查**

使用现有 `test-log.txt`：

Expected:

- 默认勾选“通话拨打/挂断”可以扫描。
- 扫描完成后事件概览、时间线、报告仍可生成。
- 逐行注解仍可独立执行。

- [ ] **Step 4: 0 命中检查**

用一份不包含 `RIL_TT-AT` / `RIL_TT` 的普通日志：

Expected:

- 不只显示 0 命中。
- 页面提示当前匹配规则。
- 页面提示可展开高级规则调整 TAG。
- 高频 TAG 建议可见。

- [ ] **Step 5: 配置导入导出回归**

Expected:

- 导出规则仍生成 JSON。
- 导入规则后高级字段正确回填。
- 清空后恢复默认规则和默认诊断目标。

---

## 推荐执行顺序

1. 先做 Task 1，解决首屏复杂度。
2. 再做 Task 5，避免文案和逻辑误导。
3. 做 Task 2，把预设从“来源”升级为“场景”。
4. 做 Task 3，把长页面变成多任务视图。
5. 做 Task 4，补齐 0 命中时的自助排障。
6. 最后跑 Task 6 验证。

## 自检

- 本计划不拆出多个独立页面，符合当前诊断链路共享日志、共享规则、共享时间线的特点。
- 每个任务都能独立落地，Task 1 完成后即可明显降低首屏复杂度。
- 第一阶段避免大规模重构 `main.js`，降低破坏现有扫描、注解、报告功能的风险。
