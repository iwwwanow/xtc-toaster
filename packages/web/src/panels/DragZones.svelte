<script lang="ts">
  import { Panel } from "@xyflow/svelte";

  // Action zones at the bottom while a node is dragged (10.11): let go over one — its action. One for now, `delete`;
  // Editor hit-tests the pointer against `zone` and runs it
  let { visible, over, zone = $bindable() }: { visible: boolean; over: boolean; zone?: HTMLElement } = $props();
</script>

{#if visible}
  <Panel position="bottom-center" style="margin-bottom: 24px">
    <div
      bind:this={zone}
      class={["btn_ai-generated", over ? "btn-danger_ai-generated" : "btn-dashed_ai-generated"]}
      style="min-width: var(--grid-column); pointer-events: none"
      role="status"
    >
      delete
    </div>
  </Panel>
{/if}
