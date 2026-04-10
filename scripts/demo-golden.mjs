#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const wsUrl = process.env.HERMES_DEMO_WS_URL ?? "ws://localhost:8000/ws/agent";
const authToken = process.env.HERMES_DEMO_AUTH_TOKEN ?? "";
const outputPath = resolve(process.env.HERMES_DEMO_OUTPUT ?? `perf-reports/demo-${Date.now()}.json`);
const timeoutMs = Number.parseInt(process.env.HERMES_DEMO_TIMEOUT_MS ?? "45000", 10);

if (typeof WebSocket === "undefined") {
  console.error("Global WebSocket is unavailable in this Node runtime.");
  process.exit(1);
}

if (!authToken) {
  console.error("Missing HERMES_DEMO_AUTH_TOKEN");
  process.exit(1);
}

const demoPrompts = [
  "Read the backend websocket protocol and summarize it in 5 bullet points, then provide one JSON artifact that captures the frame taxonomy.",
  "Explain the client reconnect strategy in simple terms, include edge cases, and provide a markdown checklist artifact for production readiness.",
  "Create a release checklist for this monorepo (web/api/security/perf). Return both a concise response and an artifact in markdown format.",
];

async function runPrompt(prompt, index) {
  const sessionId = `demo_${Date.now()}_${index}`;
  const ws = new WebSocket(wsUrl);

  const run = await new Promise((resolve, reject) => {
    const result = {
      prompt,
      sessionId,
      counts: {},
      totalFrames: 0,
      firstSeq: null,
      lastSeq: null,
      finalResponseSeen: false,
      errors: [],
    };

    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // noop
      }
      resolve(result);
    };

    timer = setTimeout(() => {
      result.errors.push("timeout");
      finish();
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          session_id: sessionId,
          auth_token: authToken,
          message: prompt,
          history: [],
          resume_from_seq: null,
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data));
        const type = String(frame.type ?? "UNKNOWN");
        result.totalFrames += 1;
        result.counts[type] = (result.counts[type] ?? 0) + 1;
        if (typeof frame.seq === "number") {
          if (result.firstSeq === null) result.firstSeq = frame.seq;
          result.lastSeq = frame.seq;
        }
        if (type === "ERROR") {
          result.errors.push(String(frame.payload?.code ?? "UNKNOWN_ERROR"));
          finish();
        }
        if (type === "RESPONSE" && frame.payload?.final === true) {
          result.finalResponseSeen = true;
          finish();
        }
      } catch {
        result.errors.push("parse_error");
        finish();
      }
    };

    ws.onerror = (e) => {
      result.errors.push(String(e?.message ?? "ws_error"));
      finish();
    };

    ws.onclose = () => {
      if (!result.finalResponseSeen && result.errors.length === 0) {
        result.errors.push("closed_before_final_response");
      }
      finish();
    };
  });

  return run;
}

async function runDemo() {
  const runs = [];
  for (let i = 0; i < demoPrompts.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runPrompt(demoPrompts[i], i);
    runs.push(result);
  }

  const report = {
    startedAt: new Date().toISOString(),
    wsUrl,
    prompts: demoPrompts.length,
    runs,
    summary: {
      passed: runs.every((r) => r.finalResponseSeen && r.errors.length === 0),
      totalFrames: runs.reduce((acc, cur) => acc + cur.totalFrames, 0),
      failures: runs
        .filter((r) => !r.finalResponseSeen || r.errors.length > 0)
        .map((r) => ({ sessionId: r.sessionId, errors: r.errors })),
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Golden demo report written to ${outputPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (!report.summary.passed) {
    process.exit(2);
  }
}

runDemo().catch((err) => {
  console.error("demo:golden failed", err);
  process.exit(1);
});
