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
<fieldset>
  <legend>output</legend>
  {#if session.imageId === null}
    <div>upload an image</div>
  {:else if session.renderError}
    <div style="color: crimson; max-width: 240px">
      {#if errorNode}{errorNode}: {/if}{session.renderError.message}
    </div>
  {:else if session.rendered}
    <!-- rendered at the stored image size, shown scaled down -->
    <img src={session.rendered.url} alt="render" width="240" />
  {/if}
</fieldset>
