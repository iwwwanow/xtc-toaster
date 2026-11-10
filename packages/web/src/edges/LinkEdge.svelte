<script lang="ts">
  import { BaseEdge, EdgeReconnectAnchor, getBezierPath, type EdgeProps } from "@xyflow/svelte";
  import { session } from "../session.svelte";

  let { id, sourceHandleId, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, style }: EdgeProps =
    $props();

  let [path] = $derived(getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }));
  let reconnecting = $state(false);
  // solid wires carry pixels, dashed ones bind a param to a track
  // the link a dragged node goes into if let go now — drawn thick
  let lineStyle = $derived(
    [style, sourceHandleId && "stroke-dasharray: 4 4", session.dropLink === id && "stroke-width: 4"].filter(Boolean).join(";"),
  );
</script>

<!-- like blender: the link end at the input is grabbed and dropped onto another input or into empty
     space (Editor → onreconnectend unlinks); dragging from an output always starts a new link -->
{#if !reconnecting}
  <BaseEdge {id} {path} {markerEnd} style={lineStyle} />
{/if}
<EdgeReconnectAnchor bind:reconnecting type="target" position={{ x: targetX, y: targetY }} />
