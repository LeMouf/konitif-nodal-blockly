import type * as Blockly from "blockly/core";
import type { BlocklyPlaybackReading } from "./contracts.js";

/** Differential SVG paint only. No workspace serialization or semantic events. */
export function createBlocklyPlaybackPresentation(
  workspace: Blockly.WorkspaceSvg,
) {
  const applied = new Map<string, { root: SVGElement; signature: string }>();
  function present(
    blocks: Readonly<Record<string, BlocklyPlaybackReading>>,
    label: (state: BlocklyPlaybackReading["state"]) => string,
  ) {
    const nextIds = new Set(Object.keys(blocks));
    for (const id of applied.keys())
      if (!nextIds.has(id)) {
        const block = workspace.getBlockById(id);
        if (block) {
          const root = block.getSvgRoot();
          delete root.dataset.playbackState;
          delete root.dataset.playbackWarning;
          delete root.dataset.playbackWarningMessage;
          root.querySelector(":scope > .konitifBlocklyPlayback")?.remove();
          block.setWarningText(null, "konitif-playback");
        }
        applied.delete(id);
      }
    for (const [id, reading] of Object.entries(blocks)) {
      const block = workspace.getBlockById(id);
      if (!block || block.isInsertionMarker() || block.isInFlyout) continue;
      const root = block.getSvgRoot();
      const progress = Math.round(
        Math.min(
          1,
          Math.max(0, Number.isFinite(reading.progress) ? reading.progress : 0),
        ) * 100,
      );
      const caption = label(reading.state);
      const warning = reading.warning?.message ?? "";
      // Blockly's public width includes connected statement children. Status
      // belongs to this block's own header, so anchor it to the childless
      // outline or a wide nested stack pushes the label into empty canvas.
      const size = { width: block.width, headerWidth: block.childlessWidth, height: block.height };
      const signature = JSON.stringify([
        reading.state,
        progress,
        warning,
        caption,
        size.width,
        size.headerWidth,
        size.height,
      ]);
      const previous = applied.get(id);
      if (previous?.root === root && previous.signature === signature) continue;
      root.dataset.playbackState = reading.state;
      if (warning) root.dataset.playbackWarning = "true";
      else delete root.dataset.playbackWarning;
      // The vendor owns warning icon placement and tooltip; a scoped ID avoids
      // clearing unrelated diagnostics. Only a changed warning rerenders it.
      if (
        previous?.root !== root ||
        root.dataset.playbackWarningMessage !== warning
      ) {
        block.setWarningText(warning || null, "konitif-playback");
        root.dataset.playbackWarningMessage = warning;
      }
      let decoration = root.querySelector<SVGGElement>(
        ":scope > .konitifBlocklyPlayback",
      );
      if (!decoration) {
        decoration = root.ownerDocument.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        decoration.classList.add("konitifBlocklyPlayback");
        decoration.setAttribute("pointer-events", "none");
        decoration.innerHTML =
          '<title></title><text text-anchor="end" font-size="8" font-weight="700"></text><line class="konitifBlocklyPlaybackTrack" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" /><line class="konitifBlocklyPlaybackValue" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke" />';
        root.append(decoration);
      }
      decoration.querySelector("title")!.textContent = warning
        ? `${caption} — ${warning}`
        : caption;
      const text = decoration.querySelector("text")!;
      text.textContent = caption;
      text.setAttribute("x", String(Math.max(8, size.headerWidth - 8)));
      text.setAttribute("y", "11");
      // A statement stack advances from top to bottom. Project progress in the
      // same direction, in a quiet gutter outside the block silhouette, rather
      // than drawing a horizontal meter across the block content.
      const railX = -8;
      const railStart = 6;
      const railEnd = Math.max(railStart, size.height - 6);
      const track = decoration.querySelector<SVGLineElement>(
        ".konitifBlocklyPlaybackTrack",
      )!;
      track.setAttribute("x1", String(railX));
      track.setAttribute("x2", String(railX));
      track.setAttribute("y1", String(railStart));
      track.setAttribute("y2", String(railEnd));
      const value = decoration.querySelector<SVGLineElement>(
        ".konitifBlocklyPlaybackValue",
      )!;
      value.setAttribute("x1", String(railX));
      value.setAttribute("x2", String(railX));
      value.setAttribute("y1", String(railStart));
      value.setAttribute(
        "y2",
        String(railStart + ((railEnd - railStart) * progress) / 100),
      );
      value.style.display = progress > 0 ? "" : "none";
      applied.set(id, { root, signature });
    }
  }
  return {
    present,
    reset() {
      applied.clear();
    },
  };
}
