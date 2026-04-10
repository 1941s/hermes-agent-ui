#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const wsUrl = process.env.HERMES_BENCH_WS_URL ?? "ws://localhost:8000/ws/agent";
const statsUrl = process.env.HERMES_BENCH_STATS_URL ?? "http://localhost:8000/replay/stats";
const durationSec = Number.parseInt(process.env.HERMES_BENCH_DURATION_SEC ?? "60", 10);
const outputPath = resolve(process.env.HERMES_BENCH_OUTPUT ?? `perf-reports/baseline-${Date.now()}.json`);
const minFpsEq = Number.parseFloat(process.env.HERMES_BENCH_MIN_FPS_EQ ?? "45");
const maxParseErrors = Number.parseInt(process.env.HERMES_BENCH_MAX_PARSE_ERRORS ?? "0", 10);
const maxWsErrors = Number.parseInt(process.env.HERMES_BENCH_MAX_WS_ERRORS ?? "0", 10);

if (typeof WebSocket === "undefined") {
  console.error("Global WebSocket is unavailable in this Node runtime.");
  console.error("Use Node.js 20+ or provide a runtime with WebSocket support.");
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchStats() {
  const res = await fetch(statsUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch stats: ${res.status}`);
  }
  return res.json();
}

async function runBaseline() {
  const startedAt = new Date().toISOString();
  const beforeStats = await fetchStats();
  const frameCounts = {};
  let totalFrames = 0;
  let firstSeq = null;
  let lastSeq = null;
  let parseErrors = 0;
  let wsErrors = [];

  const sessionId = `bench_${Date.now()}`;
  const ws = new WebSocket(wsUrl);

  const ready = new Promise((resolveReady, rejectReady) => {
    ws.onopen = () => resolveReady();
    ws.onerror = (e) => rejectReady(e);
  });
  await ready;

  ws.onmessage = (event) => {
    try {
      const frame = JSON.parse(String(event.data));
      totalFrames += 1;
      const type = String(frame.type ?? "UNKNOWN");
      frameCounts[type] = (frameCounts[type] ?? 0) + 1;
      if (typeof frame.seq === "number") {
        if (firstSeq === null) firstSeq = frame.seq;
        lastSeq = frame.seq;
      }
    } catch {
      parseErrors += 1;
    }
  };
  ws.onerror = (e) => wsErrors.push(String(e?.message ?? "ws-error"));

  ws.send(
    JSON.stringify({
      session_id: sessionId,
      message: "/benchmark",
      history: [],
      resume_from_seq: null,
    }),
  );

  await wait(durationSec * 1000);
  try {
    ws.close();
  } catch {
    // noop
  }

  const endedAt = new Date().toISOString();
  const afterStats = await fetchStats();

  const report = {
    startedAt,
    endedAt,
    durationSec,
    wsUrl,
    statsUrl,
    sessionId,
    summary: {
      totalFrames,
      framesPerSecEquivalent: Number((totalFrames / durationSec).toFixed(2)),
      firstSeq,
      lastSeq,
      parseErrors,
      wsErrors,
    },
    frameCounts,
    beforeStats,
    afterStats,
    thresholds: {
      minFpsEq,
      maxParseErrors,
      maxWsErrors,
    },
  };

  const failures = [];
  if (report.summary.framesPerSecEquivalent < minFpsEq) {
    failures.push(`framesPerSecEquivalent ${report.summary.framesPerSecEquivalent} < ${minFpsEq}`);
  }
  if (report.summary.parseErrors > maxParseErrors) {
    failures.push(`parseErrors ${report.summary.parseErrors} > ${maxParseErrors}`);
  }
  if (report.summary.wsErrors.length > maxWsErrors) {
    failures.push(`wsErrors ${report.summary.wsErrors.length} > ${maxWsErrors}`);
  }
  report.gate = {
    passed: failures.length === 0,
    failures,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Baseline report written to ${outputPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (!report.gate.passed) {
    console.error("Performance gate failed:");
    for (const failure of report.gate.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(2);
  }
}

runBaseline().catch((err) => {
  console.error("perf:baseline failed", err);
  process.exit(1);
});
