<script lang="ts">
  import { Background, Controls, SvelteFlow, useSvelteFlow, type Edge } from "@xyflow/svelte";
  import LinkEdge from "./edges/LinkEdge.svelte";
  import { isMenuNodeType, NODE_TYPE_MIME, type FlowNode } from "./graph";
  import { nodeTypes } from "./nodes";
  import ActionsPanel from "./panels/ActionsPanel.svelte";
  import NodeMenu from "./panels/NodeMenu.svelte";
  import { session } from "./session.svelte";

  const { screenToFlowPosition, deleteElements } = useSvelteFlow<FlowNode, Edge>();

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
    deleteKey={["Delete", "Backspace"]}
    {onnodecontextmenu}
    {onedgecontextmenu}
    {onreconnectend}
  >
    <Background />
    <Controls />
    <NodeMenu />
    <ActionsPanel />
  </SvelteFlow>
</div>
