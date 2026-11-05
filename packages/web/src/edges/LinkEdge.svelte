<script lang="ts">
  import { BaseEdge, EdgeReconnectAnchor, getBezierPath, type EdgeProps } from "@xyflow/svelte";

  let { id, sourceHandleId, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, style }: EdgeProps =
    $props();

  let [path] = $derived(getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }));
  let reconnecting = $state(false);
  // solid wires carry pixels, dashed ones bind a param to a track
  let lineStyle = $derived(sourceHandleId ? `${style ?? ""};stroke-dasharray: 4 4` : style);
</script>

<!-- like blender: the link end at the input is grabbed and dropped onto another input or into empty
     space (Editor → onreconnectend unlinks); dragging from an output always starts a new link -->
{#if !reconnecting}
  <BaseEdge {id} {path} {markerEnd} style={lineStyle} />
{/if}
<EdgeReconnectAnchor bind:reconnecting type="target" position={{ x: targetX, y: targetY }} />
