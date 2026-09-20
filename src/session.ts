import type { BlocklyEditorPort, BlocklyNodeContribution, BlocklyWorkflowSnapshot, NodalBlocklyHost, BlocklyPlaybackReading } from './contracts.js';
import { BlocklyContributionCatalog } from './catalog.js';
import { projectBlocklyWorkflow, proposeBlocklyEdit } from './projection.js';

/** A disposable editing session, never the owner of the host or of its catalog. */
export function createNodalBlocklySession(options: {
  host: NodalBlocklyHost;
  catalog: BlocklyContributionCatalog;
  createEditor(): BlocklyEditorPort;
  status?(message: string): void;
}) {
  let editor: BlocklyEditorPort | null = null;
  let base: BlocklyWorkflowSnapshot | null = null;
  let contributions: readonly BlocklyNodeContribution[] = [];
  let disposed = false, rendering = false;
  let selectedModuleId: string | null = null;
  const releases: (() => void)[] = [];
  function select(moduleId: string | null) {
    if (!editor || !base || rendering) return;
    selectedModuleId = moduleId;
    options.host.select?.({ workflowId: base.workflow.id, revision: base.revision, moduleId });
  }
  function refresh() {
    if (!editor) return;
    base = options.host.read();
    base = base && { ...base, workflow: structuredClone(base.workflow) };
    contributions = options.catalog.list();
    rendering = true;
    try {
      const projection = base ? projectBlocklyWorkflow(base, contributions) : { editable: false, issues: ['no-workflow'], blocks: [] };
      editor.render(projection, contributions, base);
      options.status?.(projection.issues[0] ?? (contributions.length
        ? (contributions.some(contribution => contribution.statement) ? 'ready-statements' :
          'layout' in projection && projection.layout === 'mixed' ? 'ready-mixed' :
          'layout' in projection && projection.layout === 'references' ? 'ready-references' : 'ready') : 'empty-catalog'));
    } finally { rendering = false; }
  }
  function commit() {
    if (!editor || !base || rendering) return;
    const current = options.host.read();
    if (!current || current.revision !== base.revision || current.workflow.id !== base.workflow.id) { refresh(); options.status?.('source-changed'); return; }
    const proposal = proposeBlocklyEdit(base, contributions, editor.read());
    if (!proposal.accepted) { refresh(); options.status?.(proposal.reason); return; }
    if (!proposal.changed) return;
    const result = options.host.commit({ baseRevision: base.revision, workflowId: base.workflow.id, candidate: proposal.candidate });
    const selected = selectedModuleId;
    refresh();
    // A parameter edit of the selected occurrence can change its host focus.
    // Foreign refreshes and viewport events never claim global selection.
    if (result.accepted && selected && base?.workflow.composition.modules.some(module => module.id === selected)) select(selected);
    if (!result.accepted) options.status?.(result.reason);
  }
  function deactivate() {
    for (const release of releases.splice(0).reverse()) release();
    editor?.dispose(); editor = null; base = null; selectedModuleId = null;
  }
  return {
    activate() {
      if (disposed) throw new Error('session-disposed');
      if (editor) return;
      try {
        editor = options.createEditor();
        releases.push(options.host.subscribe(refresh));
        releases.push(options.catalog.subscribe(refresh));
        releases.push(editor.onSemanticChange(commit));
        if (editor.onSelectionChange) releases.push(editor.onSelectionChange(select));
        refresh();
      } catch (error) { deactivate(); throw error; }
    },
    deactivate,
    resize() { editor?.resize(); },
    highlight(moduleId: string | null) { editor?.highlight?.(moduleId); },
    presentPlayback(blocks: Readonly<Record<string, BlocklyPlaybackReading>>, label: (state: BlocklyPlaybackReading['state']) => string) { editor?.presentPlayback?.(blocks, label); },
    run() {
      const snapshot = options.host.read(), runtime = options.host.runtime;
      if (!editor || !snapshot || !runtime) return { accepted: false as const, reason: 'runtime-unavailable' };
      const availability = runtime.availability(snapshot);
      if (!availability.available) return { accepted: false as const, reason: availability.reason ?? 'runtime-unavailable' };
      return runtime.requestRun({ workflowId: snapshot.workflow.id, revision: snapshot.revision });
    },
    dispose() { if (disposed) return; deactivate(); disposed = true; }
  };
}
