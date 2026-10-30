<script lang="ts">
  import { Panel } from "@xyflow/svelte";

  // the release tag, baked in by the docker build (vite.config.ts); dev / a local build — "dev"
  const version = import.meta.env.APP_VERSION ?? "dev";
</script>

<!-- above xyflow's attribution, which sits in the same corner -->
<Panel position="bottom-right" class="field__hint_ai-generated" style="margin-bottom: 24px">
  {version === "dev" ? "dev" : `v${version}`}
</Panel>
