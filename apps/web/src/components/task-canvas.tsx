"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useCallback, useEffect, useMemo } from "react";

import { useTranslations } from "@/hooks/use-translations";

type AgentNodeData = { label: string; status?: string; kind?: string };

function AgentNodeInner({ data }: NodeProps<Node<AgentNodeData>>) {
  const { t } = useTranslations();
  const ns = t.hub.nodeStatus;
  const raw = (data.status ?? "idle").toLowerCase();
  const statusLabel =
    raw === "thinking"
      ? ns.thinking
      : raw === "done"
        ? ns.done
        : raw === "error"
          ? ns.error
          : ns.idle;
  return (
    <div className="min-w-[120px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-sidebar)] px-3 py-2 text-[12px] text-zinc-100 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{statusLabel}</div>
      <div className="font-medium">{data.label}</div>
    </div>
  );
}

const AgentNode = memo(AgentNodeInner);

export type GraphPayload = {
  nodes: Array<{
    id: string;
    label: string;
    status?: string;
    kind?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
};

function layoutNodes(g: GraphPayload): Node[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const level = new Map<string, number>();
  const roots = g.nodes.filter((n) => !g.edges.some((e) => e.target === n.id));
  const queue = [...roots.map((n) => n.id)];
  for (const r of queue) level.set(r, 0);
  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++]!;
    const lv = level.get(id) ?? 0;
    for (const e of g.edges) {
      if (e.source !== id) continue;
      const next = e.target;
      const prev = level.get(next);
      if (prev === undefined || lv + 1 > prev) {
        level.set(next, lv + 1);
        queue.push(next);
      }
    }
  }
  const buckets = new Map<number, string[]>();
  for (const n of g.nodes) {
    const lv = level.get(n.id) ?? 0;
    const arr = buckets.get(lv) ?? [];
    arr.push(n.id);
    buckets.set(lv, arr);
  }
  const xGap = 220;
  const yGap = 120;
  const out: Node[] = [];
  for (const [lv, ids] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    ids.sort();
    const width = (ids.length - 1) * xGap;
    ids.forEach((id, idx) => {
      const n = byId.get(id);
      if (!n) return;
      const x = -width / 2 + idx * xGap;
      const y = lv * yGap;
      const thinking = n.status === "thinking";
      out.push({
        id,
        position: { x, y },
        data: { label: n.label, status: n.status ?? "idle", kind: n.kind ?? "agent" },
        type: "agent",
        className: thinking ? "hermes-flow-node hermes-flow-node--thinking" : "hermes-flow-node",
      } satisfies Node<AgentNodeData>);
    });
  }
  return out;
}

function toEdges(g: GraphPayload): Edge[] {
  return g.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
  }));
}

type Props = {
  graph: GraphPayload | null;
  experimental?: boolean;
};

export function TaskCanvas({ graph, experimental }: Props) {
  const { t } = useTranslations();
  const noopConnect = useCallback(() => undefined, []);
  const initialNodes = useMemo(() => (graph ? layoutNodes(graph) : []), [graph]);
  const initialEdges = useMemo(() => (graph ? toEdges(graph) : []), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (!graph) return;
    setNodes(layoutNodes(graph));
    setEdges(toEdges(graph));
  }, [graph, setEdges, setNodes]);

  const nodeTypes = useMemo(
    () => ({
      agent: AgentNode,
    }),
    [],
  );

  return (
    <div className="relative h-[min(70vh,560px)] w-full overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
      {experimental ? (
        <div className="absolute bottom-3 left-3 z-10 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200/90">
          {t.hub.taskCanvas.experimentalBadge}
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={noopConnect}
        nodesConnectable={false}
        fitView
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap />
        <Controls />
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}
