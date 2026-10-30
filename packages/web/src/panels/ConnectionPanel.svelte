<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { session } from "../session.svelte";
</script>

<!-- without it a dropped socket only greys the controls out — the page looks alive but renders nothing -->
{#if session.serverUnavailable}
  <Panel position="top-center" class="alert_ai-generated alert-error_ai-generated">server unavailable — reconnecting…</Panel>
{/if}
