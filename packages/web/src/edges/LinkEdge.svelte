<script lang="ts">
  import { BaseEdge, EdgeReconnectAnchor, getBezierPath, type EdgeProps } from "@xyflow/svelte";

  let { id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, style }: EdgeProps =
    $props();

  let [path] = $derived(getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }));
  let reconnecting = $state(false);
</script>

<!-- like blender: the link end at the input is grabbed and dropped onto another input or into empty
     space (Editor → onreconnectend unlinks); dragging from an output always starts a new link -->
{#if !reconnecting}
  <BaseEdge {id} {path} {markerEnd} {style} />
{/if}
<EdgeReconnectAnchor bind:reconnecting type="target" position={{ x: targetX, y: targetY }} />
