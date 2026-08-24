import { cloneData } from "./utils.js";

export function buildGraphIndex(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  const incoming = new Map(nodes.map(node => [node.id, []]));

  for (const edge of edges) {
    if (outgoing.has(edge.from)) outgoing.get(edge.from).push(edge);
    if (incoming.has(edge.to)) incoming.get(edge.to).push(edge);
  }

  return { nodeById, outgoing, incoming };
}

export function getReachableNodeIds(graph = {}, startNodeId = graph.startNodeId) {
  const { outgoing, nodeById } = buildGraphIndex(graph);
  if (!startNodeId || !nodeById.has(startNodeId)) return new Set();
  const visited = new Set();
  const queue = [startNodeId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (!visited.has(edge.to)) queue.push(edge.to);
    }
  }
  return visited;
}

export function findCycle(graph = {}) {
  const { nodeById, outgoing } = buildGraphIndex(graph);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map([...nodeById.keys()].map(id => [id, WHITE]));
  const stack = [];

  function visit(id) {
    color.set(id, GRAY);
    stack.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (!nodeById.has(edge.to)) continue;
      const targetColor = color.get(edge.to) ?? WHITE;
      if (targetColor === GRAY) {
        const start = stack.indexOf(edge.to);
        return [...stack.slice(start), edge.to];
      }
      if (targetColor === WHITE) {
        const cycle = visit(edge.to);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of nodeById.keys()) {
    if (color.get(id) !== WHITE) continue;
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function topologicalSort(graph = {}) {
  const { nodeById, outgoing, incoming } = buildGraphIndex(graph);
  const indegree = new Map([...nodeById.keys()].map(id => [id, (incoming.get(id) ?? []).length]));
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const ordered = [];

  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (!indegree.has(edge.to)) continue;
      const next = indegree.get(edge.to) - 1;
      indegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    }
  }

  return ordered.length === nodeById.size ? ordered : null;
}

export function cloneGraph(graph) {
  return cloneData(graph ?? { nodes: [], edges: [], startNodeId: null, endNodeIds: [] });
}
