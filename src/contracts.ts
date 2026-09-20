import type { Workflow } from '@konitif/composition';
import type { NodalDialect } from '@konitif/nodal';

/** Presentation only: node meaning and port schema are resolved from the host dialect. */
export interface BlocklyNodeContribution {
  id: string;
  dialectId: string;
  nodeType: string;
  label?: string;
  colour?: string;
  fields?: readonly { configKey: string; label: string; editor: 'number' | 'text' | 'boolean';
    options?: readonly { label: string; value: string }[] }[];
  composite?: BlocklyCompositeReference;
  /** Native statement projection. Container inputs reference the tail of their stack.
   * The host's shared dialect owns the meaning of these ports, not Blockly. */
  statement?: {
    previous?: string;
    next?: string;
    check?: string | string[];
    containers?: readonly { portId: string; label: string; check?: string | string[] }[];
  };
}

/** Extension contract. This first projection deliberately refuses composite editing/execution. */
export interface BlocklyCompositeReference {
  definition: { workflowId: string; revision: string };
  parameters: readonly { name: string; portId: string }[];
  results: readonly { name: string; portId: string }[];
  completionPortId: string;
  errorPortId: string;
  editing: 'shared-definition' | 'local-variant';
}

export interface BlocklyWorkflowSnapshot {
  /** Changes on any canonical update relevant to editing; opaque to the Tool. */
  revision: string;
  workflow: Workflow;
  dialect: NodalDialect;
}

export interface BlocklyCommitRequest {
  baseRevision: string;
  workflowId: string;
  candidate: Workflow;
}
export type BlocklyCommitResult =
  | { accepted: true }
  | { accepted: false; reason: string };

/** Ephemeral host observation, never persisted or compiled into the Workflow. */
export interface BlocklyPlaybackReading {
  state: 'ready' | 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  warning?: { message: string };
}

/** Host owns read, subscription, admission, persistence and optional common runtime. */
export interface NodalBlocklyHost {
  read(): BlocklyWorkflowSnapshot | null;
  subscribe(listener: () => void): () => void;
  commit(request: BlocklyCommitRequest): BlocklyCommitResult;
  /** Ephemeral focus intent, never a semantic edit or a runtime command. */
  select?(request: { workflowId: string; revision: string; moduleId: string | null }): void;
  runtime?: {
    availability(snapshot: BlocklyWorkflowSnapshot): { available: boolean; reason?: string };
    requestRun(request: { workflowId: string; revision: string }): BlocklyCommitResult;
    /** Seek the canonical host transport using normalized sequence progress. */
    requestSeek?(progress: number): BlocklyCommitResult;
    requestStop?(): void;
    observe?(): { state: 'idle' | 'preparing' | 'running' | 'completed' | 'stopped' | 'failed';
      activeModuleId?: string | null; progress: number; message?: string;
      blocks?: Readonly<Record<string, BlocklyPlaybackReading>> };
    subscribe?(listener: () => void): () => void;
  };
}

export interface BlocklyBlockReading {
  id: string;
  contributionId: string;
  fields: Record<string, string | number | boolean>;
  /** Tree child ID (legacy), explicit output reference, or disconnected input. */
  inputs: Record<string, string | { moduleId: string; portId: string } | null>;
}
export interface BlocklyProjection {
  /** Reference cards preserve graph ports without inventing statement order. */
  layout?: 'tree' | 'references' | 'mixed';
  editable: boolean;
  issues: string[];
  blocks: BlocklyBlockReading[];
}

export interface BlocklyEditorPort {
  render(projection: BlocklyProjection, contributions: readonly BlocklyNodeContribution[], snapshot: BlocklyWorkflowSnapshot | null): void;
  read(): BlocklyBlockReading[];
  onSemanticChange(listener: () => void): () => void;
  onSelectionChange?(listener: (moduleId: string | null) => void): () => void;
  resize(): void;
  highlight?(moduleId: string | null): void;
  presentPlayback?(blocks: Readonly<Record<string, BlocklyPlaybackReading>>, label: (state: BlocklyPlaybackReading['state']) => string): void;
  dispose(): void;
}
