import test from "node:test";
import assert from "node:assert/strict";
import { createBlocklyViewportResizeController } from "../dist/viewport.js";

function fixture() {
  let size = { width: 600, height: 360 };
  const workspace = {
    scrollX: -120,
    scrollY: -80,
    scale: 0.9,
    options: { zoomOptions: { minScale: 0.3, maxScale: 3 } },
    getMetricsManager() {
      return { getViewMetrics: () => ({ ...size }) };
    },
    setScale(zoom) {
      this.scale = Math.min(
        this.options.zoomOptions.maxScale,
        Math.max(this.options.zoomOptions.minScale, zoom),
      );
    },
    scroll(x, y) {
      this.scrollX = x;
      this.scrollY = y;
    },
  };
  const controller = createBlocklyViewportResizeController(workspace, () => {});
  const view = () => ({
    centerX: (size.width / 2 - workspace.scrollX) / workspace.scale,
    centerY: (size.height / 2 - workspace.scrollY) / workspace.scale,
    width: size.width / workspace.scale,
    height: size.height / workspace.scale,
  });
  controller.resize();
  return {
    workspace,
    controller,
    view,
    resize(width, height) {
      size = { width, height };
      controller.resize();
    },
  };
}
test("usable canvas contain survives alternating aspect ratios, not flyout-inclusive SVG dimensions", () => {
  const f = fixture(),
    initial = f.view();
  for (const [width, height] of [
    [1800, 1080],
    [300, 1000],
    [1500, 240],
    [1800, 1080],
    [600, 360],
  ]) {
    f.resize(width, height);
    const view = f.view();
    assert.ok(Math.abs(view.centerX - initial.centerX) < 1e-8);
    assert.ok(Math.abs(view.centerY - initial.centerY) < 1e-8);
    assert.ok(view.width + 1e-8 >= initial.width);
    assert.ok(view.height + 1e-8 >= initial.height);
  }
  assert.ok(Math.abs(f.workspace.scale - 0.9) < 1e-8);
});
test("user camera change establishes the next resize reference; hidden size preserves it", () => {
  const f = fixture();
  f.resize(1800, 1080);
  f.workspace.scale = 1.8;
  f.workspace.scrollX = -200;
  f.workspace.scrollY = -120;
  const initial = f.view();
  f.resize(600, 360);
  const result = f.view();
  assert.ok(Math.abs(result.width - initial.width) < 1e-8);
  f.resize(0, 0);
  f.resize(1800, 1080);
  f.resize(600, 360);
  assert.deepEqual(f.view(), result);
});
test("adaptive zoom can go below the vendor interaction minimum to avoid cropping", () => {
  const f = fixture(),
    original = f.view();
  f.resize(60, 36);
  assert.ok(Math.abs(f.workspace.scale - 0.09) < 1e-8);
  assert.ok(Math.abs(f.view().width - original.width) < 1e-8);
  f.resize(600, 360);
  assert.ok(Math.abs(f.workspace.scale - 0.9) < 1e-8);
});
