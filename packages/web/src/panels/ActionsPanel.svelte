<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { session } from "../session.svelte";
</script>

<Panel position="top-right" style="display: flex; flex-direction: column; gap: 4px">
  <button disabled={session.locked || !session.rendered} onclick={() => session.download()}>download png</button>
</Panel>
