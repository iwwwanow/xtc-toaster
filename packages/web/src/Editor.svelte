<script lang="ts">
  import {
    Background,
    ControlButton,
    Controls,
    Position,
    SvelteFlow,
    useNodesInitialized,
    useSvelteFlow,
    type Connection,
    type Edge,
  } from "@xyflow/svelte";
  import { tick, untrack } from "svelte";
  import { arrange, type ArrangeHandle, type ArrangeNode } from "./arrange";
  import LinkEdge from "./edges/LinkEdge.svelte";
  import { isMenuNodeType, NODE_TYPE_MIME, type FlowNode } from "./graph";
  import { nodeTypes } from "./nodes";
  import ActionsPanel from "./panels/ActionsPanel.svelte";
  import ConnectionPanel from "./panels/ConnectionPanel.svelte";
  import NodeMenu from "./panels/NodeMenu.svelte";
  import VersionPanel from "./panels/VersionPanel.svelte";
  import { session } from "./session.svelte";

  const { screenToFlowPosition, deleteElements, fitView, getInternalNode } = useSvelteFlow<FlowNode, Edge>();
  const nodesInitialized = useNodesInitialized();

  // elk needs the real sizes and handle positions — only measured nodes have them; false — not all measured yet
  const arrangeNodes = async (): Promise<boolean> => {
    const boxes: ArrangeNode[] = [];
    for (const { id } of session.nodes) {
      const node = getInternalNode(id);
      const { width, height } = node?.measured ?? {};
      if (!node || !width || !height) return false;
      const { source, target } = node.internals.handleBounds ?? {};
      const handles = (type: ArrangeHandle["type"], bounds: typeof source): ArrangeHandle[] =>
        (bounds ?? []).map(({ id, position, y, height }) => ({
          id: id ?? null,
          type,
          side: position === Position.Left ? "left" : "right",
          y: y + height / 2,
        }));
      boxes.push({ id, width, height, handles: [...handles("source", source), ...handles("target", target)] });
    }
    try {
      const at = await arrange(boxes, session.edges);
      session.nodes = session.nodes.map((node) => {
        const position = at.get(node.id);
        return position ? { ...node, position } : node;
      });
    } catch (error) {
      console.error("arrange failed", error); // the layout stays as it was
    }
    await tick();
    await fitView({ maxZoom: 1 });
    return true;
  };

  // a replaced graph (import, ?toast=, clear) is arranged once xyflow has measured its nodes, then shown whole,
  // like on page open. The node list is read so a replace that came while nodesInitialized stayed true still
  // reruns it; arrangeNodes untracked — it reads and writes the nodes
  let arrangePending = $state(false);
  $effect(() => {
    if (session.replaced > 0) arrangePending = true;
  });
  $effect(() => {
    void session.nodes;
    if (!arrangePending || !nodesInitialized.current) return;
    untrack(() => {
      arrangePending = false;
      void arrangeNodes().then((done) => {
        if (!done) arrangePending = true;
      });
    });
  });

  // xyflow's default 0.5 can't frame a big toast (degas: 26 nodes) — fitView stops at it
  const MIN_ZOOM = 0.1;

  // every link is drawn by LinkEdge — it carries the grab-to-unlink anchor
  const edgeTypes = { default: LinkEdge };

  const ondragover = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  // a node from the menu appears where it was dropped
  const ondrop = (event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer?.getData(NODE_TYPE_MIME);
    if (!type || !isMenuNodeType(type)) return;
    session.addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  // right click deletes; input / output are deletable: false, deleteElements skips them
  const onnodecontextmenu = ({ node, event }: { node: FlowNode; event: MouseEvent }) => {
    event.preventDefault();
    void deleteElements({ nodes: [node] });
  };
  const onedgecontextmenu = ({ edge, event }: { edge: Edge; event: MouseEvent }) => {
    event.preventDefault();
    void deleteElements({ edges: [edge] });
  };

  // a link onto a taken input replaces the one there; refused links (a cycle, …) never get here — canConnect.
  // A param linked into an empty track makes its first key
  const onbeforeconnect = (connection: Connection) => {
    session.freeTarget(connection);
    session.seedTrack(connection);
    return connection;
  };
  const onbeforereconnect = (edge: Edge) => {
    session.freeTarget(edge, edge.id);
    session.seedTrack(edge);
    return edge;
  };

  // a link end dropped into empty space → unlink
  const onreconnectend = (_: unknown, edge: Edge, __: unknown, { isValid }: { isValid: boolean | null }) => {
    if (!isValid) session.edges = session.edges.filter(({ id }) => id !== edge.id);
  };
</script>

<!-- xyflow borders its built-in node types (input, output) by class name — ours share the names, the fieldset is the only frame -->
<div
  style="position: fixed; inset: 0; --xy-node-border: none; --xy-node-border-selected: none"
  role="application"
  {ondragover}
  {ondrop}
>
  <SvelteFlow
    bind:nodes={session.nodes}
    bind:edges={session.edges}
    {nodeTypes}
    {edgeTypes}
    fitView
    fitViewOptions={{ maxZoom: 1 }}
    minZoom={MIN_ZOOM}
    connectionRadius={40}
    deleteKey={["Delete", "Backspace"]}
    {onnodecontextmenu}
    {onedgecontextmenu}
    {onreconnectend}
    isValidConnection={(connection) => session.canConnect(connection)}
    {onbeforeconnect}
    {onbeforereconnect}
  >
    <Background />
    <!-- bottom-right like other node editors (the sister's test) -->
    <Controls position="bottom-right" style="margin-bottom: 24px">
      <ControlButton onclick={() => void arrangeNodes()} title="arrange nodes" aria-label="arrange nodes">
        <!-- three columns of boxes, left to right -->
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="1" y="6" width="4" height="4" /><rect x="6" y="2" width="4" height="4" />
          <rect x="6" y="10" width="4" height="4" /><rect x="11" y="6" width="4" height="4" />
        </svg>
      </ControlButton>
    </Controls>
    <NodeMenu />
    <ActionsPanel />
    <ConnectionPanel />
    <VersionPanel />
  </SvelteFlow>
</div>
