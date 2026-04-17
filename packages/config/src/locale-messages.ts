export type Locale = "zh" | "en";

export const defaultLocale: Locale = "zh";

export type Messages = {
  appName: string;
  tagline: string;
  panes: {
    chat: string;
    workspace: string;
    artifacts: string;
    reasoning: string;
    observability: string;
  };
  actions: {
    send: string;
    stop: string;
    runBenchmark: string;
    placeholder: string;
  };
  labels: {
    online: string;
    offline: string;
    preview: string;
    toolLogs: string;
    noToolLogs: string;
    artifacts: string;
    truncatedByServer: string;
    originalLength: string;
    debug: string;
    lastSeq: string;
    resumeSent: string;
    reconnectAttempts: string;
    queuedMessages: string;
    replayHits: string;
    replayMisses: string;
    artifactTruncated: string;
    diagnostics: string;
    demoTemplates: string;
    policyBlocked: string;
    blockReason: string;
    virtualizedMode: string;
    renderedWindow: string;
    fps: string;
    droppedFrames: string;
    refreshing: string;
    live: string;
    fpsAvg60: string;
    droppedAvg60: string;
    benchmarkSessions: string;
    totalFrames: string;
    emptyChatHint: string;
    scrollToBottom: string;
    connection: string;
    language: string;
    /** Chat transcript: screen-reader labels */
    chatUser: string;
    chatAssistant: string;
    /** Session list + new chat (IndexedDB sessions) */
    newChat: string;
    chatSessions: string;
    loadingChat: string;
    /** Clarify / choice tool UI */
    clarifyPickOne: string;
    clarifyFallbackHint: string;
    clarifyYourChoice: string;
  };
  states: {
    thinking: string;
    responding: string;
    idle: string;
    /** Clarify tool is blocked until the user picks an option on the same connection */
    waitingClarify: string;
    /** Partial reply visible but model still reasoning / streaming next chunk */
    continuing: string;
  };
  demoPrompts: readonly { id: string; label: string; prompt: string }[];
  hub: {
    nav: {
      chat: string;
      insights: string;
      skills: string;
      orchestration: string;
      settings: string;
    };
    brand: string;
    navAria: string;
    insights: {
      title: string;
      subtitle: string;
      sectionOverview: string;
      sectionOptimizationLog: string;
      sectionToolMetrics: string;
      sectionTimeseries: string;
      sectionToolsTop: string;
      sectionTraceDrilldown: string;
      sectionClarify: string;
      loading: string;
      noData: string;
      sessionPrefix: string;
      windowLabel: string;
      bucketLabel: string;
      traceIdLabel: string;
      loadTrace: string;
      kpiTurns: string;
      kpiTurnSuccessRate: string;
      kpiP50: string;
      kpiP95: string;
      kpiToolSuccessRate: string;
      kpiClarifyTimeoutRate: string;
      tableTool: string;
      tableCalls: string;
      tableSuccesses: string;
      tableAvgLatency: string;
      tableSuccessRate: string;
      emptyMetrics: string;
    };
    skills: {
      title: string;
      subtitle: string;
      editorLink: string;
      languageToggleAria: string;
      langZh: string;
      langEn: string;
      sectionCatalog: string;
      sectionInstalled: string;
      tablePackage: string;
      tableVersion: string;
      tableEnabled: string;
      tableRuntimeSync: string;
      remove: string;
      delete: string;
      sectionInstallJson: string;
      placeholderJson: string;
      install: string;
      searchPlaceholder: string;
      itemsCountSuffix: string;
      installFromHubTitle: string;
      searchHubPlaceholder: string;
      searchHubButton: string;
      searchHubResultsTitle: string;
      useThisIdentifier: string;
      inspectThisSkill: string;
      inspectResultTitle: string;
      searchHubNoResult: string;
      paginationPrev: string;
      paginationNext: string;
      paginationPagePrefix: string;
      paginationTotalPrefix: string;
      pageSizeUnit: string;
      installFromHubPlaceholder: string;
      installViaCli: string;
      cleanupCatalogShadows: string;
      cleanupDonePrefix: string;
      cleanupDoneSuffix: string;
      deleteCatalogDonePrefix: string;
      installFromHubHint: string;
      installFromHubEmptyError: string;
      installFromHubOkPrefix: string;
      installFromHubOkImportedPrefix: string;
      installFromHubOkImportedSuffix: string;
      skillEnabledSynced: string;
      skillDisabledRuntime: string;
      installedBadge: string;
      installing: string;
      installedState: string;
      deleting: string;
      loadingShort: string;
      runtimePending: string;
      removing: string;
      installedOk: string;
      uninstalledOk: string;
      sectionDepGraph: string;
      depGraphHint: string;
    };
    orchestration: {
      title: string;
      subtitle: string;
      forkSession: string;
      loadDemo: string;
      sessionLabel: string;
      timeTravelLabel: string;
      noGraphHint: string;
    };
    settings: {
      title: string;
      subtitle: string;
      endpointCardTitle: string;
      endpointCardDesc: string;
      baseUrlLabel: string;
      baseUrlPlaceholder: string;
      apiKeyLabel: string;
      apiKeyPlaceholder: string;
      modelNameLabel: string;
      modelNamePlaceholder: string;
      save: string;
      reset: string;
      saved: string;
      runtimeHint: string;
      maskedConfigured: string;
      testPathHint: string;
      testConnection: string;
      testingConnection: string;
      testSuccess: string;
      testFailedPrefix: string;
      securityHint: string;
    };
    editor: {
      title: string;
      subtitle: string;
      backToHub: string;
      runSandbox: string;
    };
    strategyDiff: {
      removed: string;
      added: string;
      rationale: string;
    };
    taskCanvas: {
      experimentalBadge: string;
    };
    nodeStatus: {
      idle: string;
      thinking: string;
      done: string;
      error: string;
    };
    sidebar: {
      collapse: string;
      expand: string;
      productAria: string;
      /** Short badge for hub routes still under active development */
      navDevBadge: string;
    };
  };
};

export const messages: Record<Locale, Messages> = {
  zh: {
    appName: "Hermes Agent",
    tagline: "工业级流式推理 · 零信任产物 · 会话可恢复",
    panes: {
      chat: "对话",
      workspace: "工作区",
      artifacts: "产物与预览",
      reasoning: "推理轨迹",
      observability: "观测",
    },
    actions: {
      send: "发送",
      stop: "停止生成",
      runBenchmark: "性能压测",
      placeholder: "输入问题，Enter 发送…",
    },
    labels: {
      online: "已连接",
      offline: "未连接",
      preview: "回复预览",
      toolLogs: "工具日志",
      noToolLogs: "暂无内容",
      artifacts: "结构化产物",
      truncatedByServer: "服务端已截断",
      originalLength: "原始长度",
      debug: "连接调试",
      lastSeq: "最后序号",
      resumeSent: "已发送恢复",
      reconnectAttempts: "重连次数",
      queuedMessages: "队列消息",
      replayHits: "回放命中",
      replayMisses: "回放未命中",
      artifactTruncated: "产物截断次数",
      diagnostics: "可观测性",
      demoTemplates: "一键演示",
      policyBlocked: "安全策略拦截，已以纯文本展示。",
      blockReason: "原因",
      virtualizedMode: "虚拟滚动",
      renderedWindow: "渲染窗口",
      fps: "帧率",
      droppedFrames: "掉帧",
      refreshing: "刷新中",
      live: "实时",
      fpsAvg60: "60s 平均帧率",
      droppedAvg60: "60s 平均掉帧",
      benchmarkSessions: "压测会话",
      totalFrames: "总帧数",
      emptyChatHint: "向 Hermes 提问，或点击下方模板快速体验推理流与产物面板。",
      scrollToBottom: "回到底部",
      connection: "链路",
      language: "语言",
      chatUser: "你的消息",
      chatAssistant: "助手回复",
      newChat: "新对话",
      chatSessions: "历史会话",
      loadingChat: "正在加载会话…",
      clarifyPickOne: "请选择一项",
      clarifyFallbackHint:
        "工具返回异常时仍可在下方点选；你的选择会作为下一条消息发给模型以继续对话。",
      clarifyYourChoice: "已选择：",
    },
    states: {
      thinking: "推理中",
      responding: "生成中",
      idle: "就绪",
      waitingClarify: "等待你的选择",
      continuing: "继续推理中",
    },
    demoPrompts: [
      {
        id: "doc-summary",
        label: "协议摘要",
        prompt:
          "请阅读后端 WebSocket 协议并用 5 条要点总结，再输出一个 JSON 产物描述各类帧类型。",
      },
      {
        id: "code-explain",
        label: "重连策略",
        prompt:
          "用通俗语言解释客户端断线重连策略与边界情况，并给出 Markdown 清单式产物用于生产检查。",
      },
      {
        id: "artifact-gen",
        label: "发布清单",
        prompt:
          "为本 monorepo（Web/API/安全/性能）写一份发布检查清单，回复简洁并附带 Markdown 产物。",
      },
    ],
    hub: {
      nav: {
        chat: "对话",
        insights: "洞察",
        skills: "技能",
        orchestration: "编排",
        settings: "配置",
      },
      brand: "Hermes WebUI",
      navAria: "主导航",
      insights: {
        title: "洞察 — 越用越强",
        subtitle: "策略变更是主叙事：红删绿增；工具指标为辅助信号。",
        sectionOverview: "运行总览",
        sectionOptimizationLog: "自动优化日志（Diff）",
        sectionToolMetrics: "工具调用聚合（辅助）",
        sectionTimeseries: "时序趋势",
        sectionToolsTop: "工具健康排行",
        sectionTraceDrilldown: "Trace 下钻",
        sectionClarify: "Clarify 洞察",
        loading: "加载中…",
        noData: "暂无数据",
        sessionPrefix: "会话",
        windowLabel: "窗口",
        bucketLabel: "粒度",
        traceIdLabel: "Trace ID",
        loadTrace: "加载 Trace",
        kpiTurns: "会话轮次",
        kpiTurnSuccessRate: "轮次成功率",
        kpiP50: "P50 延迟",
        kpiP95: "P95 延迟",
        kpiToolSuccessRate: "工具成功率",
        kpiClarifyTimeoutRate: "Clarify 超时率",
        tableTool: "工具",
        tableCalls: "调用",
        tableSuccesses: "成功",
        tableAvgLatency: "平均延迟(ms)",
        tableSuccessRate: "成功率",
        emptyMetrics: "暂无聚合数据（与 Agent 对话并触发工具后会累积）。",
      },
      skills: {
        title: "Skill Hub",
        subtitle: "`skill.json` 由服务端 JSON Schema 校验；Mock 包也必须合规。",
        editorLink: "编辑器 / 沙箱（D2）",
        languageToggleAria: "技能页语言切换",
        langZh: "中文",
        langEn: "EN",
        sectionCatalog: "目录（catalog）",
        sectionInstalled: "已安装",
        tablePackage: "包",
        tableVersion: "版本",
        tableEnabled: "启用",
        tableRuntimeSync: "运行时同步",
        remove: "移除",
        delete: "删除",
        sectionInstallJson: "从 JSON 安装（校验）",
        placeholderJson: "粘贴完整 skill.json（需符合 packages/skill-spec/schema.json）",
        install: "安装",
        searchPlaceholder: "按名称 / 描述 / 标签搜索技能",
        itemsCountSuffix: "项",
        installFromHubTitle: "从 Hermes Hub 安装",
        searchHubPlaceholder: "搜索技能名称",
        searchHubButton: "搜索 Hub",
        searchHubResultsTitle: "搜索结果",
        useThisIdentifier: "使用该标识",
        inspectThisSkill: "查看详情",
        inspectResultTitle: "技能详情预览",
        searchHubNoResult: "未找到匹配项，请尝试更具体关键词。",
        paginationPrev: "上一页",
        paginationNext: "下一页",
        paginationPagePrefix: "第",
        paginationTotalPrefix: "共",
        pageSizeUnit: "页",
        installFromHubPlaceholder: "请输入技能标识",
        installViaCli: "通过 CLI 安装",
        cleanupCatalogShadows: "清理目录阴影项",
        cleanupDonePrefix: "目录清理完成，已移除",
        cleanupDoneSuffix: "个阴影版本项。",
        deleteCatalogDonePrefix: "已删除目录项：",
        installFromHubHint: "服务端会执行 hermes skills install <identifier>，然后自动把运行时技能同步到 UI 数据库。",
        installFromHubEmptyError: "请先输入 Hub 技能标识。",
        installFromHubOkPrefix: "Hub 安装成功：",
        installFromHubOkImportedPrefix: "已导入",
        installFromHubOkImportedSuffix: "个运行时技能到控制面。",
        skillEnabledSynced: "技能已启用并同步到运行时。",
        skillDisabledRuntime: "技能已在运行时禁用。",
        installedBadge: "已安装",
        installing: "安装中...",
        installedState: "已安装",
        deleting: "删除中...",
        loadingShort: "加载中...",
        runtimePending: "待同步",
        removing: "移除中...",
        installedOk: "已安装。",
        uninstalledOk: "已卸载。",
        sectionDepGraph: "依赖图（D3）",
        depGraphHint: "边（示例：demo-skill → base-tool）",
      },
      orchestration: {
        title: "编排 — 任务画布",
        subtitle: "流式节点状态 + 思考态流光边框；Time Travel 回放分叉 / 并行 / 合并（Mock 快照）。",
        forkSession: "Fork 会话",
        loadDemo: "加载 Demo 快照",
        sessionLabel: "会话",
        timeTravelLabel: "Time Travel（revision）",
        noGraphHint:
          "当前会话没有任务图快照（例如刚 Fork 的子会话）。点击「加载 Demo 快照」查看 Mock 分叉 / 并行 / 合并回放。",
      },
      settings: {
        title: "模型 API 配置",
        subtitle: "配置生产可用的模型供应商凭据。系统将按会话把凭据安全透传到推理网关，不改动 Hermes 控制面地址。",
        endpointCardTitle: "模型供应商接入",
        endpointCardDesc:
          "填写 OpenAI / Azure OpenAI / 兼容网关的 Base URL 与 API Key。建议使用专用子账号 Key，并开启最小权限策略。",
        baseUrlLabel: "模型 Base URL",
        baseUrlPlaceholder: "https://api.example.com",
        apiKeyLabel: "模型 API Key",
        apiKeyPlaceholder: "sk-xxxxxxxx",
        modelNameLabel: "模型名称",
        modelNamePlaceholder: "例如：qwen-plus / gpt-4o-mini / claude-3-5-sonnet",
        save: "保存配置",
        reset: "清空配置",
        saved: "配置已保存",
        runtimeHint: "当前配置保存在本地浏览器，仅作用于本设备。",
        maskedConfigured: "已配置",
        testPathHint: "运行时将通过安全请求头透传给后端（X-Model-Base-Url / X-Model-Api-Key）。",
        testConnection: "测试连接",
        testingConnection: "测试中…",
        testSuccess: "连接成功，可用于模型调用。",
        testFailedPrefix: "连接失败：",
        securityHint: "安全建议：请勿复用个人主密钥，推荐创建可轮换、可审计、最小权限的服务密钥。",
      },
      editor: {
        title: "Skill 编辑器 / 沙箱（D2 stub）",
        subtitle: "当前为占位执行：无真实隔离。生产环境需容器/受限进程与供应链审计。",
        backToHub: "← 返回 Skill Hub",
        runSandbox: "在沙箱中运行（stub）",
      },
      strategyDiff: {
        removed: "删除",
        added: "新增",
        rationale: "依据",
      },
      taskCanvas: {
        experimentalBadge: "实验性 · Mock / 启发式图",
      },
      nodeStatus: {
        idle: "空闲",
        thinking: "思考中",
        done: "完成",
        error: "错误",
      },
      sidebar: {
        collapse: "收起侧栏",
        expand: "展开侧栏",
        productAria: "Hermes 产品导航",
        navDevBadge: "开发中",
      },
    },
  },
  en: {
    appName: "Hermes Agent",
    tagline: "Industrial streaming · Zero-trust artifacts · Resilient sessions",
    panes: {
      chat: "Chat",
      workspace: "Workspace",
      artifacts: "Artifacts & Preview",
      reasoning: "Reasoning Trace",
      observability: "Observability",
    },
    actions: {
      send: "Send",
      stop: "Stop",
      runBenchmark: "Benchmark",
      placeholder: "Message Hermes…",
    },
    labels: {
      online: "Online",
      offline: "Offline",
      preview: "Preview",
      toolLogs: "Tool Logs",
      noToolLogs: "Nothing here yet",
      artifacts: "Artifacts",
      truncatedByServer: "Truncated by server",
      originalLength: "Original length",
      debug: "Connection",
      lastSeq: "last_seq",
      resumeSent: "resume_sent",
      reconnectAttempts: "reconnect_attempts",
      queuedMessages: "queued_messages",
      replayHits: "replay_hits",
      replayMisses: "replay_misses",
      artifactTruncated: "artifact_truncated",
      diagnostics: "Diagnostics",
      demoTemplates: "Demo templates",
      policyBlocked: "Blocked by security policy; shown as plain text.",
      blockReason: "reason",
      virtualizedMode: "Virtualized",
      renderedWindow: "Window",
      fps: "FPS",
      droppedFrames: "Dropped",
      refreshing: "Refreshing",
      live: "Live",
      fpsAvg60: "fps_avg_60s",
      droppedAvg60: "dropped_avg_60s",
      benchmarkSessions: "benchmark_sessions",
      totalFrames: "total_frames",
      emptyChatHint: "Ask Hermes anything, or try a demo template below.",
      scrollToBottom: "Scroll to bottom",
      connection: "Link",
      language: "Language",
      chatUser: "Your message",
      chatAssistant: "Assistant reply",
      newChat: "New chat",
      chatSessions: "Past chats",
      loadingChat: "Loading conversation…",
      clarifyPickOne: "Pick one option",
      clarifyFallbackHint:
        "If the tool returned an error, you can still choose below; your pick is sent as the next message.",
      clarifyYourChoice: "You selected:",
    },
    states: {
      thinking: "Thinking",
      responding: "Responding",
      idle: "Idle",
      waitingClarify: "Waiting for your choice",
      continuing: "Still reasoning",
    },
    demoPrompts: [
      {
        id: "doc-summary",
        label: "Summarize API",
        prompt:
          "Read the backend websocket protocol and summarize it in 5 bullet points, then provide one JSON artifact that captures the frame taxonomy.",
      },
      {
        id: "code-explain",
        label: "Reconnect logic",
        prompt:
          "Explain the client reconnect strategy in simple terms, include edge cases, and provide a markdown checklist artifact for production readiness.",
      },
      {
        id: "artifact-gen",
        label: "Release checklist",
        prompt:
          "Create a release checklist for this monorepo (web/api/security/perf). Return both a concise response and an artifact in markdown format.",
      },
    ],
    hub: {
      nav: {
        chat: "Chat",
        insights: "Insights",
        skills: "Skills",
        orchestration: "Orchestration",
        settings: "Settings",
      },
      brand: "Hermes WebUI",
      navAria: "Primary navigation",
      insights: {
        title: "Insights — stronger with use",
        subtitle: "Policy changes are the story (red/green diff); tool metrics are secondary.",
        sectionOverview: "Overview",
        sectionOptimizationLog: "Auto-optimization log (Diff)",
        sectionToolMetrics: "Tool call rollup (auxiliary)",
        sectionTimeseries: "Time series",
        sectionToolsTop: "Top tool health",
        sectionTraceDrilldown: "Trace drilldown",
        sectionClarify: "Clarify analytics",
        loading: "Loading…",
        noData: "No data",
        sessionPrefix: "session",
        windowLabel: "window",
        bucketLabel: "bucket",
        traceIdLabel: "Trace ID",
        loadTrace: "Load trace",
        kpiTurns: "Turns",
        kpiTurnSuccessRate: "Turn success rate",
        kpiP50: "P50 latency",
        kpiP95: "P95 latency",
        kpiToolSuccessRate: "Tool success rate",
        kpiClarifyTimeoutRate: "Clarify timeout rate",
        tableTool: "tool",
        tableCalls: "calls",
        tableSuccesses: "successes",
        tableAvgLatency: "avg latency(ms)",
        tableSuccessRate: "success rate",
        emptyMetrics: "No rollup yet (chat with the agent and use tools to accumulate).",
      },
      skills: {
        title: "Skill Hub",
        subtitle: "`skill.json` is validated server-side with JSON Schema; mock packages must comply too.",
        editorLink: "Editor / sandbox (D2)",
        languageToggleAria: "Skills language switch",
        langZh: "中文",
        langEn: "EN",
        sectionCatalog: "Catalog",
        sectionInstalled: "Installed",
        tablePackage: "package",
        tableVersion: "version",
        tableEnabled: "enabled",
        tableRuntimeSync: "runtime sync",
        remove: "Remove",
        delete: "Delete",
        sectionInstallJson: "Install from JSON (validated)",
        placeholderJson: "Paste a full skill.json (must match packages/skill-spec/schema.json)",
        install: "Install",
        searchPlaceholder: "Search skills by name / description / tags",
        itemsCountSuffix: "items",
        installFromHubTitle: "Install From Hermes Hub",
        searchHubPlaceholder: "Search skill keywords first (e.g. creator / github / code)",
        searchHubButton: "Search Hub",
        searchHubResultsTitle: "Search results",
        useThisIdentifier: "Use this identifier",
        inspectThisSkill: "Inspect details",
        inspectResultTitle: "Skill detail preview",
        searchHubNoResult: "No matches found. Try a more specific keyword.",
        paginationPrev: "Prev",
        paginationNext: "Next",
        paginationPagePrefix: "Page",
        paginationTotalPrefix: "Total",
        pageSizeUnit: "page",
        installFromHubPlaceholder: "xitter  or  openai/skills/skill-creator",
        installViaCli: "Install via CLI",
        cleanupCatalogShadows: "Cleanup Catalog Shadows",
        cleanupDonePrefix: "Catalog cleanup done. Removed",
        cleanupDoneSuffix: "shadow version entries.",
        deleteCatalogDonePrefix: "Deleted catalog item:",
        installFromHubHint: "Server executes hermes skills install <identifier>, then auto-syncs runtime skills into UI DB.",
        installFromHubEmptyError: "Please input a hub skill identifier.",
        installFromHubOkPrefix: "Hub install succeeded:",
        installFromHubOkImportedPrefix: "Imported",
        installFromHubOkImportedSuffix: "runtime skills into control plane.",
        skillEnabledSynced: "Skill enabled and synced to runtime.",
        skillDisabledRuntime: "Skill disabled in runtime.",
        installedBadge: "Installed",
        installing: "Installing...",
        installedState: "Installed",
        deleting: "Deleting...",
        loadingShort: "...",
        runtimePending: "pending",
        removing: "Removing...",
        installedOk: "Installed.",
        uninstalledOk: "Uninstalled.",
        sectionDepGraph: "Dependency graph (D3)",
        depGraphHint: "Edges (demo: demo-skill → base-tool)",
      },
      orchestration: {
        title: "Orchestration — task canvas",
        subtitle:
          "Streaming node state + thinking rim; Time Travel replays fork / parallel / merge (mock snapshots).",
        forkSession: "Fork session",
        loadDemo: "Load demo snapshots",
        sessionLabel: "session",
        timeTravelLabel: "Time Travel (revision)",
        noGraphHint:
          "No task graph for this session (e.g. a freshly forked child). Use “Load demo snapshots” to replay mock fork/parallel/merge.",
      },
      settings: {
        title: "Model API Settings",
        subtitle:
          "Configure production-ready provider credentials. They are securely forwarded per session to the inference gateway without changing Hermes control-plane endpoints.",
        endpointCardTitle: "Model Provider Integration",
        endpointCardDesc:
          "Use OpenAI / Azure OpenAI / compatible gateway Base URL and API key. Prefer scoped service keys with least-privilege access.",
        baseUrlLabel: "Model Base URL",
        baseUrlPlaceholder: "https://api.example.com",
        apiKeyLabel: "Model API Key",
        apiKeyPlaceholder: "sk-xxxxxxxx",
        modelNameLabel: "Model Name",
        modelNamePlaceholder: "e.g. qwen-plus / gpt-4o-mini / claude-3-5-sonnet",
        save: "Save",
        reset: "Clear",
        saved: "Saved",
        runtimeHint: "Stored in this browser only; affects this device.",
        maskedConfigured: "configured",
        testPathHint: "Forwarded at runtime in secure headers: X-Model-Base-Url / X-Model-Api-Key.",
        testConnection: "Test connection",
        testingConnection: "Testing…",
        testSuccess: "Connection verified and ready.",
        testFailedPrefix: "Connection failed: ",
        securityHint: "Security tip: avoid personal root keys; use scoped, rotatable service keys with audit trails.",
      },
      editor: {
        title: "Skill editor / sandbox (D2 stub)",
        subtitle: "Placeholder execution only — no real isolation. Production needs sandboxing and supply-chain review.",
        backToHub: "← Back to Skill Hub",
        runSandbox: "Run in sandbox (stub)",
      },
      strategyDiff: {
        removed: "Removed",
        added: "Added",
        rationale: "Rationale",
      },
      taskCanvas: {
        experimentalBadge: "Experimental · mock / heuristic graph",
      },
      nodeStatus: {
        idle: "idle",
        thinking: "thinking",
        done: "done",
        error: "error",
      },
      sidebar: {
        collapse: "Collapse sidebar",
        expand: "Expand sidebar",
        productAria: "Hermes product navigation",
        navDevBadge: "Dev",
      },
    },
  },
};
