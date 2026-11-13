<script lang="ts">
  import {
    Background,
    ControlButton,
    Controls,
    Position,
    SvelteFlow,
    useConnection,
    useNodesInitialized,
    useSvelteFlow,
    useUpdateNodeInternals,
    type Connection,
    type Edge,
    type OnConnectEnd,
    type Viewport,
  } from "@xyflow/svelte";
  import { tick, untrack } from "svelte";
  import { arrange, type ArrangeHandle, type ArrangeNode } from "./arrange";
  import LinkEdge from "./edges/LinkEdge.svelte";
  import { isMenuNodeType, linkOntoNode, linksUnder, NODE_TYPE_MIME, type FlowNode, type Link } from "./graph";
  import { itemGroup, type MenuItem } from "./groups";
  import { nodeTypes } from "./nodes";
  import ActionsPanel from "./panels/ActionsPanel.svelte";
  import ConnectionPanel from "./panels/ConnectionPanel.svelte";
  import DragZones from "./panels/DragZones.svelte";
  import GroupPanel from "./panels/GroupPanel.svelte";
  import SelectionToolbar from "./panels/SelectionToolbar.svelte";
  import NodeMenu from "./panels/NodeMenu.svelte";
  import VersionPanel from "./panels/VersionPanel.svelte";
  import { session } from "./session.svelte";

  const { screenToFlowPosition, deleteElements, fitView, getInternalNode, getViewport, setViewport } = useSvelteFlow<FlowNode, Edge>();
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
        if (done) session.amendHistory();
        else arrangePending = true;
      });
    });
  });

  // Each level (the root, a group's inside) keeps its own view: going into a group shows it as it was left, or whole
  // the first time; back at the root — where it was. The viewport lives in the editor, not in the toast
  const viewports = new Map<string | null, Viewport>();
  let shownLevel: string | null = null;
  $effect(() => {
    const level = session.openGroup?.id ?? null;
    untrack(() => {
      if (level === shownLevel) return;
      viewports.set(shownLevel, getViewport());
      shownLevel = level;
      const saved = viewports.get(level);
      // the level's nodes are mounted first; fitView waits for them to be measured
      void tick().then(() => (saved ? setViewport(saved) : fitView({ maxZoom: 1 })));
    });
  });

  // xyflow's default 0.5 can't frame a big toast (degas: 26 nodes) — fitView stops at it
  const MIN_ZOOM = 0.1;

  // every link is drawn by LinkEdge — it carries the grab-to-unlink anchor
  const edgeTypes = { default: LinkEdge };

  // a node dragged out of the menu has no box yet — the links under this much around the pointer (screen px)
  const MENU_DROP_REACH = 24;

  const ondragover = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const type = session.menuDrag;
    if (!type) return;
    const from = screenToFlowPosition({ x: event.clientX - MENU_DROP_REACH, y: event.clientY - MENU_DROP_REACH });
    const to = screenToFlowPosition({ x: event.clientX + MENU_DROP_REACH, y: event.clientY + MENU_DROP_REACH });
    const box = { ...from, width: to.x - from.x, height: to.y - from.y };
    session.dropLink = linksUnder(box, drawnLinks()).find((edgeId) => session.canInsertOnLink(type, edgeId)) ?? null;
  };

  // a node from the menu appears where it was dropped; onto a highlighted link — into it
  const ondrop = (event: DragEvent) => {
    event.preventDefault();
    const item = event.dataTransfer?.getData(NODE_TYPE_MIME);
    const link = session.dropLink;
    session.dropLink = null;
    if (!item || (!isMenuNodeType(item) && itemGroup(item) === null)) return;
    session.addNode(item as MenuItem, screenToFlowPosition({ x: event.clientX, y: event.clientY }), link);
  };

  // right click deletes; input / output are deletable: false, deleteElements skips them
  const onnodecontextmenu = ({ node, event }: { node: FlowNode; event: MouseEvent }) => {
    event.preventDefault();
    void deleteElements({ nodes: [node] });
  };
  // a deleted node linked on both sides keeps the chain: A → node → B becomes A → B (keepChain). xyflow has already
  // dropped the nodes and their edges; the same tick — one history step with the delete
  const ondelete = ({ nodes, edges }: { nodes: FlowNode[]; edges: Edge[] }) => {
    if (nodes.length > 0) session.keepChain(nodes.map(({ id }) => id), edges);
  };
  const onedgecontextmenu = ({ edge, event }: { edge: Edge; event: MouseEvent }) => {
    event.preventDefault();
    void deleteElements({ edges: [edge] });
  };

  const pointOf = (event: MouseEvent | TouchEvent) => ("changedTouches" in event ? event.changedTouches[0] : event);

  // a node dragged alone over a link it may go into highlights it (LinkEdge), let go there it goes in: A → node → B.
  // The box is the node's, the paths are the drawn links' — the nearest to the node's center that takes the node
  const drawnLinks = () =>
    [...document.querySelectorAll<SVGGElement>(".svelte-flow__edge")].flatMap((link) => {
      const d = link.querySelector(".svelte-flow__edge-path")?.getAttribute("d");
      const id = link.dataset.id;
      return d && id ? [{ id, d }] : [];
    });
  const linkUnder = (node: FlowNode | null, dragged: FlowNode[]): string | null => {
    if (!node || dragged.length !== 1) return null;
    const internal = getInternalNode(node.id);
    const { width, height } = internal?.measured ?? {};
    if (!internal || !width || !height) return null;
    // the event's node is where it is now — the internal node's position lags a move behind (no parent nodes here)
    const box = { ...node.position, width, height };
    return linksUnder(box, drawnLinks()).find((edgeId) => session.canInsertOnLink(node.id, edgeId)) ?? null;
  };
  // a node drag's action zones at the bottom (DragZones): shown when something dragged can be deleted (not input /
  // output); let go over `delete` — deleted like a right click, the chain kept (ondelete). Over it no link is offered
  let zone = $state<HTMLElement>();
  let zonesShown = $state(false);
  let overZone = $state(false);
  const onZone = (event: MouseEvent | TouchEvent) => {
    const point = pointOf(event);
    const box = zone?.getBoundingClientRect();
    return !!point && !!box && point.clientX >= box.left && point.clientX <= box.right && point.clientY >= box.top && point.clientY <= box.bottom;
  };

  // Alt held as the drag starts — a copy goes with the pointer, the original stays (leaveCopiesBehind); the drag, the
  // copy and a drop into a link are one step
  const onnodedragstart = ({ event, nodes }: { event: MouseEvent | TouchEvent; nodes: FlowNode[] }) => {
    session.dragging = true;
    zonesShown = nodes.some(({ deletable }) => deletable !== false);
    if (event.altKey) session.leaveCopiesBehind(nodes.map(({ id }) => id));
  };
  const onnodedrag = ({ event, targetNode, nodes }: { event: MouseEvent | TouchEvent; targetNode: FlowNode | null; nodes: FlowNode[] }) => {
    overZone = onZone(event);
    session.dropLink = overZone ? null : linkUnder(targetNode, nodes);
  };
  const onnodedragstop = ({ event, targetNode, nodes }: { event: MouseEvent | TouchEvent; targetNode: FlowNode | null; nodes: FlowNode[] }) => {
    if (zonesShown && onZone(event)) void deleteElements({ nodes });
    else if (targetNode && session.dropLink) session.insertOnLink(targetNode.id, session.dropLink);
    session.dropLink = null;
    session.dragging = false;
    zonesShown = false;
    overZone = false;
  };

  // a link onto a taken input replaces the one there; refused links (a cycle, …) never get here — canConnect.
  // A param linked into an empty track makes its first key, into a value nothing is wired into yet — its number
  const onbeforeconnect = (connection: Connection) => {
    session.freeTarget(connection);
    session.seedTrack(connection);
    session.seedValue(connection);
    return connection;
  };
  const onbeforereconnect = (edge: Edge) => {
    session.freeTarget(edge, edge.id);
    session.seedTrack(edge);
    session.seedValue(edge);
    return edge;
  };

  // A pixel wire let go over a node's frame, not on a handle, goes into its input (linkOntoNode); the node (and the
  // layers row) under the pointer — the topmost element there, so a panel over a node hides it
  const pixelWireOnto = (x: number, y: number, source: string, keep?: string): { node: string; link: Link } | null => {
    const top = document.elementFromPoint(x, y);
    const node = top?.closest<HTMLElement>(".svelte-flow__node")?.dataset.id;
    if (!top || !node) return null;
    const row = top.closest<HTMLElement>("[data-row]")?.dataset.row ?? null;
    const link = linkOntoNode(session.nodes, session.edges, source, node, row, keep, session.scope);
    return link && { node, link };
  };

  // while a pixel wire is dragged — a new one or a moved end — the node it would go into is highlighted (app.css,
  // [data-drop]); not when xyflow has a handle in reach that takes it — that one wins
  const connection = useConnection();
  let flowElement = $state<HTMLElement>();
  let reconnecting: string | undefined;
  $effect(() => {
    const { inProgress, isValid, fromHandle, pointer } = connection.current;
    if (!inProgress || isValid || fromHandle.type !== "source" || fromHandle.id || !flowElement) {
      session.dropNode = null;
      return;
    }
    // the pointer is relative to the flow's box — this wrapper's, the flow fills it
    const { left, top } = flowElement.getBoundingClientRect();
    session.dropNode = untrack(() => pixelWireOnto(left + pointer.x, top + pointer.y, fromHandle.nodeId, reconnecting));
  });
  $effect(() => {
    const at = session.dropNode;
    if (!at) return;
    const node = document.querySelector(`.svelte-flow__node[data-id="${CSS.escape(at.node)}"]`);
    const row = at.link.targetHandle && node?.querySelector(`[data-row="${CSS.escape(at.link.targetHandle)}"]`);
    const marked = [node, row].filter((element): element is Element => !!element);
    for (const element of marked) element.setAttribute("data-drop", "");
    return () => marked.forEach((element) => element.removeAttribute("data-drop"));
  });

  const updateNodeInternals = useUpdateNodeInternals();
  // a pixel wire let go over a node's frame → into its input; a param's wire let go over `+ track` (no handle took
  // it) → a new track linked to that param
  const onconnectend: OnConnectEnd = (event, state) => {
    session.dropNode = null;
    const from = state.fromHandle;
    const point = pointOf(event);
    if (state.isValid || from?.type !== "source" || !point) return;
    if (!from.id) {
      const onto = pixelWireOnto(point.clientX, point.clientY, from.nodeId);
      if (onto) session.linkOntoNode(onto.link);
      return;
    }
    if (!document.elementFromPoint(point.clientX, point.clientY)?.closest("[data-track-drop]")) return;
    const link = session.addLinkedTrack(from.nodeId, from.id);
    if (!link) return;
    // the track's handle is mounted (tick), measured — updateNodeInternals runs in a requestAnimationFrame of its
    // own, queued first — then linked
    void tick().then(() => {
      updateNodeInternals(link.target);
      requestAnimationFrame(() => session.linkTrack(link));
    });
  };

  // a link end moved: let go over a node's frame — into its input, like a new wire; into empty space — unlink
  const onreconnectstart = (_: unknown, edge: Edge) => {
    reconnecting = edge.id;
  };
  const onreconnectend = (event: MouseEvent | TouchEvent, edge: Edge, _: unknown, { isValid }: { isValid: boolean | null }) => {
    reconnecting = undefined;
    session.dropNode = null;
    if (isValid) return;
    const point = pointOf(event);
    const onto = point && !edge.sourceHandle ? pixelWireOnto(point.clientX, point.clientY, edge.source, edge.id) : null;
    if (onto) session.linkOntoNode(onto.link, edge.id);
    else session.edges = session.edges.filter(({ id }) => id !== edge.id);
  };
</script>

<!-- xyflow borders its built-in node types (input, output) by class name — ours share the names, the fieldset is the only frame -->
<div
  style="position: fixed; inset: 0; --xy-node-border: none; --xy-node-border-selected: none"
  role="application"
  bind:this={flowElement}
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
    {ondelete}
    {onnodedragstart}
    {onnodedrag}
    {onnodedragstop}
    {onedgecontextmenu}
    {onreconnectstart}
    {onreconnectend}
    {onconnectend}
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
    <DragZones visible={zonesShown} over={overZone} bind:zone />
    <GroupPanel />
    <SelectionToolbar />
    <VersionPanel />
  </SvelteFlow>
</div>
