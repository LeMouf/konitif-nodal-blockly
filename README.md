# @konitif/nodal-blockly

A portable Blockly editing surface over KONITIF Nodal definitions and canonical Workflow Compositions. The package is distributed publicly on npm under the PolyForm Noncommercial License 1.0.0.

The package exposes a Tool declaration, a host-scoped contribution catalog, a semantic projection adapter, a disposable session and a DOM surface. It imports no application store, domain-specific dialect, runtime or framework component. `blockly@12.1.0` is owned by this package and loaded only when its surface mounts. It does not load any JavaScript generator or evaluate generated source code.

## Host the surface

```ts
import { BlocklyContributionCatalog } from '@konitif/nodal-blockly';
import { mountNodalBlocklySurface } from '@konitif/nodal-blockly/surface';

const catalog = new BlocklyContributionCatalog(); // Empty. No demonstration blocks are installed.
const surface = mountNodalBlocklySurface(element, { host, catalog });
await surface.ready;

surface.deactivate(); // Releases the workspace, definitions and subscriptions.
surface.activate();   // Re-reads the current canonical subject.
surface.dispose();    // Terminal, idempotent; safe before ready resolves.
catalog.dispose();   // Only the owner of this catalog disposes it.
```

The explicit host supplies `read`, `subscribe` and `commit`. It resolves the existing Nodal dialect and owns persistence and admission. A snapshot revision must change on every canonical update relevant to editing. `commit` must compare the base revision and subject identity, validate, then publish atomically; rejection must preserve the current canonical workflow and unrelated host artifact fields.

The optional `runtime` port declares availability and delegates a run request to a common runtime. It is not required for editing. Without an admitted runtime provider, Run is disabled. Hosting the editor does not grant permission to operate external devices.

A provider may expose `observe`/`subscribe` for execution state, the active
canonical module ID, progress and errors, and `requestStop` for cancellation.
The surface highlights that occurrence and renders Run/Stop/progress without
owning execution or a clock. Per-block progress is projected top-to-bottom in
a narrow gutter to the left of each instruction, matching statement-stack time
without covering fields or changing Blockly geometry. Optional host `commands` expose explicit commands
such as creating a program; mounting never creates or replaces a workflow.

## Supply a projection contribution

```ts
const release = catalog.register('my-host-package', [{
  id: 'my.number.block', dialectId: 'my.dialect', nodeType: 'my:number',
  label: 'Number',
  fields: [{ configKey: 'value', label: 'Value', editor: 'number' }]
}]);
// The matching definition, ports and defaultConfig come from host.read().dialect.
release(); // Removes this lease only; existing workflows remain untouched.
```

Registration does not create a module occurrence. A placed block receives its own stable module ID and independent configuration. A contribution cannot change another occurrence's definition or invent a field missing from the shared schema. Catalog snapshots are copied, duplicate owners/projection IDs/node bindings are refused, and revoking an old lease cannot remove a later registration.

## Supported editing projections

- Native statement stacks and readable containers, explicitly bound to shared
  input/output port IDs by `contribution.statement`. `previous`/`next` map the
  predecessor relationship; each container maps its shared input to the tail
  output of its contained stack. Reordering changes canonical connections, not
  occurrence identities. Parameter values use genuine Blockly value sockets;
  a text field may expose host-supplied dropdown choices. Presentation checks
  assist snapping but never replace shared graph validation. Fan-out and
  incompatible native statement structures are refused rather than duplicated.
- Value-port trees with zero or one output per node, typed single-input connections and primitive configuration fields.
- Mixed dialects combine native value sockets with explicit port-reference menus. A single-use source with one value output and value-only ports nests into a value input; shared sources remain one occurrence addressed by reference. Control/event inputs and multiple outputs stay explicit references, never an inferred Blockly statement order. Simple value dialects retain native trees; structured dialects without eligible value outputs retain reference cards.
- Creation, field editing, connections and deletion, through common Nodal validation and `commitWorkflowComposition`, followed by host admission.
- Stable workflow, composition, module and existing connection identities. Existing opaque metadata and canonical ordering are preserved.
- Blockly coordinates and viewport are local to the projection. Moving a block does not update canonical state. The first version does not persist that layout after closing the surface.
- Unknown projections, schema drift, disabled/locked nodes, cycles and composite references are reported as non-editable. Tree mode also refuses shared children; reference cards permit fan-out. Multiple incoming connections to one input and multiplicity contracts remain unsupported. Canonical data is retained; no silent partial rewrite occurs.

This is an editing projection, not a runtime implementation. Control/event definitions must already exist in the host's shared dialect; this package does not install executors, infer scheduling or evaluate source code. The `BlocklyCompositeReference` extension records a definition revision, parameters, results, completion/error ports and the intended shared-definition/local-variant distinction. Composite editing is still explicitly refused. Hierarchical composition does not imply recursive runtime execution.

`BlocklyBlockReading.inputs` accepts a legacy tree child ID, `null`, or an explicit `{ moduleId, portId }` output reference. `BlocklyProjection.layout` reports `tree`, `references` or `mixed`. Native connections in mixed mode read the same exact endpoint references as menus. Choosing a reference replaces an attached value; attaching a value clears the reference. Compatibility is decided by shared validation, including dialect-specific wildcard inputs; an incompatible gesture is restored from the host. These are disposable projection readings, not a second persisted workflow format. Edits clone and patch the canonical artifact, validate the complete graph and composition, and submit through the same host admission contract. Existing connections keep their IDs and opaque metadata; removing a source card disconnects its references. Primitive fields are editable; unexposed object/null-valued configuration is preserved.

## Theme the surface

The host may supply inherited CSS variables `--konitif-blockly-canvas`,
`--konitif-blockly-surface`, `--konitif-blockly-ink`, `--konitif-blockly-muted`,
`--konitif-blockly-border` and `--konitif-blockly-accent`. The workspace theme,
flyout and surface chrome read these per-instance variables. Changing them
does not recreate the workspace, register semantic definitions or commit a
workflow revision. Without host variables, the portable light defaults apply.

The paint-only Zelos specialization preserves native sockets, stacks and
container geometry. Each block receives a non-interactive SVG depth path and
a restrained gradient sheen; two shared gradient definitions are leased per
workspace and released with its renderer. No blur, backdrop filter, frame loop
or semantic observer is added. Base fills are slightly shaded to preserve
white-label contrast. Vendor disabled patterns, shadow blocks, insertion
markers, selection and execution highlighting retain their own meaning.

Hosts may also supply `--konitif-blockly-block-border`,
`--konitif-blockly-field-border`, `--konitif-blockly-depth` and
`--konitif-blockly-sheen` (default `0.08`). Prefer a small sheen strength to keep
labels readable. Forced-colour mode hides decorative paths and restores
system-colour outlines. Theme updates do not recreate block identities.

## Lifecycle and isolation

Importing the package declares no workspace, subscription or registered block. Each mount installs uniquely namespaced block definitions; disposal removes only those names. Blockly's shared message table receives missing English defaults via a reference-counted mount lease; existing host translations win, and only still-owned additions are removed after the last release. Per-instance workspaces, resize observers, DOM handlers and subscriptions are released. Deactivation and reactivation are supported, and removal does not dispose a catalog owned by another host.

## Verification

Use Node 22 or newer:

```sh
npm ci --ignore-scripts
npm run build
npm test
```

The tests exercise the real Blockly renderer/workspaces in jsdom, including genuine block creation and field changes. SVG layout and canvas text measurement are stubbed because jsdom has no layout engine. They do not establish browser rendering quality or complete Behavior Studio integration. Reference definitions and executors exist only in test fixtures and are never installed into the shipped catalog.

## Distribution

The release authority is the standalone
[`LeMouf/konitif-nodal-blockly`](https://github.com/LeMouf/konitif-nodal-blockly)
repository. A merge does not publish the package. Releases require a reviewed
archive, a matching protected version tag and the repository's protected npm
publication workflow.
