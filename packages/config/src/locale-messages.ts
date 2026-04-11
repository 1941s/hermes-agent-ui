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
  };
  states: {
    thinking: string;
    responding: string;
    idle: string;
  };
  demoPrompts: readonly { id: string; label: string; prompt: string }[];
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
    },
    states: {
      thinking: "推理中",
      responding: "生成中",
      idle: "就绪",
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
    },
    states: {
      thinking: "Thinking",
      responding: "Responding",
      idle: "Idle",
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
  },
};
