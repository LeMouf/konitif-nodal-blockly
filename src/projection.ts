import { commitWorkflowComposition, type Workflow } from '@konitif/composition';
import { createNodeFromDefinition, createNodalGraphDocument, nodalNodeToModule, projectWorkflowToNodalGraph, validateGraphDocument, type NodalDialect } from '@konitif/nodal';
import type { BlocklyBlockReading, BlocklyNodeContribution, BlocklyProjection, BlocklyWorkflowSnapshot } from './contracts.js';

const failure = (reason: string) => ({ accepted: false as const, reason });

/** Presentation eligibility only; shared validation remains the connection authority. */
export function canUseBlocklyValueOutput(definition: NodalDialect['nodeRegistry'][number]): boolean {
  return definition.outputs.length === 1 &&
    [...definition.inputs, ...definition.outputs].every(port => port.mode === 'value');
}

/** A presentation query, not admission. Final edits validate the complete graph. */
export function getBlocklyReferenceChoices(snapshot: BlocklyWorkflowSnapshot, contributions: readonly BlocklyNodeContribution[],
  occurrences: readonly Pick<BlocklyBlockReading, 'id' | 'contributionId'>[], targetId: string, portId: string) {
  const target = occurrences.find(b => b.id === targetId);
  if (!target) return [];
  const targetDefinition = resolve(snapshot, contributions, target.contributionId).definition;
  return occurrences.flatMap(source => {
    if (source.id === targetId) return [];
    const definition = resolve(snapshot, contributions, source.contributionId).definition;
    return definition.outputs.flatMap(port => {
      const graph = createNodalGraphDocument({ dialect: snapshot.dialect.id });
      graph.nodes = [source, target].map((occurrence, index) => {
        const node = createNodeFromDefinition({ definition: index === 0 ? definition : targetDefinition, position: { x: 0, y: 0 } });
        node.id = occurrence.id;
        for (const p of [...node.inputs, ...node.outputs]) p.nodeId = node.id;
        return node;
      });
      graph.edges = [{ id: 'projection-query', sourceNodeId: source.id, sourcePortId: port.id, targetNodeId: targetId, targetPortId: portId }];
      if (!validateGraphDocument(graph, snapshot.dialect).valid) return [];
      return [{ label: `${port.label} [${port.id}] ← ${definition.title} [${source.id}] (${port.mode}:${port.dataType})`,
        reference: { moduleId: source.id, portId: port.id } }];
    });
  });
}
function resolve(snapshot: BlocklyWorkflowSnapshot, contributions: readonly BlocklyNodeContribution[], id: string) {
  const contribution = contributions.find(c => c.id === id && c.dialectId === snapshot.dialect.id);
  const definition = snapshot.dialect.nodeRegistry.find(d => d.type === contribution?.nodeType);
  if (!contribution || !definition) throw new Error(`missing-definition:${id}`);
  if (contribution.composite) throw new Error(`composite-not-supported:${id}`);
  const statement = contribution.statement;
  if (statement) {
    for (const port of [statement.previous, ...(statement.containers ?? []).map(c => c.portId)].filter(Boolean)) {
      if (!definition.inputs.some(p => p.id === port)) throw new Error(`statement-input-missing:${port}`);
    }
    if (statement.next && !definition.outputs.some(p => p.id === statement.next)) throw new Error('statement-output-missing');
  }
  for (const field of contribution.fields ?? []) {
    if (!Object.hasOwn(definition.defaultConfig, field.configKey) || typeof definition.defaultConfig[field.configKey] !== (field.editor === 'text' ? 'string' : field.editor)) {
      throw new Error(`field-not-in-shared-schema:${field.configKey}`);
    }
  }
  return { contribution, definition };
}

/** Tree blocks for simple value dialects; explicit port references for structured dialects. */
export function projectBlocklyWorkflow(snapshot: BlocklyWorkflowSnapshot, contributions: readonly BlocklyNodeContribution[]): BlocklyProjection {
  const issues: string[] = [];
  const graph = projectWorkflowToNodalGraph(snapshot.workflow);
  const blocks: BlocklyBlockReading[] = [];
  const structured = contributions.some(c => {
    const definition = snapshot.dialect.nodeRegistry.find(d => d.type === c.nodeType && c.dialectId === snapshot.dialect.id);
    return definition && (definition.outputs.length > 1 || [...definition.inputs, ...definition.outputs].some(p => p.mode !== 'value'));
  });
  const hasValues = contributions.some(c => {
    const definition = snapshot.dialect.nodeRegistry.find(d => d.type === c.nodeType && c.dialectId === snapshot.dialect.id);
    return definition && canUseBlocklyValueOutput(definition);
  });
  const layout = contributions.some(c => c.statement) ? 'mixed' : structured ? (hasValues ? 'mixed' : 'references') : 'tree';
  if (graph.dialect !== snapshot.dialect.id) issues.push('dialect-mismatch');
  for (const node of graph.nodes) {
    try {
      const contribution = contributions.find(c => c.nodeType === node.type && c.dialectId === snapshot.dialect.id);
      if (!contribution) throw new Error(`missing-projection:${node.type}`);
      const { definition } = resolve(snapshot, contributions, contribution.id);
      if (node.mode !== 'always' || node.locked || node.missingDefinition) throw new Error(`node-state-not-editable:${node.id}`);
      const module = snapshot.workflow.composition.modules.find(m => m.id === node.id)!;
      // Keep unrepresentable contracts intact instead of casting their semantics to a value block.
      for (const port of module.ports) {
        const template = (port.direction === 'input' ? definition.inputs : definition.outputs).find(p => p.id === port.id);
        if (!template || template.mode !== port.contract.mode ||
          (port.contract.valueType !== template.dataType && port.contract.valueType !== 'unknown') || port.contract.multiple) {
          throw new Error(`port-not-representable:${node.id}:${port.id}`);
        }
      }
      if (module.ports.length !== definition.inputs.length + definition.outputs.length) throw new Error(`schema-changed:${node.id}`);
      const fields: BlocklyBlockReading['fields'] = {};
      for (const field of contribution.fields ?? []) {
        const value = node.config[field.configKey] ?? definition.defaultConfig[field.configKey];
        const expected = field.editor === 'text' ? 'string' : field.editor;
        if (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`field-not-representable:${field.configKey}`);
        fields[field.configKey] = value as string | number | boolean;
      }
      blocks.push({ id: node.id, contributionId: contribution.id, fields, inputs: Object.fromEntries(definition.inputs.map(p => [p.id, null])) });
    } catch (error) { issues.push(error instanceof Error ? error.message : 'projection-failed'); }
  }
  const children = new Set<string>();
  for (const connection of snapshot.workflow.composition.connections) {
    const parent = blocks.find(b => b.id === connection.target.moduleId);
    const child = blocks.find(b => b.id === connection.source.moduleId);
    const childModule = snapshot.workflow.composition.modules.find(m => m.id === connection.source.moduleId);
    const outputs = childModule?.ports.filter(p => p.direction === 'output') ?? [];
    if (!parent || !child || !(connection.target.portId in parent.inputs) || !outputs.some(p => p.id === connection.source.portId) ||
        (layout === 'tree' && outputs.length !== 1)) {
      issues.push(`connection-not-representable:${connection.id}`); continue;
    }
    if ((layout === 'tree' && children.has(child.id)) || parent.inputs[connection.target.portId] !== null) issues.push(`shared-output-or-occupied-input:${connection.id}`);
    children.add(child.id);
    parent.inputs[connection.target.portId] = layout !== 'tree'
      ? { moduleId: child.id, portId: connection.source.portId } : child.id;
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { issues.push(`cycle-not-supported:${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of Object.values(blocks.find(b => b.id === id)?.inputs ?? {})) if (child) visit(typeof child === 'string' ? child : child.moduleId);
    visiting.delete(id); visited.add(id);
  };
  for (const block of blocks) visit(block.id);
  const validation = validateGraphDocument(graph, snapshot.dialect);
  for (const block of blocks) {
    const statement = contributions.find(c => c.id === block.contributionId)?.statement;
    if (statement?.next && snapshot.workflow.composition.connections.filter(c => c.source.moduleId === block.id && c.source.portId === statement.next).length > 1) {
      issues.push(`statement-output-shared:${block.id}`);
    }
    if (statement) for (const [port,ref] of Object.entries(block.inputs)) {
      if (!ref || typeof ref==='string') continue;
      const source = blocks.find(b=>b.id===ref.moduleId);
      const sourceStatement=contributions.find(c=>c.id===source?.contributionId)?.statement;
      if (port===statement.previous || statement.containers?.some(c=>c.portId===port)) {
        if(sourceStatement?.next!==ref.portId)issues.push(`statement-source-not-representable:${block.id}:${port}`);
        const container=statement.containers?.find(c=>c.portId===port);
        if(container){
          let head=source;
          const seen=new Set<string>();
          while(head && !seen.has(head.id)){
            seen.add(head.id);
            const shape=contributions.find(c=>c.id===head!.contributionId)?.statement;
            const previous=shape?.previous?head.inputs[shape.previous]:null;
            if(!previous || typeof previous==='string')break;
            head=blocks.find(b=>b.id===previous.moduleId);
          }
          const shape=contributions.find(c=>c.id===head?.contributionId)?.statement;
          const check=container.check??statement.check,other=shape?.check;
          if(check && other && !(Array.isArray(check)?check:[check]).some(c=>(Array.isArray(other)?other:[other]).includes(c)))issues.push(`statement-container-check-mismatch:${block.id}:${port}`);
        }
      } else if(snapshot.workflow.composition.connections.filter(c=>c.source.moduleId===ref.moduleId&&c.source.portId===ref.portId).length>1){
        issues.push(`statement-parameter-shared:${block.id}:${port}`);
      }
    }
  }
  if (!validation.valid) issues.push(...validation.issues.filter(i => i.severity === 'error').map(i => `invalid-connection:${i.code}`));
  return { layout, editable: issues.length === 0, issues: [...new Set(issues)], blocks };
}

/** Patch the existing canonical artifact; no whole-workflow roundtrip through a lossy graph encoding. */
export function proposeBlocklyEdit(snapshot: BlocklyWorkflowSnapshot, contributions: readonly BlocklyNodeContribution[], reading: readonly BlocklyBlockReading[]):
  { accepted: true; candidate: Workflow; changed: boolean } | { accepted: false; reason: string } {
  try {
    const projection = projectBlocklyWorkflow(snapshot, contributions);
    if (!projection.editable) return failure(projection.issues.join('; '));
    if (new Set(reading.map(b => b.id)).size !== reading.length) return failure('duplicate-occurrence');
    const candidate = structuredClone(snapshot.workflow);
    const previousModules = snapshot.workflow.composition.modules;
    candidate.composition.modules = reading.map(block => {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(block.id)) throw new Error('invalid-occurrence-id');
      const { contribution, definition } = resolve(snapshot, contributions, block.contributionId);
      const previous = previousModules.find(m => m.id === block.id);
      if (previous && previous.kind !== definition.type) throw new Error('occurrence-definition-changed');
      const module = previous ? structuredClone(previous) : nodalNodeToModule(createNodeFromDefinition({ definition, position: { x: 0, y: 0 } }));
      if (!previous) {
        module.id = block.id;
        for (const port of module.ports) {
          port.moduleId = block.id;
          port.contract.id = `contract.${block.id}.${port.id}`;
        }
      }
      const config = { ...(module.metadata?.config as Record<string, unknown> ?? {}) };
      const fields = contribution.fields ?? [];
      if (Object.keys(block.fields).some(key => !fields.some(f => f.configKey === key))) throw new Error('unknown-config-field');
      for (const field of fields) {
        const value = block.fields[field.configKey];
        if (typeof value !== (field.editor === 'text' ? 'string' : field.editor) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`invalid-field:${field.configKey}`);
        config[field.configKey] = value;
      }
      module.metadata = { ...module.metadata, config };
      return module;
    });
    // Preserve authored module ordering, even if Blockly enumerates them in a different order.
    const priorOrder = new Map(previousModules.map((m, i) => [m.id, i]));
    candidate.composition.modules.sort((a, b) => (priorOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (priorOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    candidate.composition.connections = [];
    const usedChildren = new Set<string>();
    for (const block of reading) {
      const { definition } = resolve(snapshot, contributions, block.contributionId);
      if (Object.keys(block.inputs).some(id => !definition.inputs.some(p => p.id === id))) throw new Error('unknown-input');
      for (const [portId, reference] of Object.entries(block.inputs)) {
        if (reference === null) continue;
        const childId = typeof reference === 'string' ? reference : reference.moduleId;
        const child = candidate.composition.modules.find(m => m.id === childId);
        const outputs = child?.ports.filter(p => p.direction === 'output') ?? [];
        const output = typeof reference === 'string' ? (outputs.length === 1 ? outputs[0] : undefined) : outputs.find(p => p.id === reference.portId);
        if (!child || !output || (projection.layout === 'tree' && usedChildren.has(childId))) throw new Error('invalid-or-shared-child');
        usedChildren.add(childId);
        const previous = snapshot.workflow.composition.connections.find(c => c.source.moduleId === childId && c.source.portId === output.id && c.target.moduleId === block.id && c.target.portId === portId);
        candidate.composition.connections.push(previous ? structuredClone(previous) : {
          id: `blockly.connection:${crypto.randomUUID()}`,
          source: { moduleId: childId, portId: output.id }, target: { moduleId: block.id, portId }
        });
      }
    }
    const edgeOrder = new Map(snapshot.workflow.composition.connections.map((c, i) => [c.id, i]));
    candidate.composition.connections.sort((a, b) => (edgeOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (edgeOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    const ids = new Set(candidate.composition.modules.map(m => m.id));
    for (const domain of candidate.composition.domains) domain.moduleIds = domain.moduleIds.filter(id => ids.has(id));
    const oldPortContractIds = new Set(previousModules.flatMap(m => m.ports.map(p => p.contract.id)));
    const nextPortContractIds = new Set(candidate.composition.modules.flatMap(m => m.ports.map(p => p.contract.id)));
    candidate.composition.contracts = candidate.composition.contracts.filter(c => !oldPortContractIds.has(c.id) || nextPortContractIds.has(c.id));
    for (const module of candidate.composition.modules.filter(m => !priorOrder.has(m.id))) {
      for (const port of module.ports) if (!candidate.composition.contracts.some(c => c.id === port.contract.id)) candidate.composition.contracts.push(structuredClone(port.contract));
    }
    const check = projectBlocklyWorkflow({ ...snapshot, workflow: candidate }, contributions);
    if (!check.editable) return failure(check.issues.join('; '));
    const nodalValidation = validateGraphDocument(projectWorkflowToNodalGraph(candidate), snapshot.dialect);
    if (!nodalValidation.valid) return failure(nodalValidation.issues.map(i => i.message).join('; '));
    const commit = commitWorkflowComposition(snapshot.workflow, candidate);
    if (!commit.accepted) return failure(commit.validation.issues.map(i => i.message).join('; '));
    return { accepted: true, candidate: commit.workflow, changed: JSON.stringify(commit.workflow) !== JSON.stringify(snapshot.workflow) };
  } catch (error) { return failure(error instanceof Error ? error.message : 'invalid-projection'); }
}
