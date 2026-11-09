import type { XYPosition } from "@xyflow/svelte";
import type { ElkNode, ELK } from "elkjs/lib/elk-api";

// «arrange»: positions from elkjs (layered, left to right) over the real node sizes. Each handle is a port at its
// real height on its side, so wires into the layers rows / animation tracks come in their order and don't cross.
// Plain data in, positions out — Editor reads sizes and handles from xyflow (nodes must be measured)

export type ArrangeHandle = { id: string | null; type: "source" | "target"; side: "left" | "right"; y: number };
export type ArrangeNode = { id: string; width: number; height: number; handles: ArrangeHandle[] };
export type ArrangeEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };

const NODE_GAP = 40;
const COLUMN_GAP = 80;

const LAYOUT = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": String(NODE_GAP),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(COLUMN_GAP),
  "elk.spacing.componentComponent": String(COLUMN_GAP),
  // keep the graph's order where elk has a choice — a layers node's chains stay in its rows' order
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  // straight chains: a node lines up with what it pulls
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
};

// A node's own pixel handles (id null) count for the layout as if both sat on its top line: elk lines up the
// ports of a link, so a chain's nodes line up by their headers, not by the output in the bottom-right corner
// (asked by the user 09.11) — the wire bends a little instead. Param handles keep their real height: the wires
// into the layers rows and the tracks still come in their order
const PIXEL_PORT_Y = 10;

const portId = (node: string, type: ArrangeHandle["type"], handle: string | null | undefined) => `${node}:${type}:${handle ?? ""}`;

// elkjs is ~1.4 MB — loaded on the first arrange, not with the page
let elk: Promise<ELK> | null = null;
const loadElk = () => (elk ??= import("elkjs/lib/elk.bundled.js").then(({ default: Elk }) => new Elk()));

export const arrange = async (nodes: readonly ArrangeNode[], edges: readonly ArrangeEdge[]): Promise<Map<string, XYPosition>> => {
  const ports = new Set<string>();
  const graph: ElkNode = {
    id: "root",
    layoutOptions: LAYOUT,
    children: nodes.map(({ id, width, height, handles }) => ({
      id,
      width,
      height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: handles.map(({ id: handle, type, side, y }) => {
        const port = portId(id, type, handle);
        ports.add(port);
        return {
          id: port,
          width: 0,
          height: 0,
          x: side === "left" ? 0 : width,
          y: handle === null ? PIXEL_PORT_Y : Math.min(height, Math.max(0, y)),
          layoutOptions: { "elk.port.side": side === "left" ? "WEST" : "EAST" },
        };
      }),
    })),
    // an end without a measured handle falls back to the node itself
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => {
      const from = portId(source, "source", sourceHandle);
      const to = portId(target, "target", targetHandle);
      return { id, sources: [ports.has(from) ? from : source], targets: [ports.has(to) ? to : target] };
    }),
  };
  const laid = await (await loadElk()).layout(graph);
  return new Map((laid.children ?? []).map(({ id, x = 0, y = 0 }) => [id, { x, y }]));
};
