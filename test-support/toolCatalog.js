import { defineKonitifToolModule } from '@konitif/tools';
import { behaviorStudioToolCollectionManifest, resolveBehaviorStudioToolCollectionViewToolIds, validateBehaviorStudioToolCollectionManifest } from './toolCollectionManifest.js';
export function createBehaviorStudioCatalogToolModule(entry, definition) {
    return defineKonitifToolModule({
        id: entry.id,
        name: entry.title,
        capability: entry.id,
        scope: 'product-specialization',
        capabilities: entry.capabilities,
        implementationBindingKey: entry.implementationBindingKey,
        definition,
        contributions: [
            ...(entry.commands ?? []).map((id) => ({ id, kind: 'command' })),
            ...(entry.widgets ?? []).map((id) => ({ id, kind: 'widget' })),
            ...(entry.surfaces ?? []).map((id) => ({ id, kind: 'surface' }))
        ]
    });
}
export function listBehaviorStudioCatalogToolModules() {
    return behaviorStudioToolCatalog.map(createBehaviorStudioCatalogToolModule);
}
const behaviorStudioToolDefinitions = [
    {
        id: 'konitif.nodal-blockly', title: 'Nodal Blockly', owner: 'behavior-studio',
        classification: 'PRODUCT', instancePolicy: 'multi-instance', status: 'active',
        implementationBindingKey: 'konitif.nodal-blockly',
        capabilities: {
            provides: [{ id: 'konitif.nodal-blockly.edit', version: '1.0.0' }],
            consumes: [] // Canonical authoring and dialect ports are supplied by the product host, not another mounted Tool.
        },
        surfaces: ['konitif.nodal-blockly.surface'], aliases: ['blockly'],
        docs: ['docs/architecture/behavior-studio/nodal-blockly-host.md'],
        tests: ['tests/nodalBlocklyHost.test.ts']
    },
    { id: 'behavior.procedural-walk', title: 'Marche procédurale', owner: 'behavior-studio', classification: 'PRODUCT',
        instancePolicy: 'singleton', status: 'active', implementationBindingKey: 'behavior.procedural-walk',
        commands: ['toggle-procedural-physics-dock', 'toggle-procedural-replay-dock', 'toggle-procedural-history-dock'], widgets: ['behavior.procedural-walk.controls', 'behavior.procedural-walk.physics', 'behavior.procedural-walk.physics.history', 'behavior.procedural-walk.replay'] },
    {
        id: 'behavior.viewer',
        title: 'Viewer',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'multi-instance',
        status: 'active',
        implementationBindingKey: 'behavior.viewer',
        commands: ['toggle-viewer-fullscreen-companion-preview', 'viewer-menu-scene'],
        widgets: ['behavior.viewer.camera-presets'],
        aliases: ['robot-viewer', 'viewer'],
        docs: [
            'docs/architecture/tools/behavior-viewer-composition-inventory.md',
            'docs/product/behavior-studio/viewer-temporal-projection/viewer-casual-surface-contract.md'
        ],
        tests: ['tests/behaviorViewerCapabilities.test.ts', 'tests/behaviorStudioSurfaceGovernance.test.ts']
    },
    {
        id: 'behavior.timeline',
        title: 'Timeline',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'multi-instance',
        status: 'active',
        implementationBindingKey: 'behavior.timeline',
        capabilities: {
            provides: [{ id: 'behavior.timeline.preview', version: '1.0.0' }],
            consumes: [
                {
                    id: 'behavior.clip-library.browse',
                    versionRange: '^1.0.0',
                    mode: 'optional',
                    purpose: 'Select a Clip source when the Timeline has no current subject.'
                },
                {
                    id: 'behavior.workflow.edit',
                    versionRange: '^1.0.0',
                    mode: 'optional',
                    purpose: 'Insert a temporary Timeline preview into an editable Workflow.'
                }
            ]
        },
        aliases: ['timeline'],
        docs: [
            'docs/architecture/behavior-studio/timeline-session-state.md',
            'docs/experience/experience-004-timeline-product-experience.md'
        ],
        tests: ['tests/timelineComponentUi.test.ts']
    },
    {
        id: 'behavior.nodal',
        title: 'Workflow',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.nodal',
        capabilities: {
            provides: [{ id: 'behavior.workflow.edit', version: '1.0.0' }],
            consumes: []
        },
        widgets: [
            'behavior.nodal.widget.workflow-browser',
            'behavior.nodal.widget.run-dock',
            'behavior.nodal.widget.transport'
        ],
        aliases: ['behavior-flow', 'nodal'],
        docs: [
            'docs/architecture/behavior-studio/nodal-single-world-space.md',
            'docs/architecture/behavior-studio/nodal-viewport-interaction-contract.md'
        ],
        tests: ['tests/nodalBehaviorComposableLibraryModel.test.ts']
    },
    {
        id: 'behavior.clip-library',
        title: 'Clip Library',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.clip-library',
        capabilities: {
            provides: [{ id: 'behavior.clip-library.browse', version: '1.0.0' }],
            consumes: [
                {
                    id: 'behavior.timeline.preview',
                    versionRange: '^1.0.0',
                    mode: 'optional',
                    purpose: 'Project a temporary Clip candidate into a mounted Timeline.'
                },
                {
                    id: 'behavior.workflow.edit',
                    versionRange: '^1.0.0',
                    mode: 'optional',
                    purpose: 'Insert a selected Clip into an editable Workflow.'
                }
            ]
        },
        commands: [
            'open-tool:behavior.clip-library',
            'focus-tool:behavior.clip-library',
            'toggle-widget:behavior.clip-library.widget'
        ],
        widgets: ['behavior.clip-library.widget'],
        surfaces: ['behavior.clip-library.surface'],
        aliases: ['clips', 'clip-library'],
        docs: [
            'packages/maxtronics-behavior-studio-tools/README.md',
            'docs/architecture/conformance/tool-catalog-conformance-governance.md'
        ],
        tests: ['tests/clipLibrarySurfaceModel.test.ts', 'tests/behaviorStudioToolCatalog.test.ts']
    },
    {
        id: 'behavior.robot-connect',
        title: 'Robot Connect',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.robot-connect',
        commands: ['open-tool:behavior.robot-connect', 'focus-tool:behavior.robot-connect'],
        aliases: ['robot-connect', 'robot-connection'],
        docs: [
            'docs/product/PUPPETEER_ROBOT_CONNECT_BOUNDARY.md',
            'docs/product/robot-connect-phase-1/robot-connect-contract-resolution.md'
        ],
        tests: ['tests/robotConnectProductController.test.ts', 'tests/robotConnectTool.test.ts']
    },
    {
        id: 'behavior.camera-observation',
        title: 'Camera Observation',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.camera-observation',
        commands: ['open-tool:behavior.camera-observation', 'focus-tool:behavior.camera-observation'],
        aliases: ['robot-camera', 'camera-observation', 'top-camera'],
        docs: ['docs/product/robot-connect-phase-1/camera-observation-tool-discovery.md'],
        tests: ['tests/behaviorStudioCameraObservationController.test.ts', 'tests/cameraObservationTool.test.ts']
    },
    {
        id: 'behavior.robot-command',
        title: 'Robot Command',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.robot-command',
        commands: ['open-tool:behavior.robot-command', 'focus-tool:behavior.robot-command'],
        aliases: ['robot-command', 'send-current-step', 'behavior-runner'],
        docs: ['docs/product/robot-connect-phase-1/robot-command-tool-discovery.md'],
        tests: ['tests/robotCommandTool.test.ts', 'tests/robotConnectProductController.test.ts']
    },
    {
        id: 'behavior.runtime-behavior-catalog',
        title: 'Runtime Behavior Catalog',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.runtime-behavior-catalog',
        commands: ['open-tool:behavior.runtime-behavior-catalog', 'focus-tool:behavior.runtime-behavior-catalog'],
        aliases: ['behavior-catalog', 'runtime-behaviors', 'behavior-specs'],
        docs: ['docs/product/robot-connect-phase-1/runtime-behavior-catalog-tool-discovery.md'],
        tests: ['tests/runtimeBehaviorCatalogTool.test.ts', 'tests/runtimeBehaviorCatalogController.test.ts']
    },
    {
        id: 'behavior.runtime-behavior-actions',
        title: 'Behavior Actions',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.runtime-behavior-actions',
        capabilities: {
            provides: [{ id: 'behavior.runtime-actions.compose', version: '1.0.0' }],
            consumes: []
        },
        commands: [
            'open-tool:behavior.runtime-behavior-actions',
            'focus-tool:behavior.runtime-behavior-actions'
        ],
        aliases: ['behavior-actions', 'runtime-actions', 'compose-behaviors'],
        tests: [
            'tests/runtimeBehaviorActionsController.test.ts',
            'tests/runtimeBehaviorActionsTool.test.ts'
        ]
    },
    {
        id: 'behavior.conversation-observation',
        title: 'Conversation Observation',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.conversation-observation',
        commands: ['open-tool:behavior.conversation-observation', 'focus-tool:behavior.conversation-observation'],
        aliases: ['conversation-history', 'conversation-observation', 'robot-conversation'],
        docs: ['docs/product/robot-connect-phase-1/conversation-observation-tool-discovery.md'],
        tests: [
            'tests/conversationObservationTool.test.ts',
            'tests/behaviorStudioConversationObservationController.test.ts'
        ]
    },
    {
        id: 'behavior.conversation-input',
        title: 'Conversation Input',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.conversation-input',
        commands: ['open-tool:behavior.conversation-input', 'focus-tool:behavior.conversation-input'],
        aliases: ['conversation-input', 'asr-input', 'text-stimulus'],
        docs: ['docs/product/robot-connect-phase-1/conversation-input-tool-discovery.md'],
        tests: ['tests/conversationInputTool.test.ts', 'tests/behaviorStudioConversationInputController.test.ts']
    },
    {
        id: 'behavior.interaction-trace',
        title: 'Interaction Trace',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.interaction-trace',
        commands: ['open-tool:behavior.interaction-trace', 'focus-tool:behavior.interaction-trace'],
        aliases: ['interaction-trace', 'llm-trace', 'tool-call-trace'],
        docs: ['docs/product/robot-connect-phase-1/interaction-trace-tool-discovery.md'],
        tests: ['tests/interactionTraceTool.test.ts', 'tests/behaviorStudioInteractionTraceProjection.test.ts']
    },
    {
        id: 'behavior.operator-media-capture',
        title: 'Operator Capture',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.operator-media-capture',
        capabilities: {
            provides: [{ id: 'behavior.operator-media.capture-control-surface', version: '1.0.0' }],
            consumes: []
        },
        commands: [
            'open-tool:behavior.operator-media-capture',
            'focus-tool:behavior.operator-media-capture'
        ],
        aliases: ['operator-camera', 'operator-media', 'webcam-capture'],
        docs: [
            'docs/product/operator-media-capture-phase-1.md',
            'docs/product/operator-media-capture-phase-2.md'
        ],
        tests: ['tests/operatorMediaCaptureAuthority.test.ts', 'tests/operatorMediaCaptureTool.test.ts']
    },
    {
        id: 'behavior.puppeteer',
        title: 'Puppeteer',
        owner: 'behavior-studio',
        classification: 'PRODUCT',
        instancePolicy: 'singleton',
        status: 'active',
        implementationBindingKey: 'behavior.puppeteer',
        capabilities: {
            provides: [
                { id: 'behavior.puppeteer.video-frame-observation-surface', version: '1.0.0' },
                { id: 'behavior.puppeteer.human-pose-observation-surface', version: '1.0.0' },
                { id: 'behavior.puppeteer.nao-desired-preview-surface', version: '1.0.0' }
            ],
            consumes: [
                {
                    id: 'behavior.operator-media.video-consumer-access',
                    versionRange: '^1.0.0',
                    mode: 'optional',
                    purpose: 'Observe local operator-camera frames without owning capture.'
                }
            ]
        },
        commands: ['open-tool:behavior.puppeteer', 'focus-tool:behavior.puppeteer'],
        aliases: ['puppeteer', 'motion-input'],
        docs: [
            'docs/product/PUPPETEER_ROBOT_CONNECT_BOUNDARY.md',
            'docs/integrations/qumarion-replay.md',
            'docs/product/operator-media-capture-phase-3.md',
            'docs/product/operator-media-capture-phase-4.md',
            'docs/product/operator-media-capture-phase-5.md'
        ],
        tests: [
            'tests/puppeteerProjection.test.ts',
            'tests/puppeteerTool.test.ts',
            'tests/operatorVideoObservationController.test.ts',
            'tests/operatorPoseNetworkBoundary.test.ts',
            'tests/operatorHumanPoseRetargeting.test.ts',
            'scripts/probe-operator-pose-browser.mjs'
        ]
    }
];
export const behaviorStudioToolCatalog = projectBehaviorStudioToolCatalog(behaviorStudioToolDefinitions);
export function listBehaviorStudioToolCatalogEntries() {
    return behaviorStudioToolCatalog.map(cloneToolCatalogEntry);
}
export function getBehaviorStudioToolCatalogEntry(id) {
    const normalizedId = id.trim();
    const entry = behaviorStudioToolCatalog.find((candidate) => candidate.id === normalizedId);
    return entry ? cloneToolCatalogEntry(entry) : null;
}
export function getBehaviorStudioToolCatalogEntryByAlias(alias) {
    const normalizedAlias = alias.trim();
    const entry = behaviorStudioToolCatalog.find((candidate) => candidate.aliases?.some((candidateAlias) => candidateAlias === normalizedAlias));
    return entry ? cloneToolCatalogEntry(entry) : null;
}
export function getBehaviorStudioToolsForProfile(profileId) {
    return resolveBehaviorStudioToolCatalogView('profile', profileId);
}
export function getBehaviorStudioToolsForPreset(presetId, profileId) {
    const entries = resolveBehaviorStudioToolCatalogView('preset', presetId);
    return profileId ? entries.filter((entry) => entry.profiles.includes(profileId)) : entries;
}
export function getBehaviorStudioProductTools() {
    return behaviorStudioToolCatalog
        .filter((entry) => entry.classification === 'PRODUCT')
        .map(cloneToolCatalogEntry);
}
export function validateBehaviorStudioToolCatalog(entries = behaviorStudioToolCatalog) {
    const diagnostics = [];
    const ids = new Set();
    const aliases = new Set();
    for (const [index, entry] of entries.entries()) {
        const path = `tools[${index}:${entry.id || '<missing>'}]`;
        if (!entry.id.trim()) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-id-missing', 'Tool id is required.', `${path}.id`));
        }
        else if (ids.has(entry.id)) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-id-duplicate', `Duplicate tool id "${entry.id}".`, path));
        }
        else {
            ids.add(entry.id);
        }
        if (!entry.owner.trim()) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-owner-missing', 'Tool owner is required.', `${path}.owner`));
        }
        if (!entry.status.trim()) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-status-missing', 'Tool status is required.', `${path}.status`));
        }
        if (entry.classification === 'UNKNOWN') {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-classification-unknown', 'Catalog entries must not remain UNKNOWN.', `${path}.classification`));
        }
        if (!entry.implementationBindingKey.trim()) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-binding-missing', 'Implementation binding key is required.', `${path}.implementationBindingKey`));
        }
        if (entry.profiles.length === 0) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-profile-missing', 'At least one profile is required.', `${path}.profiles`));
        }
        for (const alias of entry.aliases ?? []) {
            if (aliases.has(alias)) {
                diagnostics.push(createCatalogDiagnostic('error', 'tool-alias-duplicate', `Duplicate tool alias "${alias}".`, `${path}.aliases`));
            }
            else {
                aliases.add(alias);
            }
        }
        if (entry.classification !== 'PRODUCT' && entry.profiles.includes('behavior')) {
            diagnostics.push(createCatalogDiagnostic('error', 'tool-product-profile-leak', 'Only PRODUCT tools may be visible in the production profile.', `${path}.profiles`));
        }
    }
    diagnostics.push(...validateBehaviorStudioToolCollectionManifest(behaviorStudioToolCollectionManifest, entries));
    return diagnostics;
}
function projectBehaviorStudioToolCatalog(definitions) {
    const profileMembership = resolveToolViewMembership(definitions, 'profile', behaviorStudioToolCollectionManifest.profiles.map((view) => view.id));
    const presetMembership = resolveToolViewMembership(definitions, 'preset', behaviorStudioToolCollectionManifest.presets.map((view) => view.id));
    return definitions.map((definition) => ({
        ...definition,
        profiles: (profileMembership.get(definition.id) ?? []),
        presets: (presetMembership.get(definition.id) ?? [])
    }));
}
function resolveToolViewMembership(definitions, kind, viewIds) {
    const knownToolIds = new Set(definitions.map((definition) => definition.id));
    const membership = new Map(definitions.map((definition) => [definition.id, []]));
    for (const viewId of viewIds) {
        for (const toolId of resolveBehaviorStudioToolCollectionViewToolIds(behaviorStudioToolCollectionManifest, kind, viewId)) {
            if (knownToolIds.has(toolId))
                membership.get(toolId)?.push(viewId);
        }
    }
    return membership;
}
function resolveBehaviorStudioToolCatalogView(kind, viewId) {
    const entriesById = new Map(behaviorStudioToolCatalog.map((entry) => [entry.id, entry]));
    return resolveBehaviorStudioToolCollectionViewToolIds(behaviorStudioToolCollectionManifest, kind, viewId).flatMap((toolId) => {
        const entry = entriesById.get(toolId);
        return entry ? [cloneToolCatalogEntry(entry)] : [];
    });
}
function cloneToolCatalogEntry(entry) {
    return {
        ...entry,
        profiles: [...entry.profiles],
        presets: [...entry.presets],
        capabilities: entry.capabilities
            ? {
                provides: entry.capabilities.provides?.map((capability) => ({ ...capability })) ?? [],
                consumes: entry.capabilities.consumes?.map((requirement) => ({ ...requirement })) ?? []
            }
            : undefined,
        commands: entry.commands ? [...entry.commands] : undefined,
        widgets: entry.widgets ? [...entry.widgets] : undefined,
        surfaces: entry.surfaces ? [...entry.surfaces] : undefined,
        aliases: entry.aliases ? [...entry.aliases] : undefined,
        docs: entry.docs ? [...entry.docs] : undefined,
        tests: entry.tests ? [...entry.tests] : undefined
    };
}
function createCatalogDiagnostic(severity, code, message, path) {
    return { severity, code, message, path };
}
