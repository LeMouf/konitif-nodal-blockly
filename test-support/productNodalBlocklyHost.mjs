import { commitWorkflowComposition } from '@konitif/composition';
import { projectWorkflowToNodalGraph, validateGraphDocument } from '@konitif/nodal';
/** Product adapter only. No Blockly workspace or second persistent workflow is held here. */
export function createBehaviorStudioNodalBlocklyHost(ports) {
    const revision = (artifact) => `${artifact.id}:${artifact.revision}`;
    return {
        read() {
            const artifact = ports.read();
            if (!artifact)
                return null;
            const dialect = ports.resolveDialect(artifact.execution.dialectId);
            return dialect ? { revision: revision(artifact), workflow: structuredClone(artifact.workflow), dialect } : null;
        },
        subscribe: listener => ports.subscribe(listener),
        commit(request) {
            const current = ports.read();
            if (!current || revision(current) !== request.baseRevision || current.workflow.id !== request.workflowId)
                return { accepted: false, reason: 'source-changed' };
            if (request.candidate.id !== current.workflow.id || request.candidate.composition.id !== current.workflow.composition.id)
                return { accepted: false, reason: 'identity-mismatch' };
            const candidate = structuredClone(request.candidate);
            const dialect = ports.resolveDialect(current.execution.dialectId);
            if (!dialect || projectWorkflowToNodalGraph(candidate).dialect !== dialect.id)
                return { accepted: false, reason: 'dialect-unavailable' };
            const validation = validateGraphDocument(projectWorkflowToNodalGraph(candidate), dialect);
            if (!validation.valid)
                return { accepted: false, reason: validation.issues.map(issue => issue.message).join('; ') };
            const admitted = commitWorkflowComposition(current.workflow, candidate);
            if (!admitted.accepted)
                return { accepted: false, reason: admitted.validation.issues.map(issue => issue.message).join('; ') };
            const latest = ports.read();
            if (!latest || revision(latest) !== request.baseRevision || latest.workflow.id !== request.workflowId)
                return { accepted: false, reason: 'source-changed' };
            const result = ports.publish({ ...latest, workflow: admitted.workflow });
            return result.accepted ? { accepted: true } : { accepted: false, reason: result.diagnostics.map(issue => issue.message).join('; ') || 'authority-rejected' };
        },
        runtime: ports.runtime
    };
}
