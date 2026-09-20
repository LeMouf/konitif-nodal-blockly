import type * as Blockly from "blockly/core";

/** Camera presentation only. Never reads blocks or publishes semantic edits.
 * One world rectangle survives a chain of layout sizes; a user camera change
 * establishes a new rectangle on the next resize. Flyout is not part of it. */
export function createBlocklyViewportResizeController(
  workspace: Blockly.WorkspaceSvg,
  resizeSvg: () => void,
) {
  let size: { width: number; height: number } | null = null;
  let anchor: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } | null = null;
  let applied: { x: number; y: number; zoom: number } | null = null;
  let adjusting = false;
  const minimum = workspace.options.zoomOptions.minScale;
  const valid = (view: { width: number; height: number }) =>
    Number.isFinite(view.width) &&
    Number.isFinite(view.height) &&
    view.width > 0 &&
    view.height > 0;
  return {
    reset() {
      anchor = null;
      applied = null;
    },
    cameraChanged() {
      if (adjusting) return;
      const current = {
        x: workspace.scrollX,
        y: workspace.scrollY,
        zoom: workspace.scale,
      };
      if (
        applied &&
        Math.abs(applied.x - current.x) < 0.001 &&
        Math.abs(applied.y - current.y) < 0.001 &&
        Math.abs(applied.zoom - current.zoom) < 0.000001
      )
        return;
      const view = workspace.getMetricsManager().getViewMetrics();
      if (!valid(view)) return;
      // User zoom also changes flyout width. Record its settled usable area
      // before the next panel resize, rather than reusing the old flyout width.
      size = { width: view.width, height: view.height };
      anchor = null;
      applied = current;
    },
    resize() {
      adjusting = true;
      try {
        const before = {
          x: workspace.scrollX,
          y: workspace.scrollY,
          zoom: workspace.scale,
        };
        if (
          size &&
          valid(size) &&
          before.zoom > 0 &&
          (!anchor ||
            !applied ||
            Math.abs(applied.x - before.x) > 0.001 ||
            Math.abs(applied.y - before.y) > 0.001 ||
            Math.abs(applied.zoom - before.zoom) > 0.000001)
        ) {
          anchor = {
            width: size.width / before.zoom,
            height: size.height / before.zoom,
            centerX: (size.width / 2 - before.x) / before.zoom,
            centerY: (size.height / 2 - before.y) / before.zoom,
          };
        }
        resizeSvg();
        let next = workspace.getMetricsManager().getViewMetrics();
        if (!valid(next)) return; // Hidden/unmounted panels do not destroy the reference.
        if (
          size &&
          anchor &&
          (size.width !== next.width || size.height !== next.height)
        ) {
          // setScale can reflow the flyout. Refine against the usable canvas, with
          // a bounded calculation, never a polling/frame loop.
          const maximum = workspace.options.zoomOptions.maxScale || Infinity;
          let zoom = Math.min(
            next.width / anchor.width,
            next.height / anchor.height,
            maximum,
          );
          let previous: { zoom: number; residual: number } | null = null;
          for (let iteration = 0; iteration < 6; iteration++) {
            workspace.options.zoomOptions.minScale = Math.min(
              minimum || zoom,
              zoom,
            );
            workspace.setScale(zoom);
            const measured = workspace.getMetricsManager().getViewMetrics();
            next = measured;
            const required = Math.min(
              next.width / anchor.width,
              next.height / anchor.height,
              maximum,
            );
            const residual = required - workspace.scale;
            if (Math.abs(residual) < 1e-9) break;
            let candidate = required;
            // The flyout usually varies affinely with scale: secant refinement
            // avoids many repeated reflows. Six is a hard bound, not a frame loop.
            if (previous && Math.abs(residual - previous.residual) > 1e-12) {
              const secant =
                workspace.scale -
                (residual * (workspace.scale - previous.zoom)) /
                  (residual - previous.residual);
              if (Number.isFinite(secant) && secant > 0 && secant <= maximum)
                candidate = secant;
            }
            previous = { zoom: workspace.scale, residual };
            zoom = candidate;
          }
          const safeZoom = Math.min(
            workspace.scale,
            next.width / anchor.width,
            next.height / anchor.height,
          );
          if (safeZoom < workspace.scale) {
            workspace.options.zoomOptions.minScale = Math.min(
              minimum || safeZoom,
              safeZoom,
            );
            workspace.setScale(safeZoom);
            next = workspace.getMetricsManager().getViewMetrics();
          }
          workspace.scroll(
            next.width / 2 - anchor.centerX * workspace.scale,
            next.height / 2 - anchor.centerY * workspace.scale,
          );
        }
        size = { width: next.width, height: next.height };
        applied = {
          x: workspace.scrollX,
          y: workspace.scrollY,
          zoom: workspace.scale,
        };
      } finally {
        adjusting = false;
      }
    },
  };
}
