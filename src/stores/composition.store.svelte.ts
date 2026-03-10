import { Composition } from "../../lib";

export const compositionStore = (() => {
  let instance = $state<Composition | null>(null);
  let animFrameId = $state<number | null>(null);

  function set(comp: Composition) {
    instance = comp;
  }

  function stopAnimation() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function setAnimFrame(id: number) {
    animFrameId = id;
  }

  return {
    get instance() { return instance; },
    get animFrameId() { return animFrameId; },
    set,
    stopAnimation,
    setAnimFrame,
  };
})();
