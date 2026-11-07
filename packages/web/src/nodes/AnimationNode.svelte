<script lang="ts">
  import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/svelte";
  import { ANIMATION_FPS, paramBounds, type AnimationLoop, type AnimationTrack } from "@xtc-toaster/contract";
  import {
    addKey,
    addTrack,
    keyValueAt,
    moveKey,
    removeKey,
    rulerLabels,
    setKeyValue,
    timelineEnd,
    trackLink,
    trackName,
  } from "../animation";
  import { NODE_LABELS, type FlowNodeOf } from "../graph";
  import { moveRow } from "../layers";
  import { session } from "../session.svelte";
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

  const drag = new RowDrag("application/x-xtc-animation-track", (from, to) => setTracks(moveRow(data.tracks, from, to)));

  const PX_PER_FRAME = 12;
  let end = $derived(timelineEnd(data));
  const frameX = (frame: number) => frame * PX_PER_FRAME + PX_PER_FRAME / 2;

  let locked = $derived(session.animationLocked);

  // a click on the ruler; the rect is in screen px, scaled by the canvas zoom, offsetWidth is not
  const onrulerclick = ({ clientX, currentTarget }: MouseEvent & { currentTarget: HTMLElement }) => {
    const rect = currentTarget.getBoundingClientRect();
    const x = (clientX - rect.left) * (currentTarget.offsetWidth / rect.width);
    session.setPlayhead(Math.floor(x / PX_PER_FRAME));
  };

  // the wheel over the timeline scrolls it sideways: the node's own area takes it from the canvas (nowheel),
  // and there is nothing to scroll vertically
  const onwheel = (event: WheelEvent & { currentTarget: HTMLElement }) => {
    if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
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

  // the loop: reps or seconds or neither (the gif's default: forever)
  type LoopMode = "forever" | "reps" | "seconds";
  const LOOP_INITIAL = { reps: { reps: 3 }, seconds: { seconds: 15 } } as const satisfies Record<string, AnimationLoop>;
  let loopMode = $derived<LoopMode>(!data.loop ? "forever" : "reps" in data.loop ? "reps" : "seconds");
  const setLoop = (loop: AnimationLoop | undefined) => {
    const { loop: _, ...rest } = data;
    session.setNodeData(id, loop ? { ...rest, loop } : rest);
  };
  const onloopmode = ({ currentTarget }: Event & { currentTarget: HTMLSelectElement }) => {
    const mode = currentTarget.value as LoopMode;
    setLoop(mode === "forever" ? undefined : LOOP_INITIAL[mode]);
  };

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
  // a frame another key of the track holds is refused: a typed number overwrites nothing
  const parseKeyFrame = (value: number) => {
    const frame = wholeFrom(0)(value);
    return frame !== null && (frame === selected?.frame || !selectedTrack?.keys.some((key) => key.frame === frame)) ? frame : null;
  };
  const setSelectedValue = (value: number) => {
    if (selected) setData({ tracks: setKeyValue(data.tracks, selected.track, selected.frame, value) });
  };
</script>

<fieldset class="frame animation">
  <legend><h6>{NODE_LABELS.animation}</h6></legend>

  <div class="animation__settings">
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
    <label class="field__label_ai-generated" for="{id}-loop">loop</label>
    <select
      id="{id}-loop"
      class="nodrag select_ai-generated input-sm_ai-generated"
      style="width: auto"
      value={loopMode}
      disabled={locked}
      onchange={onloopmode}
    >
      <option value="forever">forever</option>
      <option value="reps">reps</option>
      <option value="seconds">seconds</option>
    </select>
    {#if data.loop && "reps" in data.loop}
      {@const { reps } = data.loop}
      <input
        class="nodrag input_ai-generated input-sm_ai-generated animation__number"
        type="number"
        min="1"
        aria-label="reps"
        value={reps}
        disabled={locked}
        onchange={numberField(() => reps, wholeFrom(1), (reps) => setLoop({ reps }))}
      />
    {:else if data.loop}
      {@const { seconds } = data.loop}
      <input
        class="nodrag input_ai-generated input-sm_ai-generated animation__number"
        type="number"
        step="any"
        min="0"
        aria-label="seconds"
        value={seconds}
        disabled={locked}
        onchange={numberField(() => seconds, (value) => (value > 0 ? value : null), (seconds) => setLoop({ seconds }))}
      />
    {/if}
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
        <button
          class="nodrag btn_ai-generated btn-sm_ai-generated"
          type="button"
          title={session.playing ? "stop on this frame" : "render the frames one after another, from the playhead"}
          disabled={!session.playing && (locked || !session.canRender)}
          onclick={() => session.togglePlay()}>{session.playing ? "stop" : "play"}</button
        >
        <span class="field__hint_ai-generated" style="white-space: nowrap">frame {session.frame}</span>
      </div>
      {#each data.tracks as track, index (track.id)}
        {@const name = trackName(session.nodes, session.edges, id, track.id)}
        {@const linked = trackLink(session.edges, id, track.id) !== undefined}
        <div
          class="nodrag animation__row"
          role="listitem"
          style:outline={drag.over === index && drag.dragged !== index ? "1px dashed currentColor" : "none"}
          style:opacity={drag.dragged === index ? 0.4 : 1}
          ondragover={drag.dragover(index)}
          ondrop={drag.drop(index)}
        >
          <!-- the track's input, out of the node's left edge like a layers row's -->
          <Handle
            type="target"
            position={Position.Left}
            id={track.id}
            style="left: calc(-1 * var(--GRID-GAP-2) - 1px - var(--handle-offset))"
          />
          <span
            draggable={!locked}
            role="button"
            tabindex="-1"
            title="drag to reorder"
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
    </div>

    <div class="animation__timeline nowheel nodrag nopan" {onwheel}>
      <div class="animation__content" style:--frame-width="{PX_PER_FRAME}px" style:width="{end * PX_PER_FRAME}px">
        <button
          class="animation__row animation__ruler"
          type="button"
          aria-label="move the playhead"
          disabled={!session.connected || session.exporting !== null}
          onclick={onrulerclick}
        >
          {#each rulerLabels(end) as frame (frame)}
            <span class="animation__label" style:left="{frameX(frame)}px">{frame}</span>
          {/each}
        </button>
        {#each data.tracks as track (track.id)}
          <div class="animation__row animation__keys">
            {#if track.keys.length > 1}
              {@const frames = track.keys.map((key) => key.frame)}
              <div
                class="animation__span"
                style:left="{frameX(Math.min(...frames))}px"
                style:width="{(Math.max(...frames) - Math.min(...frames)) * PX_PER_FRAME}px"
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
                title="frame {key.frame}: {key.value}"
                onclick={() => (selected = { track: track.id, frame: key.frame })}
              ></button>
            {/each}
          </div>
        {/each}
        <!-- past the rendered frames, only as far as a key goes -->
        <div class="animation__past" style:left="{data.frames * PX_PER_FRAME}px"></div>
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
