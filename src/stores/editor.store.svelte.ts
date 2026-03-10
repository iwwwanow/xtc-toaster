export const DEFAULT_SCRIPT = `\
// ─────────────────────────────────────────────────────────────────────────────
// ДОСТУПНЫЕ ПЕРЕМЕННЫЕ (нажми ? для полной документации)
// ─────────────────────────────────────────────────────────────────────────────
//
//  composition          — Composition, привязанная к canvas во Viewport
//    .imageData.data    — исходные пиксели (Uint8ClampedArray, RGBA)
//    .clearLayers()     — очистить слои
//    .addLayer(layer)   — добавить слой
//    .render()          — отрисовать в canvas
//
//  Layer(data, opts?)   — создать слой
//    .addEffect(LayerEffect.Noize, { deviationCoefficient, preserveAlpha })
//    .setOpacity(0..1)
//    .setBlendMode(BlendMod.add | BlendMod.normal)
//
//  cutHue(data, hue)         — вырезать пиксели по оттенку (0–360)
//  cutSaturation(data, sat)  — по насыщенности (0–100)
//  cutValue(data, val)       — по яркости (0–100)
//  cutChannel(data, Channel.Red | Green | Blue)
//
//  animFrame(rafId)     — зарегистрировать RAF-id (Stop его отменит)
//
//  exportGIF({ frames, fps, onFrame }) — экспорт анимации в .gif
//    frames   — количество кадров
//    fps      — частота (влияет на задержку между кадрами в GIF)
//    onFrame(frameIndex) — callback: рендерим один кадр внутри
//
// ─────────────────────────────────────────────────────────────────────────────
// ПРИМЕР: анимация — вырезаем оттенок и добавляем шум
// ─────────────────────────────────────────────────────────────────────────────

const src = composition.imageData?.data;
if (!src) throw new Error("Загрузи изображение во Viewport");

let hue = 0;

function tick() {
  const data = cutHue(src, hue);
  const layer = new Layer(data);
  layer.addEffect(LayerEffect.Noize, {
    deviationCoefficient: 0.3,
    preserveAlpha: false,
  });

  composition.clearLayers();
  composition.addLayer(layer);
  composition.render();

  hue = (hue + 1) % 360;
  animFrame(requestAnimationFrame(tick));
}

animFrame(requestAnimationFrame(tick));

// ─────────────────────────────────────────────────────────────────────────────
// ЭКСПОРТ В GIF (раскомментируй блок ниже, нажми Run)
// ─────────────────────────────────────────────────────────────────────────────
//
// await exportGIF({
//   frames: 72,
//   fps: 24,
//   onFrame(frame) {
//     const h = (frame / 72) * 360;
//     const data = cutHue(src, h);
//     const layer = new Layer(data);
//     layer.addEffect(LayerEffect.Noize, { deviationCoefficient: 0.15, preserveAlpha: false });
//     composition.clearLayers();
//     composition.addLayer(layer);
//     composition.render();
//   },
// });
`;

export const HELP_TEXT = `\
CANVAS PLAYGROUND — ДОКУМЕНТАЦИЯ
══════════════════════════════════════════════════════════

КОНТЕКСТ СКРИПТА
────────────────────────────────────────────────────────
composition
  Экземпляр Composition, привязанный к canvas во Viewport.
  Инициализируется при загрузке изображения.

  composition.imageData.data   — исходные пиксели изображения
                                 Uint8ClampedArray, 4 байта на пиксель (RGBA)
                                 индексы: i=R, i+1=G, i+2=B, i+3=A
  composition.clearLayers()    — очищает массив слоёв
  composition.addLayer(layer)  — добавляет слой
  composition.render()         — мёрджит все слои и рисует в canvas

Layer(data, options?)
  Обёртка над пиксельными данными.
  options: { opacity, blendMod, name }

  layer.addEffect(LayerEffect.Noize, {
    deviationCoefficient: 0..1,  // сила шума
    preserveAlpha: true|false,   // сохранять ли альфа-канал
  })
  layer.setOpacity(0..1)
  layer.setBlendMode(BlendMod.normal | BlendMod.add)

КАТТЕРЫ (cutters)
────────────────────────────────────────────────────────
Каттеры вырезают пиксели из исходных данных по цветовому
свойству. Возвращают Uint8ClampedArray той же длины.
Альфа-канал = степень совпадения (0 = не совпадает).

  cutHue(data, hue)
    hue: 0–360 (градусы)
    Вырезает пиксели с заданным оттенком.
    Tolerance = 0.02 (≈7.2°), спадание квадратичное.

  cutSaturation(data, saturation)
    saturation: 0–100
    Вырезает пиксели с заданной насыщенностью.
    Tolerance = 0.1 (10%).

  cutValue(data, value)
    value: 0–100
    Вырезает пиксели с заданной яркостью (V в HSV).
    Tolerance = 0.1 (10%).

  cutChannel(data, channel)
    channel: Channel.Red | Channel.Green | Channel.Blue
    Выделяет один RGB-канал как слой.

АНИМАЦИЯ
────────────────────────────────────────────────────────
Используй requestAnimationFrame для создания петли.
animFrame(id) регистрирует RAF-id — кнопка Stop его отменит.

  let hue = 0;
  function tick() {
    // 1. вырезаем данные
    const data = cutHue(src, hue);
    // 2. создаём слой, добавляем эффекты
    const layer = new Layer(data);
    layer.addEffect(LayerEffect.Noize, {
      deviationCoefficient: 0.3,
      preserveAlpha: false,
    });
    // 3. рендерим
    composition.clearLayers();
    composition.addLayer(layer);
    composition.render();
    // 4. обновляем параметр
    hue = (hue + 1) % 360;
    // 5. следующий кадр
    animFrame(requestAnimationFrame(tick));
  }
  animFrame(requestAnimationFrame(tick));

НЕСКОЛЬКО СЛОЁВ
────────────────────────────────────────────────────────
  const redData   = cutChannel(src, Channel.Red);
  const greenData = cutChannel(src, Channel.Green);
  const blueData  = cutChannel(src, Channel.Blue);

  const bg = new Layer(getSolidColor(...));  // можно добавить фон

  const r = new Layer(redData);
  r.setBlendMode(BlendMod.add);

  const g = new Layer(greenData);
  g.setBlendMode(BlendMod.add);

  const b = new Layer(blueData);
  b.setBlendMode(BlendMod.add);

  composition.clearLayers();
  composition.addLayer(r);
  composition.addLayer(g);
  composition.addLayer(b);
  composition.render();

ЭКСПОРТ В GIF
────────────────────────────────────────────────────────
exportGIF — асинхронная функция. Используй await или .then().
Нужно добавить async перед скриптом (весь код оборачивается
в async IIFE автоматически при наличии await).

  await exportGIF({
    frames: 72,      // сколько кадров в GIF
    fps: 24,         // частота (задержка = 1000/fps мс)
    onFrame(frame) { // вызывается для каждого кадра
      // frame: 0..frames-1
      // рендери тут одну позицию анимации
      const h = (frame / 72) * 360;
      const data = cutHue(src, h);
      const layer = new Layer(data);
      layer.addEffect(LayerEffect.Noize, {
        deviationCoefficient: 0.1,
        preserveAlpha: false,
      });
      composition.clearLayers();
      composition.addLayer(layer);
      composition.render();
    },
  });
  // после завершения браузер автоматически скачает .gif

СОВЕТЫ
────────────────────────────────────────────────────────
• Загрузи изображение перед запуском скрипта (кнопка Load image)
• Run  — запускает скрипт, Stop — отменяет RAF-петлю
• composition.imageData.data — неизменяемые исходные данные,
  всегда читай именно отсюда в петле, не из canvas
• Большие изображения + много кадров = большой GIF.
  Рекомендуется: 300×400, 48–72 кадра, 24 fps.
`;

export const editorStore = (() => {
  let code  = $state(DEFAULT_SCRIPT);
  let error = $state<string | null>(null);

  return {
    get code()  { return code; },
    get error() { return error; },
    setCode(v: string)  { code = v; },
    setError(v: string | null) { error = v; },
  };
})();
