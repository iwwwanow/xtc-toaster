<script lang="ts">
  import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/svelte";
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { ANIMATION_FPS, paramBounds, type AnimationTrack } from "@xtc-toaster/contract";
  import {
    addKey,
    addTrack,
    blockedFrames,
    clampPlayhead,
    dragKeyTo,
    fitPxPerFrame,
    frameAt,
    groupKeyFrames,
    keyValueAt,
    moveKey,
    moveKeys,
    nextKeyFrame,
    prevKeyFrame,
    removeKey,
    rulerLabels,
    setKeyValue,
    timelineEnd,
    trackGroups,
    trackLink,
    zoomPxPerFrame,
  } from "../animation";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { moveRow } from "../layers";
  import { session } from "../session.svelte";
  import { DRAG_THRESHOLD } from "../slider";
  import { RowDrag } from "./row-drag.svelte";

  let { id, data }: NodeProps<FlowNodeOf<"animation">> = $props();

  type Data = FlowNodeOf<"animation">["data"];
  const setData = (next: Partial<Data>) => session.setNodeData(id, { ...data, ...next });

  // the handles are inside the rows — xyflow re-measures them once the rows change
  const updateNodeInternals = useUpdateNodeInternals();
  const setTracks = (tracks: AnimationTrack[]) => {
    setData({ tracks });
    queueMicrotask(() => updateNodeInternals(id));
  };

  // tracks grouped by the node they animate (blender's channel groups); a collapsed group keeps its summary row,
  // its tracks' handles move onto the legend's line. Collapsing is ui only, not in the toast
  let groups = $derived(trackGroups(session.nodes, session.edges, id, data.tracks));
  const collapsed = new SvelteSet<string>();
  const toggleGroup = (group: string) => {
    if (!collapsed.delete(group)) collapsed.add(group);
    queueMicrotask(() => updateNodeInternals(id));
  };
  const groupOf = (index: number) => groups.find(({ rows }) => rows.some((row) => row.index === index))?.id;

  // a track is dragged inside its group only — across groups the order means nothing
  const drag = new RowDrag(
    "application/x-xtc-animation-track",
    (from, to) => setTracks(moveRow(data.tracks, from, to)),
    (from, to) => groupOf(from) === groupOf(to),
  );

  let end = $derived(timelineEnd(data));

  // zoom — px a frame takes: fit (blender's View All) until Ctrl+wheel sets one; `fit` / Home go back to fit.
  // The timeline's width in layout px (clientWidth isn't scaled by the canvas zoom)
  let timelineWidth = $state(0);
  let zoom = $state<number | null>(null);
  let fit = $derived(fitPxPerFrame(timelineWidth, end));
  let px = $derived(zoom ?? fit);
  const frameX = (frame: number) => frame * px + px / 2;

  let locked = $derived(session.animationLocked);
  // the playhead moves while a render runs (latest-wins), not during an export
  let canMove = $derived(session.connected && session.exporting === null);

  // a point's x in an element's own px: the rect is in screen px, scaled by the canvas zoom, offsetWidth is not
  const localX = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return (clientX - rect.left) * (element.offsetWidth / rect.width);
  };

  // the transport: every move stops play and stays among the rendered frames; null — nowhere to go
  const go = (frame: number | null) => {
    if (frame === null || !canMove) return;
    session.stop();
    session.setPlayhead(clampPlayhead(frame, data.frames));
  };
  let prevKey = $derived(prevKeyFrame(data, session.frame));
  let nextKey = $derived(nextKeyFrame(data, session.frame));

  // scrubbing, blender's: press on the ruler and drag — every whole frame passed is rendered (latest-wins)
  let scrubbing = false;
  const scrubTo = (event: PointerEvent & { currentTarget: HTMLElement }) =>
    go(frameAt(localX(event.clientX, event.currentTarget), px));
  const onrulerdown = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!canMove || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing = true;
    scrubTo(event);
  };
  const onrulermove = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (scrubbing) scrubTo(event);
  };

  // the wheel over the timeline scrolls it sideways (the node's own area takes it from the canvas — nowheel, and
  // there is nothing to scroll vertically); Ctrl+wheel zooms around the cursor's frame. Not passive: it must stop
  // the browser's own Ctrl+wheel page zoom
  const wheel = (element: HTMLElement) => {
    const onwheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        if (event.deltaX === 0) element.scrollLeft += event.deltaY;
        return;
      }
      event.preventDefault();
      const cursor = localX(event.clientX, element);
      const at = (element.scrollLeft + cursor) / px;
      const next = zoomPxPerFrame(px, event.deltaY < 0 ? 1 : -1, fit);
      zoom = next;
      void tick().then(() => (element.scrollLeft = at * next - cursor));
    };
    element.addEventListener("wheel", onwheel, { passive: false });
    return () => element.removeEventListener("wheel", onwheel);
  };

  // Number fields: the graph takes only valid values. The field shows what was taken, or the old one back — set by
  // hand, a value that didn't change the data wouldn't reach the input by itself
  const numberField =
    (current: () => number, parse: (value: number) => number | null, apply: (value: number) => void) =>
    ({ currentTarget }: Event & { currentTarget: HTMLInputElement }) => {
      const value = currentTarget.valueAsNumber;
      const parsed = Number.isFinite(value) ? parse(value) : null;
      currentTarget.value = String(parsed ?? current());
      if (parsed !== null) apply(parsed);
    };
  const wholeFrom = (min: number, max = Infinity) => (value: number) =>
    Number.isInteger(value) && value >= min && value <= max ? value : null;

  // the selected key; it is gone once its track or frame is
  let selected = $state<{ track: string; frame: number } | null>(null);
  let selectedTrack = $derived(data.tracks.find((track) => track.id === selected?.track));
  let selectedKey = $derived(selectedTrack?.keys.find((key) => key.frame === selected?.frame));

  // typed values stop at the bounds of the linked param; an unlinked track has none
  let selectedBounds = $derived.by(() => {
    const link = selectedTrack && trackLink(session.edges, id, selectedTrack.id);
    const type = link && session.nodes.find((node) => node.id === link.source)?.type;
    return type && link?.sourceHandle ? paramBounds(type, link.sourceHandle) : null;
  });
  const clampToParam = (value: number) =>
    selectedBounds ? Math.min(selectedBounds.max, Math.max(selectedBounds.min, value)) : value;

  const addKeyAt = (track: AnimationTrack) => {
    const value = keyValueAt(track, session.frame, session.trackParamValue(id, track.id));
    if (value === null) return;
    setData({ tracks: addKey(data.tracks, track.id, session.frame, value) });
    selected = { track: track.id, frame: session.frame };
  };
  const moveSelectedKey = (frame: number) => {
    if (!selected) return;
    const tracks = moveKey(data.tracks, selected.track, selected.frame, frame);
    if (!tracks) return;
    setData({ tracks });
    selected = { track: selected.track, frame };
  };
  // Dragging keys: a diamond of a track, or a summary diamond — every key its group has on that frame. Pressed, the
  // pointer is caught by the timeline's content (the diamonds are re-keyed by frame as they move); past
  // DRAG_THRESHOLD it's a drag, else a click that selects. Shown moved while dragging, written on release — one
  // render, not one per frame passed
  let content = $state<HTMLElement>();
  type KeyDrag = { ids: string[]; from: number; to: number; x: number; dragging: boolean; blocked: Set<number>; select: string | null };
  let keyDrag = $state<KeyDrag | null>(null);
  let shownTracks = $derived(
    keyDrag?.dragging && keyDrag.to !== keyDrag.from
      ? (moveKeys(data.tracks, keyDrag.ids, keyDrag.from, keyDrag.to) ?? data.tracks)
      : data.tracks,
  );
  let shownGroups = $derived(trackGroups(session.nodes, session.edges, id, shownTracks));

  const onkeydown = (ids: string[], frame: number, select: string | null) => (event: PointerEvent) => {
    if (locked || event.button !== 0 || !content) return;
    event.stopPropagation();
    content.setPointerCapture(event.pointerId);
    keyDrag = { ids, from: frame, to: frame, x: event.clientX, dragging: false, blocked: blockedFrames(data.tracks, ids, frame), select };
  };
  const onkeysmove = (event: PointerEvent) => {
    if (!keyDrag || !content) return;
    if (!keyDrag.dragging && Math.abs(event.clientX - keyDrag.x) < DRAG_THRESHOLD) return;
    keyDrag.dragging = true;
    keyDrag.to = dragKeyTo(keyDrag.blocked, keyDrag.to, frameAt(localX(event.clientX, content), px));
  };
  const onkeysup = () => {
    const drag = keyDrag;
    keyDrag = null;
    if (!drag) return;
    if (!drag.dragging) {
      if (drag.select) selected = { track: drag.select, frame: drag.from };
      return;
    }
    const tracks = drag.to === drag.from ? null : moveKeys(data.tracks, drag.ids, drag.from, drag.to);
    if (!tracks) return;
    setData({ tracks });
    // the selected key goes with it
    if (selected && drag.ids.includes(selected.track) && selected.frame === drag.from) selected = { ...selected, frame: drag.to };
    else if (drag.select) selected = { track: drag.select, frame: drag.to };
  };

  // a frame another key of the track holds is refused: a typed number overwrites nothing
  const parseKeyFrame = (value: number) => {
    const frame = wholeFrom(0)(value);
    return frame !== null && (frame === selected?.frame || !selectedTrack?.keys.some((key) => key.frame === frame)) ? frame : null;
  };
  const setSelectedValue = (value: number) => {
    if (selected) setData({ tracks: setKeyValue(data.tracks, selected.track, selected.frame, value) });
  };
</script>

<fieldset class="frame frame_span-6 animation">
  <legend><h6>{NODE_LABELS.animation}</h6></legend>

  <!-- blender's timeline header: the transport in the middle, the frame and the range on the right; text buttons
       instead of its icons, the key in the title -->
  <div class="animation__header">
    <div class="animation__transport">
      <button class="nodrag btn_ai-generated btn-sm_ai-generated" type="button" title="to the first frame (Shift+←)" disabled={!canMove} onclick={() => go(0)}>start</button>
      <button class="nodrag btn_ai-generated btn-sm_ai-generated" type="button" title="to the key before (↓)" disabled={!canMove || prevKey === null} onclick={() => go(prevKey)}>‹ key</button>
      <button class="nodrag btn_ai-generated btn-sm_ai-generated" type="button" title="a frame back (←)" disabled={!canMove} onclick={() => go(session.frame - 1)}>‹</button>
      <button
        class="nodrag btn_ai-generated btn-sm_ai-generated animation__play"
        type="button"
        title={session.playing ? "stop on this frame (Space)" : "render the frames one after another, from the playhead (Space)"}
        disabled={!session.playing && (locked || !session.canRender)}
        onclick={() => session.togglePlay()}>{session.playing ? "stop" : "play"}</button
      >
      <button class="nodrag btn_ai-generated btn-sm_ai-generated" type="button" title="a frame on (→)" disabled={!canMove} onclick={() => go(session.frame + 1)}>›</button>
      <button class="nodrag btn_ai-generated btn-sm_ai-generated" type="button" title="to the key after (↑)" disabled={!canMove || nextKey === null} onclick={() => go(nextKey)}>key ›</button>
      <button class="nodrag btn_ai-generated btn-sm_ai-generated" type="button" title="to the last frame (Shift+→)" disabled={!canMove} onclick={() => go(data.frames - 1)}>end</button>
    </div>
    <label class="field__label_ai-generated" for="{id}-frame">frame</label>
    <input
      id="{id}-frame"
      class="nodrag input_ai-generated input-sm_ai-generated animation__number"
      type="number"
      min="0"
      max={data.frames - 1}
      value={session.frame}
      disabled={!canMove}
      onchange={numberField(() => session.frame, wholeFrom(0, data.frames - 1), go)}
    />
    <label class="field__label_ai-generated" for="{id}-fps">fps</label>
    <input
      id="{id}-fps"
      class="nodrag input_ai-generated input-sm_ai-generated animation__number"
      type="number"
      min={ANIMATION_FPS.min}
      max={ANIMATION_FPS.max}
      value={data.fps}
      disabled={locked}
      onchange={numberField(() => data.fps, wholeFrom(ANIMATION_FPS.min, ANIMATION_FPS.max), (fps) => setData({ fps }))}
    />
    <label class="field__label_ai-generated" for="{id}-frames">frames</label>
    <input
      id="{id}-frames"
      class="nodrag input_ai-generated input-sm_ai-generated animation__number"
      type="number"
      min="1"
      value={data.frames}
      disabled={locked}
      onchange={numberField(() => data.frames, wholeFrom(1), (frames) => setData({ frames }))}
    />
    <button
      class="nodrag btn_ai-generated btn-sm_ai-generated"
      type="button"
      title="every frame in view (Home); Ctrl+wheel over the timeline zooms"
      disabled={zoom === null}
      onclick={() => (zoom = null)}>fit</button
    >
  </div>

  <div class="animation__body">
    <!-- outside the scroll: it would clip the handles, they stick out of the node's frame -->
    <div class="animation__channels">
      <div class="animation__row animation__head">
        <button
          class="nodrag btn_ai-generated btn-sm_ai-generated btn-dashed_ai-generated"
          type="button"
          disabled={locked}
          onclick={() => setTracks(addTrack(data.tracks))}>+ track</button
        >
      </div>
      {#each groups as group (group.id)}
        {@const open = !collapsed.has(group.id)}
        <!-- TODO(uiu): hand-written — a group of tracks in the node frame's look (.frame), nested -->
        <fieldset class="animation__group">
          <legend class="animation__group-legend">
            <button
              class="nodrag animation__toggle"
              type="button"
              title={open ? "collapse the group" : "expand the group"}
              aria-expanded={open}
              onclick={() => toggleGroup(group.id)}
              ><span class="animation__toggle-mark">{open ? "▾" : "▸"}</span>{group.name}{open ? "" : ` (${group.rows.length})`}</button
            >
          </legend>
          {#if !open}
            <!-- the hidden rows' inputs sit on the legend's line, one over another: their wires still land -->
            {#each group.rows as { track } (track.id)}
              <Handle type="target" position={Position.Left} id={track.id} class="animation__group-handle" />
            {/each}
          {:else}
            {#each group.rows as { track, index, name } (track.id)}
              {@const linked = trackLink(session.edges, id, track.id) !== undefined}
              <div
                class="nodrag animation__row"
                role="listitem"
                style:outline={drag.over === index && drag.dragged !== index ? "1px dashed currentColor" : "none"}
                style:opacity={drag.dragged === index ? 0.4 : 1}
                ondragover={drag.dragover(index)}
                ondrop={drag.drop(index)}
              >
                <!-- the track's input, out of the node's left edge like a layers row's (past the group's frame too) -->
                <Handle type="target" position={Position.Left} id={track.id} class="animation__track-handle" />
                <span
                  draggable={!locked}
                  role="button"
                  tabindex="-1"
                  title="drag to reorder inside the group"
                  style="cursor: grab; user-select: none"
                  ondragstart={drag.start(index)}
                  ondragend={drag.end}>⠿</span
                >
                <span class="animation__name" title={name}>{name}</span>
                {#if linked}
                  <button
                    class="btn_ai-generated btn-sm_ai-generated"
                    type="button"
                    title="a key at the playhead"
                    disabled={locked || track.keys.some((key) => key.frame === session.frame)}
                    onclick={() => addKeyAt(track)}>+ key</button
                  >
                {/if}
                <button
                  class="btn_ai-generated btn-sm_ai-generated"
                  type="button"
                  title="remove the track, its link and keys"
                  disabled={locked}
                  onclick={() => {
                    session.removeTrack(id, track.id);
                    queueMicrotask(() => updateNodeInternals(id));
                  }}>×</button
                >
              </div>
            {/each}
          {/if}
        </fieldset>
      {/each}
    </div>

    <div class="animation__timeline nowheel nodrag nopan" bind:clientWidth={timelineWidth} {@attach wheel}>
      <div
        class="animation__content"
        style:--frame-width="{px}px"
        style:width="{end * px}px"
        role="group"
        aria-label="tracks' keys — drag a diamond to move it"
        bind:this={content}
        onpointermove={onkeysmove}
        onpointerup={onkeysup}
        onpointercancel={() => (keyDrag = null)}
      >
        <div
          class="animation__row animation__ruler"
          class:animation__ruler_off={!canMove}
          role="slider"
          tabindex="-1"
          aria-label="the playhead — press and drag"
          aria-valuemin={0}
          aria-valuemax={data.frames - 1}
          aria-valuenow={session.frame}
          onpointerdown={onrulerdown}
          onpointermove={onrulermove}
          onpointerup={() => (scrubbing = false)}
          onpointercancel={() => (scrubbing = false)}
        >
          {#each rulerLabels(end, px) as frame (frame)}
            <span class="animation__label" style:left="{frameX(frame)}px">{frame}</span>
          {/each}
        </div>
        {#each shownGroups as group (group.id)}
          {@const open = !collapsed.has(group.id)}
          <!-- mirrors the group's fieldset: the summary row on the legend's line, then the tracks -->
          <div class="animation__group-keys">
            <div class="animation__row animation__keys animation__summary">
              {#each groupKeyFrames(group) as frame (frame)}
                <button
                  class="animation__key animation__key_summary"
                  class:animation__key_selected={selected?.frame === frame && group.rows.some(({ track }) => track.id === selected?.track)}
                  class:animation__key_past={frame >= data.frames}
                  type="button"
                  style:left="{frameX(frame)}px"
                  aria-label="keys of {group.name} on frame {frame}"
                  title="frame {frame}: every key of {group.name} — drag to move them together"
                  onpointerdown={onkeydown(
                    group.rows.map(({ track }) => track.id),
                    frame,
                    null,
                  )}
                ></button>
              {/each}
            </div>
            {#if open}
              {#each group.rows as { track } (track.id)}
                <div class="animation__row animation__keys">
                  {#if track.keys.length > 1}
                    {@const frames = track.keys.map((key) => key.frame)}
                    <div
                      class="animation__span"
                      style:left="{frameX(Math.min(...frames))}px"
                      style:width="{(Math.max(...frames) - Math.min(...frames)) * px}px"
                    ></div>
                  {/if}
                  {#each track.keys as key (key.frame)}
                    <button
                      class="animation__key"
                      class:animation__key_selected={selected?.track === track.id && selected.frame === key.frame}
                      class:animation__key_past={key.frame >= data.frames}
                      type="button"
                      style:left="{frameX(key.frame)}px"
                      aria-label="key on frame {key.frame}"
                      title="frame {key.frame}: {key.value} — drag to move"
                      onpointerdown={onkeydown([track.id], key.frame, track.id)}
                    ></button>
                  {/each}
                </div>
              {/each}
            {/if}
          </div>
        {/each}
        <!-- past the rendered frames, only as far as a key goes -->
        <div class="animation__past" style:left="{data.frames * px}px"></div>
        <div class="animation__playhead" style:left="{frameX(session.frame)}px"></div>
      </div>
    </div>
  </div>

  {#if selected && selectedKey}
    {@const key = selectedKey}
    <div class="animation__settings">
      <label class="field__label_ai-generated" for="{id}-key-frame">frame</label>
      <input
        id="{id}-key-frame"
        class="nodrag input_ai-generated input-sm_ai-generated animation__number"
        type="number"
        min="0"
        value={key.frame}
        disabled={locked}
        onchange={numberField(() => key.frame, parseKeyFrame, moveSelectedKey)}
      />
      <label class="field__label_ai-generated" for="{id}-key-value">value</label>
      <input
        id="{id}-key-value"
        class="nodrag input_ai-generated input-sm_ai-generated animation__number"
        type="number"
        step="any"
        min={selectedBounds?.min}
        max={selectedBounds?.max}
        value={Number(key.value.toFixed(4))}
        disabled={locked}
        onchange={numberField(() => key.value, clampToParam, setSelectedValue)}
      />
      <button
        class="btn_ai-generated btn-sm_ai-generated"
        type="button"
        disabled={locked}
        onclick={() => {
          setData({ tracks: removeKey(data.tracks, selected!.track, key.frame) });
          selected = null;
        }}>× key</button
      >
    </div>
  {/if}
</fieldset>
