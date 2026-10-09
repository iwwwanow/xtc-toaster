<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  // node data is not used here — state lives in session
  let {}: NodeProps<FlowNodeOf<"output">> = $props();
</script>

<Handle type="target" position={Position.Left} />
<div>output</div>
{#if session.rendered}
  <!-- rendered at the stored image size, scaled down by css -->
  <img src={session.rendered.url} alt="render" style="display: block; max-width: 100%" />
{:else if session.imageId === null}
  <div>upload an image</div>
{/if}
<button class="nodrag" disabled={session.locked || !session.rendered} onclick={() => session.download()}>
  download png
</button>
