<script lang="ts">
  import { NodeToolbar, Position } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { isFixed } from "../graph";
  import { session } from "../session.svelte";

  // Over the selected nodes (10.11, agreed): `group` — the selection into a new group (the root only, no nesting yet);
  // one instance selected — `ungroup` and `open` too. Hidden while dragging. A refused `group` says why here
  let selected = $derived(session.nodes.filter(({ selected }) => selected));
  let ids = $derived(selected.map(({ id }) => id));
  let instance = $derived(selected.length === 1 && selected[0]!.type === "group" ? selected[0] : undefined);
  let canGroup = $derived(!session.openGroup && selected.some(({ type }) => !isFixed(type)));

  // the reason belongs to the selection it was refused for
  $effect(() => {
    void ids.join();
    untrack(() => (session.groupError = null));
  });
</script>

{#if ids.length > 0 && !session.dragging && (canGroup || instance)}
  <NodeToolbar nodeId={ids} isVisible position={Position.Top}>
    <div class="selection-toolbar">
      {#if canGroup}
        <button class="btn_ai-generated btn-sm_ai-generated" title="the selected nodes into a group" onclick={() => session.groupSelected(ids)}
          >group</button
        >
      {/if}
      {#if instance?.type === "group"}
        {@const { id, data } = instance}
        <button class="btn_ai-generated btn-sm_ai-generated" title="the group's nodes back in its place" onclick={() => session.ungroup(id)}
          >ungroup</button
        >
        <button class="btn_ai-generated btn-sm_ai-generated" title="into the group" onclick={() => session.openView(data.group)}>open</button>
      {/if}
    </div>
    {#if session.groupError}
      <div class="field__error_ai-generated selection-toolbar__error">{session.groupError}</div>
    {/if}
  </NodeToolbar>
{/if}
