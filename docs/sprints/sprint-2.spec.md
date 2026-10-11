2. [ ] 12.10-18.10. ui & one-node toast
   - 1 week
   - export toast
   - export picture (png)
   - cut if behind:
     - (#2) drop skew
     - (#3) masks: value only

### status (2026-10-11) — starts 12.10, spec not written yet

inputs from sprint 1:

- export picture (png) — already done in sprint 1 (output node download-png-button, `toast-2_signac_<YYYYMMDD-HHmmss>.png`)
- export toast / import toast — moved here from sprint 1 (`docs/sprints/sprint-1.spec.md` → "not in this sprint")
  - export = `ToastGraph` json with `imageId: null` (toast is a preset, not a picture)
  - import is required, otherwise export is useless; validated with the same schema
- noize is hue-only: grey pixels stay untouched — decide what the node should do (rename to hue noise / add a luminance or rgb noise effect) — `docs/backlog/2026-10-11_noize-hue-only-on-saturated-pixels.md`
