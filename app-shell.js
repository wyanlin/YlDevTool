const TOOL_CATEGORIES = [
    { id: "common", title: "常用工具", short: "常", virtual: true },
    { id: "protocol", title: "协议调试", short: "协" },
    { id: "log", title: "日志分析", short: "志" },
    { id: "audio", title: "音频处理", short: "音" },
    { id: "converter", title: "编码转换", short: "转" },
    { id: "android", title: "Android / ADB", short: "A" },
    { id: "build", title: "构建交付", short: "构" },
    { id: "docs", title: "文档模板", short: "文" },
    { id: "settings", title: "设置", short: "设", virtual: true },
];

const TOOL_REGISTRY = [
    {
        id: "protocol",
        category: "protocol",
        title: "HHGL 协议组包 / 解包",
        description: "生成或解析双串口协议帧，适合快速验证字段和载荷。",
        tags: ["常用", "串口", "协议"],
    },
    {
        id: "ipvalidator",
        category: "protocol",
        title: "IP 包验证",
        description: "构建 IPv4 包，解析版本、长度、校验和、协议和载荷。",
        tags: ["IPv4", "校验"],
    },
    {
        id: "audiopcm",
        category: "audio",
        title: "音频 PCM 数据解析",
        description: "从 RIL 日志中扫描通话，提取 Base64 音频数据并导出 PCM。",
        tags: ["RIL", "PCM", "日志"],
    },
    {
        id: "ttlogdiag",
        category: "log",
        title: "天通日志诊断",
        description: "从 Android/RIL 大日志中提取天通电话、语音、短信、功耗关键事件并生成报告。",
        tags: ["天通", "RIL", "Audio", "功耗"],
    },
    {
        id: "logtrimmer",
        category: "log",
        title: "日志裁剪",
        description: "按行号、时间范围、关键字或事件上下文对日志进行裁剪，导出精简日志文件。",
        tags: ["裁剪", "过滤", "日志"],
    },
    {
        id: "converter",
        category: "converter",
        title: "十六进制 ⇄ ASCII",
        description: "在 Hex 和 ASCII 之间双向转换，便于检查 AT 命令和载荷。",
        tags: ["Hex", "ASCII"],
    },
];

const TOOL_STATE_KEY = "mydevtools.shellState.v1";

function getToolById(id) {
    return TOOL_REGISTRY.find((tool) => tool.id === id);
}

function getCategoryById(id) {
    return TOOL_CATEGORIES.find((category) => category.id === id);
}

function loadShellState() {
    try {
        return {
            lastCategory: "common",
            lastTool: "",
            focusMode: false,
            toolListCollapsed: false,
            favoriteTools: [],
            recentTools: [],
            ...JSON.parse(localStorage.getItem(TOOL_STATE_KEY) || "{}"),
        };
    } catch (error) {
        return {
            lastCategory: "common",
            lastTool: "",
            focusMode: false,
            toolListCollapsed: false,
            favoriteTools: [],
            recentTools: [],
        };
    }
}

function saveShellState(state) {
    localStorage.setItem(TOOL_STATE_KEY, JSON.stringify(state));
}

function uniqueToolIds(ids) {
    return [...new Set(ids)].filter((id) => getToolById(id));
}

function addRecentTool(state, toolId) {
    state.recentTools = uniqueToolIds([toolId, ...state.recentTools]).slice(0, 8);
}

function escapeAttribute(value) {
    return String(value).replace(/"/g, "&quot;");
}

function initToolShell() {
    const appShell = document.getElementById("appShell");
    const categoryNav = document.getElementById("categoryNav");
    const toolList = document.getElementById("toolList");
    const homeToolShortcuts = document.getElementById("homeToolShortcuts");
    const title = document.getElementById("viewTitle");
    const subtitle = document.getElementById("viewSubtitle");
    const viewCategory = document.getElementById("viewCategory");
    const activeCategoryLabel = document.getElementById("activeCategoryLabel");
    const activeCategoryTitle = document.getElementById("activeCategoryTitle");
    const searchInput = document.getElementById("toolSearchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const focusModeBtn = document.getElementById("focusModeBtn");
    const toggleToolListBtn = document.getElementById("toggleToolListBtn");
    const favoriteToolBtn = document.getElementById("favoriteToolBtn");
    const views = document.querySelectorAll(".view");

    if (!appShell || !categoryNav || !toolList || !title || !subtitle || !viewCategory || !views.length) {
        return;
    }

    const state = loadShellState();

    const getVisibleTools = () => {
        const query = searchInput?.value.trim().toLowerCase() ?? "";
        if (query) {
            return TOOL_REGISTRY.filter((tool) => {
                const haystack = [tool.title, tool.description, tool.category, ...(tool.tags ?? [])].join(" ").toLowerCase();
                return haystack.includes(query);
            });
        }

        if (state.lastCategory === "common") {
            const favoriteTools = state.favoriteTools.map(getToolById).filter(Boolean);
            const recentTools = state.recentTools.map(getToolById).filter(Boolean);
            const merged = uniqueToolIds([...favoriteTools, ...recentTools].map((tool) => tool.id));
            return merged.length ? merged.map(getToolById).filter(Boolean) : TOOL_REGISTRY;
        }

        return TOOL_REGISTRY.filter((tool) => tool.category === state.lastCategory);
    };

    const renderCategories = () => {
        categoryNav.innerHTML = TOOL_CATEGORIES.map((category) => {
            const count = category.id === "common"
                ? uniqueToolIds([...state.favoriteTools, ...state.recentTools]).length || TOOL_REGISTRY.length
                : TOOL_REGISTRY.filter((tool) => tool.category === category.id).length;
            const isActive = category.id === state.lastCategory;
            return `
                <button type="button" class="category-btn ${isActive ? "active" : ""}" data-category-id="${category.id}" data-short="${escapeAttribute(category.short)}">
                    <span>${category.title}</span>
                    <span class="category-count">${count || ""}</span>
                </button>
            `;
        }).join("");

        categoryNav.querySelectorAll(".category-btn").forEach((button) => {
            button.addEventListener("click", () => {
                state.lastCategory = button.dataset.categoryId || "common";
                saveShellState(state);
                render();
                if (state.lastCategory === "common") {
                    activateView("home", { skipRecent: true });
                }
            });
        });
    };

    const renderToolList = () => {
        const category = getCategoryById(state.lastCategory) ?? getCategoryById("common");
        const visibleTools = getVisibleTools();
        if (activeCategoryLabel && activeCategoryTitle) {
            activeCategoryLabel.textContent = searchInput?.value.trim() ? "搜索结果" : "工具分类";
            activeCategoryTitle.textContent = searchInput?.value.trim() ? "搜索结果" : category.title;
        }

        toolList.innerHTML = visibleTools.length
            ? visibleTools.map((tool) => {
                const isActive = tool.id === state.lastTool;
                const isFavorite = state.favoriteTools.includes(tool.id);
                const tags = [
                    ...(isFavorite ? ["已收藏"] : []),
                    ...(tool.tags ?? []),
                ].map((tag) => `<span class="tool-tag">${tag}</span>`).join("");
                return `
                    <button type="button" class="tool-card ${isActive ? "active" : ""}" data-tool-id="${tool.id}">
                        <strong>${tool.title}</strong>
                        <span>${tool.description}</span>
                        <span class="tool-tags">${tags}</span>
                    </button>
                `;
            }).join("")
            : '<div class="protocol-result">当前分类还没有工具。后续新增工具时只需要注册元数据和对应 view。</div>';

        toolList.querySelectorAll(".tool-card").forEach((card) => {
            card.addEventListener("click", () => {
                activateView(card.dataset.toolId);
            });
        });
    };

    const renderHomeShortcuts = () => {
        if (!homeToolShortcuts) {
            return;
        }

        const shortcutIds = uniqueToolIds([...state.favoriteTools, ...state.recentTools]);
        const shortcutTools = (shortcutIds.length ? shortcutIds.map(getToolById).filter(Boolean) : TOOL_REGISTRY).slice(0, 6);
        homeToolShortcuts.innerHTML = shortcutTools.map((tool) => `
            <button type="button" class="shortcut-card" data-tool-id="${tool.id}">
                <strong>${tool.title}</strong>
                <span>${tool.description}</span>
            </button>
        `).join("");

        homeToolShortcuts.querySelectorAll(".shortcut-card").forEach((card) => {
            card.addEventListener("click", () => {
                activateView(card.dataset.toolId);
            });
        });
    };

    const updateShellMode = () => {
        appShell.classList.toggle("focus-mode", Boolean(state.focusMode));
        appShell.classList.toggle("tool-list-collapsed", Boolean(state.toolListCollapsed));
        if (focusModeBtn) {
            focusModeBtn.textContent = state.focusMode ? "退出专注" : "专注模式";
        }
        if (toggleToolListBtn) {
            toggleToolListBtn.textContent = state.toolListCollapsed ? "展开列表" : "收起列表";
        }
    };

    const updateFavoriteButton = () => {
        if (!favoriteToolBtn) {
            return;
        }
        const activeTool = getToolById(state.lastTool);
        favoriteToolBtn.disabled = !activeTool;
        favoriteToolBtn.textContent = activeTool && state.favoriteTools.includes(activeTool.id) ? "取消收藏" : "收藏";
    };

    const activateView = (target, options = {}) => {
        const targetView = document.querySelector(`.view[data-view="${target}"]`) || document.querySelector('.view[data-view="home"]');
        if (!targetView) {
            return;
        }

        views.forEach((view) => {
            view.classList.toggle("is-hidden", view !== targetView);
        });

        const tool = getToolById(targetView.dataset.view);
        const category = tool ? getCategoryById(tool.category) : getCategoryById("common");
        title.textContent = targetView.dataset.title || tool?.title || "常用工具";
        subtitle.textContent = targetView.dataset.subtitle || tool?.description || "";
        viewCategory.textContent = targetView.dataset.category || category?.title || "";

        if (tool) {
            state.lastTool = tool.id;
            state.lastCategory = tool.category;
            if (!options.skipRecent) {
                addRecentTool(state, tool.id);
            }
        } else {
            state.lastTool = "";
            state.lastCategory = "common";
        }

        saveShellState(state);
        render();
    };

    const render = () => {
        renderCategories();
        renderToolList();
        renderHomeShortcuts();
        updateShellMode();
        updateFavoriteButton();
    };

    searchInput?.addEventListener("input", () => {
        renderToolList();
    });

    clearSearchBtn?.addEventListener("click", () => {
        if (searchInput) {
            searchInput.value = "";
        }
        renderToolList();
    });

    focusModeBtn?.addEventListener("click", () => {
        state.focusMode = !state.focusMode;
        saveShellState(state);
        updateShellMode();
    });

    toggleToolListBtn?.addEventListener("click", () => {
        state.toolListCollapsed = !state.toolListCollapsed;
        saveShellState(state);
        updateShellMode();
    });

    favoriteToolBtn?.addEventListener("click", () => {
        const activeTool = getToolById(state.lastTool);
        if (!activeTool) {
            return;
        }
        if (state.favoriteTools.includes(activeTool.id)) {
            state.favoriteTools = state.favoriteTools.filter((id) => id !== activeTool.id);
        } else {
            state.favoriteTools = uniqueToolIds([activeTool.id, ...state.favoriteTools]);
        }
        saveShellState(state);
        render();
    });

    render();
    const initialTool = getToolById(state.lastTool);
    activateView(initialTool ? initialTool.id : "home", { skipRecent: true });
}
