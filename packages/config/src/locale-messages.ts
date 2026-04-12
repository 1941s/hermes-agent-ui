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
    };
    brand: string;
    navAria: string;
    insights: {
      title: string;
      subtitle: string;
      sectionOptimizationLog: string;
      sectionToolMetrics: string;
      loading: string;
      sessionPrefix: string;
      tableTool: string;
      tableCalls: string;
      tableSuccesses: string;
      emptyMetrics: string;
    };
    skills: {
      title: string;
      subtitle: string;
      editorLink: string;
      sectionCatalog: string;
      sectionInstalled: string;
      tablePackage: string;
      tableVersion: string;
      remove: string;
      sectionInstallJson: string;
      placeholderJson: string;
      install: string;
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
      },
      brand: "Hermes WebUI",
      navAria: "主导航",
      insights: {
        title: "洞察 — 越用越强",
        subtitle: "策略变更是主叙事：红删绿增；工具指标为辅助信号。",
        sectionOptimizationLog: "自动优化日志（Diff）",
        sectionToolMetrics: "工具调用聚合（辅助）",
        loading: "加载中…",
        sessionPrefix: "会话",
        tableTool: "工具",
        tableCalls: "调用",
        tableSuccesses: "成功",
        emptyMetrics: "暂无聚合数据（与 Agent 对话并触发工具后会累积）。",
      },
      skills: {
        title: "Skill Hub",
        subtitle: "`skill.json` 由服务端 JSON Schema 校验；Mock 包也必须合规。",
        editorLink: "编辑器 / 沙箱（D2）",
        sectionCatalog: "目录（catalog）",
        sectionInstalled: "已安装",
        tablePackage: "包",
        tableVersion: "版本",
        remove: "移除",
        sectionInstallJson: "从 JSON 安装（校验）",
        placeholderJson: "粘贴完整 skill.json（需符合 packages/skill-spec/schema.json）",
        install: "安装",
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
      },
      brand: "Hermes WebUI",
      navAria: "Primary navigation",
      insights: {
        title: "Insights — stronger with use",
        subtitle: "Policy changes are the story (red/green diff); tool metrics are secondary.",
        sectionOptimizationLog: "Auto-optimization log (Diff)",
        sectionToolMetrics: "Tool call rollup (auxiliary)",
        loading: "Loading…",
        sessionPrefix: "session",
        tableTool: "tool",
        tableCalls: "calls",
        tableSuccesses: "successes",
        emptyMetrics: "No rollup yet (chat with the agent and use tools to accumulate).",
      },
      skills: {
        title: "Skill Hub",
        subtitle: "`skill.json` is validated server-side with JSON Schema; mock packages must comply too.",
        editorLink: "Editor / sandbox (D2)",
        sectionCatalog: "Catalog",
        sectionInstalled: "Installed",
        tablePackage: "package",
        tableVersion: "version",
        remove: "Remove",
        sectionInstallJson: "Install from JSON (validated)",
        placeholderJson: "Paste a full skill.json (must match packages/skill-spec/schema.json)",
        install: "Install",
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
