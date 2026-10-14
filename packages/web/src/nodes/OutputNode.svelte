<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { session } from "../session.svelte";

  // node data is not used here — state lives in session
  let {}: NodeProps<FlowNodeOf<"output">> = $props();

  // the node the error points at, by its type — a broken link is easier to find
  let errorNode = $derived(session.nodes.find(({ id }) => id === session.renderError?.nodeId)?.type);
</script>

<Handle type="target" position={Position.Left} />
<div>output</div>
{#if session.imageId === null}
  <div>upload an image</div>
{:else if session.renderError}
  <div style="color: crimson; max-width: 240px">
    {#if errorNode}{errorNode}: {/if}{session.renderError.message}
  </div>
{:else if session.rendered}
  <!-- rendered at the stored image size, scaled down by css -->
  <img src={session.rendered.url} alt="render" style="display: block; max-width: 100%" />
{/if}
