import test from "node:test";
import assert from "node:assert/strict";
import { createBlocklyViewportResizeController } from "../dist/viewport.js";

test("scale-dependent flyout fit converges without cropping and recaptures settled user zoom", () => {
  let width = 760,
    height = 650,
    calls = 0;
  const ws = {
    scale: 0.9,
    scrollX: -100,
    scrollY: -80,
    options: { zoomOptions: { minScale: 0.3, maxScale: 3 } },
    getMetricsManager() {
      return {
        getViewMetrics: () => ({
          width: width - 18 - 148 * this.scale,
          height,
        }),
      };
    },
    setScale(value) {
      calls++;
      this.scale = value;
    },
    scroll(x, y) {
      this.scrollX = x;
      this.scrollY = y;
    },
  };
  const ctrl = createBlocklyViewportResizeController(ws, () => {});
  const view = () => {
    const size = ws.getMetricsManager().getViewMetrics();
    return {
      centerX: (size.width / 2 - ws.scrollX) / ws.scale,
      centerY: (size.height / 2 - ws.scrollY) / ws.scale,
      width: size.width / ws.scale,
      height: size.height / ws.scale,
    };
  };
  ctrl.resize();
  const original = view();
  for (const [w, h] of [
    [500, 1000],
    [1800, 500],
    [760, 650],
  ]) {
    width = w;
    height = h;
    calls = 0;
    ctrl.resize();
    const current = view();
    assert.ok(Math.abs(current.centerX - original.centerX) < 1e-8);
    assert.ok(Math.abs(current.centerY - original.centerY) < 1e-8);
    assert.ok(current.width + 1e-8 >= original.width);
    assert.ok(current.height + 1e-8 >= original.height);
    assert.ok(calls <= 7);
  }
  assert.ok(Math.abs(ws.scale - 0.9) < 1e-8);
  ws.setScale(1.1);
  ws.scroll(-100, -80);
  ctrl.cameraChanged();
  const chosen = view();
  width = 1500;
  height = 1000;
  ctrl.resize();
  const expanded = view();
  assert.ok(Math.abs(expanded.centerX - chosen.centerX) < 1e-8);
  assert.ok(Math.abs(expanded.centerY - chosen.centerY) < 1e-8);
  width = 760;
  height = 650;
  ctrl.resize();
  assert.ok(Math.abs(ws.scale - 1.1) < 1e-8);
});
