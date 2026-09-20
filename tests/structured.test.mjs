import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBlocklyWorkflow, proposeBlocklyEdit } from '../dist/index.js';
import { structuredScenario } from './structuredFixture.mjs';

test('control/event ports and multiple outputs have lossless explicit reference readings', () => {
  const { snapshot, contributions } = structuredScenario();
  const projection = projectBlocklyWorkflow(snapshot, contributions);
  assert.equal(projection.editable, true, projection.issues.join('; '));
  assert.equal(projection.layout, 'references');
  assert.deepEqual(projection.blocks.find(b => b.id === 'second').inputs.trigger, { moduleId: 'first', portId: 'done' });
  assert.deepEqual(projection.blocks.find(b => b.id === 'third').inputs.trigger, { moduleId: 'first', portId: 'failed' });
  assert.deepEqual(projection.blocks.find(b => b.id === 'listener').inputs.event, { moduleId: 'first', portId: 'event' });
  const noop = proposeBlocklyEdit(snapshot, contributions, projection.blocks);
  assert.equal(noop.accepted, true, noop.reason);
  assert.equal(noop.changed, false);
});

test('field edits preserve all output identities, connections and opaque configuration', () => {
  const { snapshot, contributions } = structuredScenario();
  const projection = projectBlocklyWorkflow(snapshot, contributions);
  const proposal = proposeBlocklyEdit(snapshot, contributions, projection.blocks.map(b => b.id === 'first' ? { ...b, fields: { name: 'Edited' } } : b));
  assert.equal(proposal.accepted, true, proposal.reason);
  assert.deepEqual(proposal.candidate.composition.connections, snapshot.workflow.composition.connections);
  assert.deepEqual(proposal.candidate.composition.modules[0].ports, snapshot.workflow.composition.modules[0].ports);
  assert.deepEqual(proposal.candidate.composition.modules[0].metadata.config.opaque, { retained: true });
});

test('explicit rewire allows fan-out and refuses incompatible mode/type, missing output and cycles', () => {
  const { snapshot, contributions } = structuredScenario();
  const blocks = projectBlocklyWorkflow(snapshot, contributions).blocks;
  const rewire = portId => blocks.map(b => b.id === 'third' ? { ...b, inputs: { trigger: { moduleId: 'first', portId } } } : b);
  const fanout = proposeBlocklyEdit(snapshot, contributions, rewire('done'));
  assert.equal(fanout.accepted, true, fanout.reason);
  for (const portId of ['value', 'event', 'unknown']) {
    assert.equal(proposeBlocklyEdit(snapshot, contributions, rewire(portId)).accepted, false);
  }
  const cycle = blocks.map(b => b.id === 'first' ? { ...b, inputs: { trigger: { moduleId: 'second', portId: 'done' } } } : b);
  assert.equal(proposeBlocklyEdit(snapshot, contributions, cycle).accepted, false);
  assert.equal(snapshot.workflow.composition.modules[0].metadata.config.name, '');
});
