<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import type { FlowNodeOf } from "../graph";
  import { nodeLabel } from "../groups";
  import { session } from "../session.svelte";

  // inside a group: what its instance gives out — the picture wired here, and the exposed params (listed: they are
  // the instance's fields, wired out of it); one per group, never deleted
  let {}: NodeProps<FlowNodeOf<"groupOutput">> = $props();

  let params = $derived(
    (session.openGroup?.params ?? []).map(({ id, node, param }) => {
      const inner = session.nodes.find((n) => n.id === node);
      return { id, from: `${inner ? nodeLabel(inner) : node}.${param}` };
    }),
  );
</script>

<Handle type="target" position={Position.Left} />
<fieldset class="frame">
  <legend><h6>group output</h6></legend>
  {#if params.length === 0}
    <div class="field__hint_ai-generated">no params out</div>
  {/if}
  {#each params as { id, from } (id)}
    <div class="field__hint_ai-generated" title="the instance's field {id} sets {from}">{id} ← {from}</div>
  {/each}
</fieldset>
