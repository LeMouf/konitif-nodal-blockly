import { defineKonitifToolModule } from '@konitif/tools';
export * from './contracts.js';
export * from './catalog.js';
export * from './projection.js';
export * from './session.js';

/** Declaration only. No catalog, workspace, contribution or subscription is activated here. */
export const nodalBlocklyToolModule = defineKonitifToolModule({
  id: 'konitif.nodal-blockly', name: 'Blockly', version: '0.284.2',
  scope: 'generic', capability: 'block-workflow-authoring',
  implementationBindingKey: 'konitif.nodal-blockly',
  description: 'Blockly projection over the Nodal and Composition contracts, hosted through explicit ports.',
  capabilities: {
    provides: [{ id: 'konitif.nodal-blockly.edit', version: '1.0.0' }],
    consumes: [
      { id: 'konitif.workflow.authoring', versionRange: '^1.0.0', mode: 'required', purpose: 'Read, validate and commit the canonical Workflow through the host port.' },
      { id: 'konitif.nodal.dialect', versionRange: '^1.0.0', mode: 'required', purpose: 'Resolve the shared definitions; blocks never redefine their semantics.' },
      { id: 'konitif.workflow.run', versionRange: '^1.0.0', mode: 'optional', purpose: 'Request the existing host runtime, if available.' }
    ]
  },
  contributions: [{ id: 'konitif.nodal-blockly.surface', kind: 'surface' }]
});
