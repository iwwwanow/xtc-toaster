<script lang="ts">
  import { Panel } from "@xyflow/svelte";
  import { session } from "../session.svelte";

  // inside a group: the way back and where we are — `toast / group 2 / group 1`, uiu's breadcrumbs (a group opened
  // inside another, 19.11); the name, the last item, is an editable field, the ones before it lead back up
  let group = $derived(session.openGroup);
  let above = $derived(session.openPath.slice(0, -1));
  let instances = $derived(group ? session.instancesOf(group.id) : 0);

  const back = (event: MouseEvent) => {
    event.preventDefault();
    session.openView(null);
  };
</script>

{#if group}
  {@const { id, name } = group}
  <Panel position="top-center" class="group-panel">
    <nav class="breadcrumbs_ai-generated">
      <a class="breadcrumbs__item_ai-generated" href="#toast" title="back to the toast" onclick={back}>toast</a>
      <span class="breadcrumbs__sep_ai-generated">/</span>
      {#each above as up (up.id)}
        <a
          class="breadcrumbs__item_ai-generated"
          href="#{up.id}"
          title="back to {up.name}"
          onclick={(event) => {
            event.preventDefault();
            session.openView(up.id);
          }}>{up.name}</a
        >
        <span class="breadcrumbs__sep_ai-generated">/</span>
      {/each}
      <input
        class="breadcrumbs__item_ai-generated input_ai-generated input-sm_ai-generated group-panel__name"
        aria-label="group name"
        value={name}
        onchange={({ currentTarget }) => {
          session.renameGroup(id, currentTarget.value);
          currentTarget.value = session.openGroup?.name ?? name;
        }}
      />
    </nav>
    <span class="field__hint_ai-generated">
      {instances === 1 ? "1 instance" : `${instances} instances`} — an edit here changes every one
    </span>
  </Panel>
{/if}
