import { isKonitifCapabilityVersionCompatible } from '@konitif/core';
const tool = (id) => ({ kind: 'tool', id });
const collection = (id) => ({ kind: 'collection', id });
/**
 * Canonical authority for Tool grouping and catalog visibility.
 *
 * Tool definitions own identity and capabilities. This manifest alone owns
 * collection membership, profile visibility and preset eligibility. Catalog
 * lists are projections resolved from these relations.
 */
export const behaviorStudioToolCollectionManifest = {
    schemaVersion: 'behavior-studio.tool-collections.v1',
    collections: [
        {
            id: 'behavior.authoring',
            title: 'Behavior authoring',
            description: 'Core surfaces that author, inspect and compose Behavior artifacts.',
            members: [
                tool('behavior.viewer'),
                tool('behavior.timeline'),
                tool('behavior.nodal'),
                tool('konitif.nodal-blockly'),
                tool('behavior.clip-library'),
                tool('behavior.procedural-walk')
            ]
        },
        {
            id: 'behavior.conversation',
            title: 'Conversation',
            description: 'Conversation input and read-only runtime evidence projections.',
            members: [
                tool('behavior.conversation-observation'),
                tool('behavior.conversation-input'),
                tool('behavior.interaction-trace')
            ]
        },
        {
            id: 'behavior.operator-input',
            title: 'Operator input',
            description: 'Explicit local operator input controls, separate from robot observation authorities.',
            members: [tool('behavior.operator-media-capture'), tool('behavior.puppeteer')]
        },
        {
            id: 'behavior.robot-operation',
            title: 'Robot operation',
            description: 'Explicit robot connection, observation, command and runtime declaration surfaces.',
            members: [
                tool('behavior.robot-connect'),
                tool('behavior.camera-observation'),
                tool('behavior.robot-command'),
                tool('behavior.runtime-behavior-catalog'),
                tool('behavior.runtime-behavior-actions'),
                collection('behavior.conversation')
            ]
        },
        {
            id: 'behavior.product',
            title: 'Behavior Studio product',
            description: 'Production Behavior Studio surface assembled from authoring, robot operation and operator input.',
            members: [
                collection('behavior.authoring'),
                collection('behavior.robot-operation'),
                collection('behavior.operator-input')
            ]
        }
    ],
    profiles: [
        {
            id: 'behavior',
            title: 'Behavior',
            exposure: 'PRODUCT',
            members: [collection('behavior.product')]
        }
    ],
    presets: [
        {
            id: 'behavior',
            title: 'Behavior',
            exposure: 'PRODUCT',
            members: [collection('behavior.product')]
        }
    ]
};
export function resolveBehaviorStudioToolCollectionViewToolIds(manifest, kind, viewId) {
    const views = kind === 'profile' ? manifest.profiles : manifest.presets;
    const view = views.find((candidate) => candidate.id === viewId);
    if (!view) {
        return [];
    }
    const collectionsById = new Map(manifest.collections.map((candidate) => [candidate.id, candidate]));
    const resolvedToolIds = [];
    const seenToolIds = new Set();
    const visitMembers = (members, activeCollectionIds) => {
        for (const member of members) {
            if (member.kind === 'tool') {
                if (!seenToolIds.has(member.id)) {
                    seenToolIds.add(member.id);
                    resolvedToolIds.push(member.id);
                }
                continue;
            }
            if (activeCollectionIds.has(member.id)) {
                continue;
            }
            const child = collectionsById.get(member.id);
            if (!child) {
                continue;
            }
            visitMembers(child.members, new Set([...activeCollectionIds, member.id]));
        }
    };
    visitMembers(view.members, new Set());
    return resolvedToolIds;
}
export function validateBehaviorStudioToolCollectionManifest(manifest, tools) {
    const diagnostics = [];
    const toolsById = new Map(tools.map((candidate) => [candidate.id, candidate]));
    const collectionsById = new Map();
    for (const [index, candidate] of manifest.collections.entries()) {
        const path = `collections[${index}:${candidate.id || '<missing>'}]`;
        if (collectionsById.has(candidate.id)) {
            diagnostics.push(createDiagnostic('tool-collection-id-duplicate', `Duplicate collection id "${candidate.id}".`, path));
        }
        else {
            collectionsById.set(candidate.id, candidate);
        }
    }
    const validateMembers = (members, path) => {
        for (const [index, member] of members.entries()) {
            const memberPath = `${path}.members[${index}:${member.id}]`;
            const known = member.kind === 'tool' ? toolsById.has(member.id) : collectionsById.has(member.id);
            if (!known) {
                diagnostics.push(createDiagnostic('tool-collection-member-unknown', `Unknown ${member.kind} member "${member.id}".`, memberPath));
            }
        }
    };
    for (const [index, candidate] of manifest.collections.entries()) {
        validateMembers(candidate.members, `collections[${index}:${candidate.id}]`);
    }
    for (const [index, view] of manifest.profiles.entries()) {
        validateMembers(view.members, `profiles[${index}:${view.id}]`);
    }
    for (const [index, view] of manifest.presets.entries()) {
        validateMembers(view.members, `presets[${index}:${view.id}]`);
    }
    const cycleFingerprints = new Set();
    const visitCollection = (collectionId, trail) => {
        const cycleStart = trail.indexOf(collectionId);
        if (cycleStart >= 0) {
            const cycle = [...trail.slice(cycleStart), collectionId];
            const fingerprint = [...new Set(cycle.slice(0, -1))].sort().join('|');
            if (!cycleFingerprints.has(fingerprint)) {
                cycleFingerprints.add(fingerprint);
                diagnostics.push(createDiagnostic('tool-collection-cycle', `Collection cycle detected: ${cycle.join(' -> ')}.`, `collections[${collectionId}]`));
            }
            return;
        }
        const candidate = collectionsById.get(collectionId);
        if (!candidate)
            return;
        const nextTrail = [...trail, collectionId];
        for (const member of candidate.members) {
            if (member.kind === 'collection')
                visitCollection(member.id, nextTrail);
        }
    };
    for (const candidate of manifest.collections)
        visitCollection(candidate.id, []);
    const validateViews = (kind, views) => {
        const viewIds = new Set();
        for (const [index, view] of views.entries()) {
            const path = `${kind}s[${index}:${view.id}]`;
            if (viewIds.has(view.id)) {
                diagnostics.push(createDiagnostic('tool-collection-view-id-duplicate', `Duplicate ${kind} view id "${view.id}".`, path));
            }
            viewIds.add(view.id);
            const toolIds = resolveBehaviorStudioToolCollectionViewToolIds(manifest, kind, view.id);
            const viewTools = toolIds.flatMap((toolId) => {
                const candidate = toolsById.get(toolId);
                return candidate ? [candidate] : [];
            });
            if (view.exposure === 'PRODUCT') {
                for (const candidate of viewTools) {
                    if (candidate.classification !== 'PRODUCT' || candidate.status !== 'active') {
                        diagnostics.push(createDiagnostic('tool-collection-internal-qa-leak', `Tool "${candidate.id}" is not production-active but is exposed by product ${kind} "${view.id}".`, path));
                    }
                }
            }
            for (const consumer of viewTools) {
                for (const requirement of consumer.capabilities?.consumes ?? []) {
                    if (requirement.mode !== 'required')
                        continue;
                    const provider = viewTools.find((candidate) => (candidate.capabilities?.provides ?? []).some((capability) => capability.id === requirement.id &&
                        isKonitifCapabilityVersionCompatible(capability.version, requirement.versionRange)));
                    if (!provider) {
                        diagnostics.push(createDiagnostic('tool-collection-required-capability-unprovided', `Tool "${consumer.id}" requires ${requirement.id}@${requirement.versionRange}, but ${kind} "${view.id}" contains no compatible provider.`, path));
                    }
                }
            }
        }
    };
    validateViews('profile', manifest.profiles);
    validateViews('preset', manifest.presets);
    return diagnostics;
}
function createDiagnostic(code, message, path) {
    return { severity: 'error', code, message, path };
}
