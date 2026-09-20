import assert from 'node:assert/strict';
import { addNodeToGraph, addEdgeToGraph, createNodalGraphDocument, createWorkflowFromNodalGraph } from '@konitif/nodal';

export function structuredScenario() {
  const dialect = { id: 'test.ports', title: 'Ports', nodeRegistry: [{
    type: 'test:task', title: 'Task', description: 'Shared definition',
    inputs: [{ id: 'trigger', label: 'Trigger', mode: 'control', dataType: 'object' }],
    outputs: [
      { id: 'value', label: 'Value', mode: 'value', dataType: 'number' },
      { id: 'done', label: 'Done', mode: 'control', dataType: 'object' },
      { id: 'failed', label: 'Failed', mode: 'control', dataType: 'object' },
      { id: 'event', label: 'Event', mode: 'event', dataType: 'object' }
    ], defaultConfig: { name: '', opaque: { retained: true } },
    execute() { throw new Error('Editing must not execute a task'); }
  }, {
    type: 'test:listener', title: 'Listener', description: 'Shared event definition',
    inputs: [{ id: 'event', label: 'Event', mode: 'event', dataType: 'object' }], outputs: [], defaultConfig: {},
    execute() { throw new Error('Editing must not execute a listener'); }
  }] };
  let graph = createNodalGraphDocument({ dialect: dialect.id });
  for (const [id, nodeType] of [['first', 'test:task'], ['second', 'test:task'], ['third', 'test:task'], ['listener', 'test:listener']]) {
    const added = addNodeToGraph(graph, dialect, { nodeType, position: { x: 0, y: 0 } });
    const node = added.graph.nodes.at(-1);
    node.id = id;
    for (const port of [...node.inputs, ...node.outputs]) port.nodeId = id;
    graph = added.graph;
  }
  for (const [sourcePortId, targetNodeId, targetPortId] of [['done', 'second', 'trigger'], ['failed', 'third', 'trigger'], ['event', 'listener', 'event']]) {
    const added = addEdgeToGraph(graph, dialect, { sourceNodeId: 'first', sourcePortId, targetNodeId, targetPortId });
    assert.equal(added.validation.valid, true);
    graph = added.graph;
  }
  const contributions = dialect.nodeRegistry.map(node => ({
    id: node.type, dialectId: dialect.id, nodeType: node.type,
    fields: node.type === 'test:task' ? [{ configKey: 'name', label: 'Name', editor: 'text' }] : []
  }));
  return { snapshot: { revision: 'one', workflow: createWorkflowFromNodalGraph(graph), dialect }, contributions };
}
