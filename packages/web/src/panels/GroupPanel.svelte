<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { session } from "../session.svelte";

  // inside a group: the way back and where we are — `toast › group 1`, blender's breadcrumb; the name is editable
  let group = $derived(session.openGroup);
  let instances = $derived(group ? session.instancesOf(group.id) : 0);
</script>

{#if group}
  {@const { id, name } = group}
  <Panel position="top-center" class="group-panel">
    <button class="btn_ai-generated btn-sm_ai-generated" title="back to the toast" onclick={() => session.openView(null)}>toast</button>
    <span aria-hidden="true">›</span>
    <input
      class="input_ai-generated input-sm_ai-generated group-panel__name"
      aria-label="group name"
      value={name}
      onchange={({ currentTarget }) => {
        session.renameGroup(id, currentTarget.value);
        currentTarget.value = session.openGroup?.name ?? name;
      }}
    />
    <span class="field__hint_ai-generated">
      {instances === 1 ? "1 instance" : `${instances} instances`} — an edit here changes every one
    </span>
  </Panel>
{/if}
