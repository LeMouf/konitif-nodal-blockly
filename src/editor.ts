import type * as Blockly from 'blockly/core';
import type { BlocklyEditorPort, BlocklyBlockReading, BlocklyNodeContribution, BlocklyWorkflowSnapshot, BlocklyProjection } from './contracts.js';
import { acquireBlocklyMessages } from './messages.js';
import { canUseBlocklyValueOutput, getBlocklyReferenceChoices } from './projection.js';
import { createBlocklyViewportResizeController } from './viewport.js';
import { createBlocklyPlaybackPresentation } from './playback.js';

/** Paint-only Zelos specialization. The vendor retains all geometry, hit
 * testing and connections. No observers, frame loops, filters or semantic events. */
function leaseBlocklyGlassRenderer(api: typeof Blockly, namespace: string) {
  const name = `${namespace}glass`;
  const sheenId = `${namespace}sheen`, edgeId = `${namespace}edge`;
  let definitions: SVGElement | null = null;
  let disposed = false;
  class GlassPath extends api.zelos.PathObject {
    private readonly shadow: SVGElement;
    private readonly sheen: SVGElement;
    private readonly warning: SVGElement;
    constructor(root: SVGElement, style: Blockly.Theme.BlockStyle, constants: Blockly.zelos.ConstantProvider) {
      super(root, style, constants);
      this.shadow = api.utils.dom.createSvgElement(api.utils.Svg.PATH, {
        class: 'konitifBlocklyDepth', 'aria-hidden': 'true', 'pointer-events': 'none',
        fill: 'var(--konitif-blockly-depth, #0005)', transform: 'translate(0, 2)'
      });
      root.insertBefore(this.shadow, this.svgPath);
      this.sheen = api.utils.dom.createSvgElement(api.utils.Svg.PATH, {
        class: 'konitifBlocklySheen', 'aria-hidden': 'true', 'pointer-events': 'none',
        fill: `url(#${sheenId})`, stroke: `url(#${edgeId})`, 'stroke-width': 1.15,
        'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round'
      });
      this.svgPath.after(this.sheen);
      this.warning = api.utils.dom.createSvgElement(api.utils.Svg.PATH, {
        class: 'konitifBlocklyWarning', display: 'none', 'aria-hidden': 'true', 'pointer-events': 'none',
        fill: `url(#${namespace}warning)`
      });
      this.sheen.after(this.warning);
    }
    override setPath(path: string): void {
      super.setPath(path);
      this.shadow.setAttribute('d', path); this.sheen.setAttribute('d', path);
      this.warning.setAttribute('d', path);
    }
    override flipRTL(): void {
      super.flipRTL();
      this.sheen.setAttribute('transform', 'scale(-1 1)');
      this.warning.setAttribute('transform', 'scale(-1 1)');
      this.shadow.setAttribute('transform', 'translate(0, 2) scale(-1 1)');
    }
    override applyColour(block: Blockly.BlockSvg): void {
      super.applyColour(block);
      // Reserve contrast for the white labels before adding a restrained sheen.
      // Keep vendor shadow, disabled-pattern and insertion-marker paint intact.
      if (!block.isShadow() && block.isEnabled() && !block.isInsertionMarker()) {
        const primary = api.utils.colour.parse(this.style.colourPrimary);
        const shaded = primary && api.utils.colour.blend('#000000', primary, .55);
        if (shaded) this.svgPath.setAttribute('fill', shaded);
        if (primary) block.getSvgRoot().style.setProperty('--konitif-blockly-concept-accent', primary);
      }
    }
    override updateInsertionMarker(enabled: boolean): void {
      super.updateInsertionMarker(enabled);
      this.shadow.style.display = this.sheen.style.display = enabled ? 'none' : '';
    }
  }
  class GlassRenderer extends api.zelos.Renderer {
    override makePathObject(root: SVGElement, style: Blockly.Theme.BlockStyle): Blockly.zelos.PathObject {
      return new GlassPath(root, style, this.getConstants());
    }
  }
  api.blockRendering.register(name, GlassRenderer);
  return {
    name,
    attach(svg: SVGElement): void {
      if (disposed || definitions) return;
      const doc = svg.ownerDocument, ns = 'http://www.w3.org/2000/svg';
      definitions = doc.createElementNS(ns, 'defs');
      definitions.setAttribute('data-konitif-blockly-paint', name);
      for (const [id, stops] of [
        [sheenId, [['0%', '#fff', 'var(--konitif-blockly-sheen, .08)'], ['32%', '#fff', '0.015'], ['62%', '#000', '0.04'], ['100%', '#000', '.2']]],
        [edgeId, [['0%', '#fff', '.48'], ['42%', '#fff', '.16'], ['100%', '#000', '.4']]]
      ] as const) {
        const gradient = doc.createElementNS(ns, 'linearGradient'); gradient.id = id;
        gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '0');
        gradient.setAttribute('x2', '0'); gradient.setAttribute('y2', '1');
        for (const [offset, color, opacity] of stops) {
          const stop = doc.createElementNS(ns, 'stop'); stop.setAttribute('offset', offset);
          stop.style.stopColor = color; stop.style.stopOpacity = opacity; gradient.append(stop);
        }
        definitions.append(gradient);
      }
      svg.prepend(definitions);
      const pattern = doc.createElementNS(ns, 'pattern');
      pattern.id = `${namespace}warning`;
      pattern.setAttribute('width', '12'); pattern.setAttribute('height', '12');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse'); pattern.setAttribute('patternTransform', 'rotate(45)');
      const stripe = doc.createElementNS(ns, 'rect');
      stripe.setAttribute('width', '5'); stripe.setAttribute('height', '12');
      stripe.setAttribute('fill', 'var(--konitif-blockly-warning, #fbbf24)'); stripe.setAttribute('fill-opacity', '.2');
      pattern.append(stripe); definitions.append(pattern);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true; definitions?.remove(); definitions = null;
      api.blockRendering.unregister(name);
    }
  };
}

type Blockly12VariableReadLease = { count: number; descriptor: PropertyDescriptor };
const blockly12VariableReadLeases = new WeakMap<object, Blockly12VariableReadLease>();

/**
 * Blockly 12 still routes some of its own inject, serialization and flyout
 * paths through deprecated Workspace#getAllVariables. Lease a compatibility
 * bridge only while a KONITIF editor is mounted, then restore Blockly's exact
 * prototype. Blockly 13 has no legacy descriptor and therefore needs no shim.
 */
function leaseBlockly12VariableReads(api: typeof Blockly): () => void {
  const prototype = api.Workspace.prototype as Blockly.Workspace & {
    getAllVariables?: () => Blockly.VariableModel[];
  };
  let lease = blockly12VariableReadLeases.get(prototype);
  if (!lease) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getAllVariables');
    if (!descriptor || typeof descriptor.value !== 'function') return () => undefined;
    lease = { count: 0, descriptor };
    blockly12VariableReadLeases.set(prototype, lease);
    Object.defineProperty(prototype, 'getAllVariables', {
      ...descriptor,
      value(this: Blockly.Workspace) {
        return this.getVariableMap().getAllVariables();
      }
    });
  }
  lease.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lease!.count -= 1;
    if (lease!.count > 0) return;
    Object.defineProperty(prototype, 'getAllVariables', lease!.descriptor);
    blockly12VariableReadLeases.delete(prototype);
  };
}

/** Vendor adapter. All registered Blockly types are namespaced to this mount and released on disposal. */
export function createBlocklyEditor(api: typeof Blockly, element: HTMLElement, messages: Record<string,string> = {}): BlocklyEditorPort {
  const namespace = `konitif_${crypto.randomUUID().replaceAll('-', '')}_`;
  const releaseMessages = acquireBlocklyMessages(api,messages);
  const renderer = leaseBlocklyGlassRenderer(api, namespace);
  const releaseVariableReads = leaseBlockly12VariableReads(api);
  class SearchableFieldDropdown extends api.FieldDropdown {
    constructor(options: [string, string][], private readonly searchPlaceholder: string) {
      super(options);
    }
    protected override showEditor_(event?: MouseEvent): void {
      super.showEditor_(event);
      const content = api.DropDownDiv.getContentDiv();
      const menu = content.querySelector<HTMLElement>('.blocklyMenu');
      if (!menu) return;
      const options = this.getOptions(false);
      const items = [...menu.querySelectorAll<HTMLElement>('.blocklyMenuItem')];
      const search = document.createElement('input');
      search.type = 'search';
      search.autocomplete = 'off';
      search.placeholder = this.searchPlaceholder;
      search.setAttribute('aria-label', this.searchPlaceholder);
      search.className = 'konitifBlocklySearchableDropdownInput';
      Object.assign(search.style, {
        boxSizing: 'border-box', width: '100%', height: '30px', marginBottom: '5px', padding: '0 9px',
        border: '1px solid var(--konitif-blockly-field-border, #8ba0b8)', borderRadius: '5px',
        outline: 'none', color: 'var(--konitif-blockly-ink, #eef5fb)',
        background: 'var(--konitif-blockly-canvas, #07111d)'
      });
      const empty = document.createElement('p');
      empty.className = 'konitifBlocklySearchableDropdownEmpty';
      empty.textContent = 'No matching option';
      empty.hidden = true;
      Object.assign(empty.style, {
        margin: '7px 5px 3px', color: 'var(--konitif-blockly-muted, #8fa6b8)', fontSize: '12px'
      });
      content.prepend(search);
      content.append(empty);
      content.style.height = 'auto';
      content.style.minWidth = 'min(320px, calc(100vw - 24px))';
      menu.style.boxSizing = 'border-box';
      menu.style.maxHeight = '270px';
      menu.style.overflowY = 'auto';
      menu.style.overscrollBehavior = 'contain';
      const filter = (): void => {
        const query = search.value.trim().toLocaleLowerCase();
        let visible = 0;
        items.forEach((item, index) => {
          const option = options[index];
          const label = typeof option?.[0] === 'string' ? option[0] : '';
          const value = option?.[1] ?? '';
          const matches = !query || `${label}\n${value}`.toLocaleLowerCase().includes(query);
          item.hidden = !matches;
          item.setAttribute('aria-hidden', matches ? 'false' : 'true');
          if (matches) visible += 1;
        });
        empty.hidden = visible > 0;
      };
      search.addEventListener('input', filter);
      search.addEventListener('pointerdown', pointerEvent => pointerEvent.stopPropagation());
      search.addEventListener('keydown', keyboardEvent => {
        keyboardEvent.stopPropagation();
        if (keyboardEvent.key !== 'Escape') return;
        keyboardEvent.preventDefault();
        api.DropDownDiv.hideIfOwner(this);
      });
      queueMicrotask(() => search.focus());
    }
  }
  // Blockly parses these two component colours during gestures/highlighting;
  // unlike background styles, they cannot receive a raw CSS variable.
  const accent = () => api.utils.colour.parse(getComputedStyle(element).getPropertyValue('--konitif-blockly-accent').trim()) ?? '#4979a8';
  // Host-scoped variables react to theme changes without recreating the semantic workspace.
  const theme = new api.Theme(namespace, {}, {}, {
    workspaceBackgroundColour: 'var(--konitif-blockly-canvas, #f8fafc)',
    toolboxBackgroundColour: 'var(--konitif-blockly-surface, #eef2f6)',
    toolboxForegroundColour: 'var(--konitif-blockly-ink, #213044)',
    flyoutBackgroundColour: 'var(--konitif-blockly-surface, #eef2f6)',
    flyoutForegroundColour: 'var(--konitif-blockly-ink, #213044)',
    flyoutOpacity: 1,
    scrollbarColour: 'var(--konitif-blockly-muted, #60758c)',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: accent(),
    selectedGlowColour: accent()
  });
  let workspace: Blockly.WorkspaceSvg;
  try { workspace = api.inject(element, {
    toolbox: { kind: 'flyoutToolbox', contents: [] }, theme,
    trashcan: true, sounds: false, collapse: false, comments: false, disable: false,
    zoom: { controls: true, wheel: true, startScale: 0.9 },
    move: { scrollbars: true, drag: true, wheel: true }, renderer: renderer.name,
    // Leave enough room between a statement label (for example "Clips") and
    // the nested stack, including its external playback rail.
    rendererOverrides: { STATEMENT_INPUT_PADDING_LEFT: 28 }
  }); renderer.attach(workspace.getParentSvg()); } catch(error) { releaseVariableReads(); renderer.dispose(); releaseMessages(); throw error; }
  let disposed = false, rendering = false, editable = false;
  const viewportResize = createBlocklyViewportResizeController(workspace, () => api.svgResize(workspace));
  const listeners = new Set<() => void>();
  const definitions = new Map<string, { contribution: BlocklyNodeContribution; fields: Map<string, string>; inputs: Map<string, string>;
    valueInputs: Set<string>; outputPortId?: string }>();
  const occurrences = new Map<string, string>();
  let pending = false;
  let renderGeneration = 0;
  let expectedReading = '';
  let renderedSubject = '';
  let contributionSignature = '';
  let referenceLayout = false;
  let highlightedModule: string | null = null;
  const playbackPresentation = createBlocklyPlaybackPresentation(workspace);

  const blockOccurrence = (block: Blockly.Block): string => {
    let id = occurrences.get(block.id);
    if (!id) { id = `blockly.module:${crypto.randomUUID()}`; occurrences.set(block.id, id); }
    return id;
  };
  function read(): BlocklyBlockReading[] {
    return workspace.getAllBlocks(false).filter(b => !b.isInsertionMarker() && definitions.has(b.type)).map(block => {
      const entry = definitions.get(block.type)!;
      const fields: BlocklyBlockReading['fields'] = {};
      for (const field of entry.contribution.fields ?? []) {
        const raw = block.getFieldValue(entry.fields.get(field.configKey)!);
        fields[field.configKey] = field.editor === 'boolean' ? raw === 'TRUE' : field.editor === 'number' ? Number(raw) : String(raw);
      }
      return { id: blockOccurrence(block), contributionId: entry.contribution.id, fields,
        inputs: Object.fromEntries([...entry.inputs].map(([key, name]) => {
          const statement = entry.contribution.statement;
          if (statement?.previous === key) {
            const previous = block.getPreviousBlock();
            const predecessor = previous?.getNextBlock() === block ? previous : null;
            return [key, predecessor ? { moduleId: blockOccurrence(predecessor), portId: definitions.get(predecessor.type)!.contribution.statement!.next! } : null];
          }
          if (statement?.containers?.some(c => c.portId === key)) {
            let tail = block.getInputTargetBlock(name);
            while (tail?.getNextBlock()) tail = tail.getNextBlock();
            return [key, tail ? { moduleId: blockOccurrence(tail), portId: definitions.get(tail.type)!.contribution.statement!.next! } : null];
          }
          if (referenceLayout) {
            const child = entry.valueInputs.has(name) ? block.getInputTargetBlock(name) : null;
            if (child) return [key, { moduleId: blockOccurrence(child), portId: definitions.get(child.type)!.outputPortId! }];
            const raw = block.getFieldValue(name);
            return [key, raw ? JSON.parse(String(raw)) : null];
          }
          const child = block.getInputTargetBlock(name);
          return [key, child ? blockOccurrence(child) : null];
        })) };
    });
  }
  const fingerprint = () => JSON.stringify(read().sort((a,b) => a.id.localeCompare(b.id)));
  const selectionListeners = new Set<(moduleId: string | null) => void>();
  function onChange(event: Blockly.Events.Abstract) {
    if (disposed) return;
    if (event.type === api.Events.VIEWPORT_CHANGE && event.workspaceId === workspace.id) {
      viewportResize.cameraChanged(); return;
    }
    if (rendering || !editable) return;
    if (event.type === api.Events.SELECTED && event.workspaceId === workspace.id) {
      const id = (event as Blockly.Events.Selected).newElementId;
      const block = id ? workspace.getBlockById(id) : null;
      if (id && (!block || block.isInsertionMarker() || !definitions.has(block.type))) return;
      const moduleId = block ? blockOccurrence(block) : null;
      for (const listener of selectionListeners) listener(moduleId);
      return;
    }
    if (event.isUiEvent || workspace.isDragging()) return;
    // Selecting a reference explicitly replaces an attached value, not a second connection.
    const change = event as Blockly.Events.BlockChange;
    if (referenceLayout && change.element === 'field' && change.blockId && change.name) {
      const block = workspace.getBlockById(change.blockId);
      const entry = block && definitions.get(block.type);
      if (block && entry?.valueInputs.has(change.name) && block.getFieldValue(change.name)) {
        const connection = block.getInput(change.name)?.connection;
        if (connection?.targetConnection) connection.disconnect();
      }
    }
    if (pending) return;
    pending = true;
    const generation = renderGeneration;
    // Blockly may dispatch a create/connect gesture as several events; observe the settled workspace.
    queueMicrotask(() => {
      pending = false;
      if (disposed || rendering || generation !== renderGeneration || !editable || workspace.isDragging()) return;
      if (referenceLayout) {
        const blocks = workspace.getAllBlocks(false).filter(b => !b.isInsertionMarker() && definitions.has(b.type));
        const ids = new Set(blocks.map(blockOccurrence));
        // Deleting a source occurrence disconnects only its incoming references.
        for (const block of blocks) for (const name of definitions.get(block.type)!.inputs.values()) {
          const entry = definitions.get(block.type)!;
          const port = [...entry.inputs].find(([, n]) => n === name)![0];
          if (entry.contribution.statement?.previous === port || entry.contribution.statement?.containers?.some(c => c.portId === port)) continue;
          if (definitions.get(block.type)!.valueInputs.has(name) && block.getInputTargetBlock(name)) {
            if (block.getFieldValue(name)) block.setFieldValue('', name);
            continue;
          }
          const raw = block.getFieldValue(name);
          if (raw && !ids.has(JSON.parse(String(raw)).moduleId)) block.setFieldValue('', name);
        }
      }
      const next = fingerprint();
      if (next === expectedReading) return; // Includes position-only moves and delayed render events.
      expectedReading = next;
      for (const listener of [...listeners]) listener();
    });
  }
  workspace.addChangeListener(onChange);
  const releaseDefinitions = () => {
    for (const key of definitions.keys()) delete api.Blocks[key];
    definitions.clear();
  };
  function render(projection: BlocklyProjection, contributions: readonly BlocklyNodeContribution[], snapshot: BlocklyWorkflowSnapshot | null) {
    if (disposed) return;
    const schema = snapshot?.dialect.nodeRegistry.map(({ type, title, description, inputs, outputs, defaultConfig }) =>
      ({ type, title, description, inputs, outputs, defaultConfig }));
    const nextContributions = JSON.stringify([projection.layout ?? 'tree', contributions, schema]);
    const nextReading = JSON.stringify([...projection.blocks].sort((a,b) => a.id.localeCompare(b.id)));
    // An admitted field edit already exists in this workspace. Keep its editor/focus;
    // other surfaces and rejected/divergent proposals still take the normal refresh path.
    if (snapshot && editable && projection.editable && renderedSubject === snapshot.workflow.id &&
        contributionSignature === nextContributions && fingerprint() === nextReading) {
      expectedReading = nextReading;
      return;
    }
    const sameSubject = renderedSubject === snapshot?.workflow.id;
    if (!sameSubject) viewportResize.reset();
    renderedSubject = snapshot?.workflow.id ?? '';
    contributionSignature = nextContributions;
    rendering = true; renderGeneration++;
    const positions = new Map(sameSubject ? workspace.getAllBlocks(false).map(block => [blockOccurrence(block), block.getRelativeToSurfaceXY()] as const) : []);
    try {
      highlightedModule=null;
      playbackPresentation.reset();
      workspace.clear(); occurrences.clear(); releaseDefinitions(); editable = projection.editable && snapshot !== null;
      referenceLayout = projection.layout === 'references' || projection.layout === 'mixed';
      const mixedLayout = projection.layout === 'mixed';
      const toolbox: { kind: string; type: string }[] = [];
      if (snapshot) for (const [index, contribution] of contributions.entries()) {
        if (contribution.dialectId !== snapshot.dialect.id || contribution.composite) continue;
        const definition = snapshot.dialect.nodeRegistry.find(d => d.type === contribution.nodeType);
        if (!definition || (!referenceLayout && (definition.outputs.length > 1 || [...definition.inputs, ...definition.outputs].some(p => p.mode !== 'value')))) continue;
        const key = `${namespace}${index}`;
        const fields = new Map((contribution.fields ?? []).map((field, i) => [field.configKey, `field_${i}`]));
        const inputs = new Map(definition.inputs.map((port, i) => [port.id, `input_${i}`]));
        const statement = contribution.statement;
        const valueInputs = new Set(mixedLayout ? definition.inputs.filter(p => p.mode === 'value' && p.id !== statement?.previous && !statement?.containers?.some(c => c.portId === p.id)).map(p => inputs.get(p.id)!) : []);
        const outputPortId = mixedLayout && !statement && canUseBlocklyValueOutput(definition) ? definition.outputs[0].id : undefined;
        definitions.set(key, { contribution, fields, inputs, valueInputs, outputPortId });
        api.Blocks[key] = { init(this: Blockly.Block) {
          this.appendDummyInput().appendField(contribution.label ?? definition.title);
          if (statement?.previous) this.setPreviousStatement(true, statement.check);
          if (statement?.next) this.setNextStatement(true, statement.check);
          const compactPalette = referenceLayout && this.workspace.isFlyout;
          if (compactPalette && outputPortId) this.setOutput(true, definition.outputs[0].dataType);
          for (const field of compactPalette ? [] : contribution.fields ?? []) {
            const value = definition.defaultConfig[field.configKey];
            const editor = field.editor === 'number' ? new api.FieldNumber(Number(value ?? 0))
              : field.editor === 'boolean' ? new api.FieldCheckbox(value ? 'TRUE' : 'FALSE')
              : field.options?.length
                ? field.searchable
                  ? new SearchableFieldDropdown(field.options.map(o => [o.label, o.value]), field.searchPlaceholder ?? 'Search…')
                  : new api.FieldDropdown(field.options.map(o => [o.label,o.value]))
                : new api.FieldTextInput(String(value ?? ''));
            if(editor instanceof api.FieldDropdown)editor.maxDisplayLength=32;
            this.appendDummyInput().appendField(field.label).appendField(editor, fields.get(field.configKey)!);
          }
          if (referenceLayout && !compactPalette) {
            for (const port of definition.inputs) {
              if (statement?.previous === port.id) continue;
              const container = statement?.containers?.find(c => c.portId === port.id);
              if (container) { this.appendStatementInput(inputs.get(port.id)!).appendField(container.label).setCheck(container.check ?? statement?.check ?? null); continue; }
              if (statement) { this.appendValueInput(inputs.get(port.id)!).appendField(port.label).setCheck(port.dataType); continue; }
              const target = this;
              const dropdown = new api.FieldDropdown(() => {
                const readings = workspace.getAllBlocks(false).filter(b => !b.isInsertionMarker() && definitions.has(b.type)).map(b => ({
                  id: blockOccurrence(b), contributionId: definitions.get(b.type)!.contribution.id
                }));
                const choices = getBlocklyReferenceChoices(snapshot, contributions, readings, blockOccurrence(target), port.id);
                return [['—', ''], ...choices.map(choice => [choice.label, JSON.stringify(choice.reference)])] as [string, string][];
              });
              dropdown.maxDisplayLength = 26;
              const name = inputs.get(port.id)!;
              // Canonical compatibility (including dialect wildcards) is validated by the host.
              const input = valueInputs.has(name) ? this.appendValueInput(name) : this.appendDummyInput();
              input.appendField(`← ${port.label} (${port.mode}:${port.dataType})`).appendField(dropdown, name);
            }
            if (outputPortId) this.setOutput(true, definition.outputs[0].dataType);
            else if (!statement) for (const port of definition.outputs) this.appendDummyInput().appendField(`→ ${port.label} [${port.id}] (${port.mode}:${port.dataType})`);
          } else if (!compactPalette) {
            for (const port of definition.inputs) this.appendValueInput(inputs.get(port.id)!).appendField(port.label).setCheck(port.dataType);
            if (definition.outputs[0]) this.setOutput(true, definition.outputs[0].dataType);
          }
          this.setColour(contribution.colour ?? '#4979a8');
          this.setTooltip(definition.description);
        } };
        if (editable) toolbox.push({ kind: 'block', type: key });
      }
      workspace.updateToolbox({ kind: 'flyoutToolbox', contents: toolbox });
      if (editable) {
        const blocks = new Map<string, Blockly.BlockSvg>();
        const sourceUses = new Map<string, number>();
        for (const reading of projection.blocks) for (const ref of Object.values(reading.inputs)) {
          if (ref) { const id = typeof ref === 'string' ? ref : ref.moduleId; sourceUses.set(id, (sourceUses.get(id) ?? 0) + 1); }
        }
        let nextY = 40;
        for (const [index, reading] of projection.blocks.entries()) {
          const key = [...definitions].find(([, entry]) => entry.contribution.id === reading.contributionId)?.[0];
          if (!key) throw new Error('missing-render-definition');
          const block = workspace.newBlock(key, reading.id);
          occurrences.set(block.id, reading.id);
          const entry = definitions.get(key)!;
          for (const [name, value] of Object.entries(reading.fields)) block.setFieldValue(typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value), entry.fields.get(name)!);
          block.initSvg(); block.render();
          const position = positions.get(reading.id) ?? (referenceLayout ? { x: 40, y: nextY }
            : { x: 40 + (index % 3) * 220, y: 40 + Math.floor(index / 3) * 180 });
          block.moveBy(position.x, position.y);
          nextY = Math.max(nextY, position.y + block.getHeightWidth().height + 32);
          blocks.set(reading.id, block);
        }
        // Dynamic options must see all occurrences, including sources created after their target.
        if (referenceLayout) for (const block of blocks.values()) {
          for (const name of definitions.get(block.type)!.inputs.values()) {
            const field = block.getField(name);
            if (field instanceof api.FieldDropdown) field.getOptions(false);
          }
        }
        for (const reading of projection.blocks) {
          const parent = blocks.get(reading.id)!;
          const entry = definitions.get(parent.type)!;
          for (const [port, childId] of Object.entries(reading.inputs)) {
            if (!childId) continue;
            const statement = entry.contribution.statement;
            if (statement && typeof childId !== 'string') {
              const source = blocks.get(childId.moduleId)!;
              if (port === statement.previous) {
                if (definitions.get(source.type)!.contribution.statement?.next !== childId.portId) throw new Error('statement-predecessor-not-representable');
                source.nextConnection!.connect(parent.previousConnection!);
                continue;
              }
              if (statement.containers?.some(c => c.portId === port)) {
                let head = source;
                const seen = new Set<string>();
                while (true) {
                  if (seen.has(head.id)) throw new Error('statement-cycle');
                  seen.add(head.id);
                  const headEntry = definitions.get(head.type)!;
                  const previous = projection.blocks.find(b => b.id === blockOccurrence(head))!.inputs[headEntry.contribution.statement!.previous!];
                  if (!previous || typeof previous === 'string') break;
                  head = blocks.get(previous.moduleId)!;
                }
                parent.getInput(entry.inputs.get(port)!)!.connection!.connect(head.previousConnection!);
                continue;
              }
              parent.getInput(entry.inputs.get(port)!)!.connection!.connect(source.outputConnection!);
              continue;
            }
            if (referenceLayout) {
              if (typeof childId !== 'string') {
                const child = blocks.get(childId.moduleId)!;
                const childEntry = definitions.get(child.type)!;
                if (entry.valueInputs.has(entry.inputs.get(port)!) && childEntry.outputPortId === childId.portId &&
                    sourceUses.get(childId.moduleId) === 1) {
                  parent.getInput(entry.inputs.get(port)!)!.connection!.connect(child.outputConnection!);
                  continue;
                }
              }
              parent.setFieldValue(JSON.stringify(childId), entry.inputs.get(port)!);
              continue;
            }
            if (typeof childId !== 'string') throw new Error('reference-in-tree-layout');
            parent.getInput(entry.inputs.get(port)!)!.connection!.connect(blocks.get(childId)!.outputConnection!);
          }
        }
        // Nesting expands value cards: arrange new roots only after their final geometry exists.
        if (referenceLayout) {
          const generation = renderGeneration;
          void api.renderManagement.finishQueuedRenders().then(() => {
            if (disposed || generation !== renderGeneration) return;
            let y = 40;
            for (const block of blocks.values()) {
              if (block.getParent()) continue;
              const position = block.getRelativeToSurfaceXY();
              if (!positions.has(blockOccurrence(block))) block.moveBy(40 - position.x, y - position.y);
              y = Math.max(y, block.getRelativeToSurfaceXY().y + block.getHeightWidth().height + 32);
            }
          });
        }
      }
      workspace.clearUndo();
      expectedReading = fingerprint();
    } finally { rendering = false; }
  }
  return {
    render, read,
    presentPlayback(blocks, label) { if (!disposed) playbackPresentation.present(blocks, label); },
    highlight(moduleId) { if (!disposed && highlightedModule!==moduleId) {theme.setComponentStyle('selectedGlowColour',accent());workspace.highlightBlock(moduleId ?? null);highlightedModule=moduleId;} },
    onSemanticChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    onSelectionChange(listener) { selectionListeners.add(listener); return () => { selectionListeners.delete(listener); }; },
    resize() { if (!disposed && element.clientWidth > 0 && element.clientHeight > 0) viewportResize.resize(); },
    dispose() {
      if (disposed) return;
      disposed = true; renderGeneration++;
      workspace.removeChangeListener(onChange); listeners.clear(); selectionListeners.clear();
      try { workspace.dispose(); } finally { releaseVariableReads(); renderer.dispose(); releaseDefinitions(); occurrences.clear(); releaseMessages(); }
    }
  };
}
