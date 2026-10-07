<p align="center">
  <img src="assets/logo/logo-color.png" alt="xtc toaster" width="220" />
</p>

# xtc toaster

Layer-based pixel processing on raw RGBA arrays. Bun workspace; the working part today is `@xtc-toaster/lib`.

```ts
import { Composition, Color, imageFileToRawData, rawDataToImageFile } from "@xtc-toaster/lib";

const { data, width, height } = await imageFileToRawData("in.jpg");
const comp = new Composition(width, height);

comp.createBlankLayer().fill(Color.fromHex("#a4a4a4"));

const red = comp.createLayerFromPixelData(data);
red.mask({ name: "value", value: 12, tolerance: 0.24 });
red.tint(Color.fromHex("#ff0000"));
red.applyEffect({ name: "blur", options: { radius: 4 } });

await rawDataToImageFile(comp.render(), { width, height }, "out.png");
```

- **Layer** — `mask` (hue / saturation / value), `isolateChannel`, `fill`, `tint`, `applyEffect` (`noize`, `blur`), `setTransform`, `setBlendMode` (`normal`, `add`, `lch-hue`), `setOpacity`
- **I/O** — `imageFileToRawData` / `rawDataToImageFile` (via `canvas`), `assembleVideo` / `loopVideoTo` (ffmpeg)

Spec: [`docs/specs/domain.spec.ts`](docs/specs/domain.spec.ts).

## Run

Requires Bun and ffmpeg.

```bash
bun install
bun run toast-1              # example toast → baked-toasts/*.mp4
cd packages/lib && bun test
```
