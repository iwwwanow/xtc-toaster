export type PanelType =
  | "viewport"
  | "timeline"
  | "fcurve"
  | "layers"
  | "properties"
  | "editor";

export interface AreaNode {
  kind: "area";
  id: string;
  type: PanelType;
}

export interface SplitNode {
  kind: "split";
  id: string;
  direction: "h" | "v"; // h = left|right, v = top|bottom
  ratio: number; // 0–1, fraction given to first child
  a: LayoutNode;
  b: LayoutNode;
}

export type LayoutNode = AreaNode | SplitNode;

let _nextId = 0;
const uid = () => String(++_nextId);

// ── default layout ────────────────────────────────────────────────────────────
//
//  ┌────────────────────┬──────────────────┐
//  │                    │      editor      │
//  │      viewport      ├──────────────────┤
//  │                    │  layers | props  │
//  ├────────────────────┴──────────────────┤
//  │                timeline               │
//  ├───────────────────────────────────────┤
//  │               f-curve                 │
//  └───────────────────────────────────────┘

const defaultLayout: LayoutNode = {
  kind: "split",
  id: uid(),
  direction: "v",
  ratio: 0.55,
  a: {
    kind: "split",
    id: uid(),
    direction: "v",
    ratio: 0.65,
    a: {
      kind: "split",
      id: uid(),
      direction: "h",
      ratio: 0.55,
      a: { kind: "area", id: uid(), type: "viewport" },
      b: {
        kind: "split",
        id: uid(),
        direction: "v",
        ratio: 0.62,
        a: { kind: "area", id: uid(), type: "editor" },
        b: {
          kind: "split",
          id: uid(),
          direction: "h",
          ratio: 0.5,
          a: { kind: "area", id: uid(), type: "layers" },
          b: { kind: "area", id: uid(), type: "properties" },
        },
      },
    },
    b: { kind: "area", id: uid(), type: "timeline" },
  },
  b: { kind: "area", id: uid(), type: "fcurve" },
};

// ── reactive state ─────────────────────────────────────────────────────────────

export const layoutStore = (() => {
  let root = $state<LayoutNode>(defaultLayout);

  function updateRatio(id: string, ratio: number) {
    root = updateNodeRatio(root, id, ratio);
  }

  return {
    get root() {
      return root;
    },
    updateRatio,
  };
})();

// ── helpers ────────────────────────────────────────────────────────────────────

function updateNodeRatio(node: LayoutNode, id: string, ratio: number): LayoutNode {
  if (node.kind === "area") return node;
  if (node.id === id) return { ...node, ratio };
  return {
    ...node,
    a: updateNodeRatio(node.a, id, ratio),
    b: updateNodeRatio(node.b, id, ratio),
  };
}
