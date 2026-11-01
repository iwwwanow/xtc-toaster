<script lang="ts">
  import { Panel } from "@xyflow/svelte";

  // the release tag, baked in by the docker build (vite.config.ts); dev / a local build — "dev"
  const version = import.meta.env.APP_VERSION ?? "dev";
</script>

<!-- the bottom-right corner is Controls' (over xyflow's attribution) -->
<Panel position="bottom-left" class="field__hint_ai-generated">
  {version === "dev" ? "dev" : `v${version}`}
</Panel>
