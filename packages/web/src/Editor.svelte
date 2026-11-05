<script lang="ts">
  import { Background, Controls, SvelteFlow, useSvelteFlow, type Connection, type Edge } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import LinkEdge from "./edges/LinkEdge.svelte";
  import { isMenuNodeType, NODE_TYPE_MIME, type FlowNode } from "./graph";
  import { nodeTypes } from "./nodes";
  import ActionsPanel from "./panels/ActionsPanel.svelte";
  import ConnectionPanel from "./panels/ConnectionPanel.svelte";
  import NodeMenu from "./panels/NodeMenu.svelte";
  import VersionPanel from "./panels/VersionPanel.svelte";
  import { session } from "./session.svelte";

  const { screenToFlowPosition, deleteElements, fitView } = useSvelteFlow<FlowNode, Edge>();

  // a replaced graph (import, ?toast=, clear) has a new layout — show all of it, like on page open
  // (xyflow queues it until the new nodes are measured); untracked — fitView reads the nodes, the effect
  // would rerun on every node change
  $effect(() => {
    if (session.replaced > 0) untrack(() => void fitView({ maxZoom: 1 }));
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
    <Controls position="bottom-right" style="margin-bottom: 24px" />
    <NodeMenu />
    <ActionsPanel />
    <ConnectionPanel />
    <VersionPanel />
  </SvelteFlow>
</div>
