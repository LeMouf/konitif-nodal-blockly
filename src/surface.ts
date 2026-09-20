import type { NodalBlocklyHost } from './contracts.js';
import { BlocklyContributionCatalog } from './catalog.js';
import { createBlocklyEditor } from './editor.js';
import { createNodalBlocklySession } from './session.js';

export interface NodalBlocklySurfaceOptions {
  host: NodalBlocklyHost;
  catalog: BlocklyContributionCatalog;
  /** Translator belongs to the host; English defaults are the portable fallback. */
  text?: (key: string, fallback: string) => string;
  commands?: readonly { label: string; request(): { accepted: boolean; reason?: string } }[];
}

/** Loading and mounting are explicit. Disposal also cancels an outstanding asynchronous load. */
export function mountNodalBlocklySurface(element: HTMLElement, options: NodalBlocklySurfaceOptions) {
  let disposed = false;
  let activeRequested = true;
  let session: ReturnType<typeof createNodalBlocklySession> | null = null;
  let resize: ResizeObserver | null = null;
  const t = (key: string, fallback: string) => options.text?.(key, fallback) ?? fallback;
  const root = element.ownerDocument.createElement('section');
  root.className = 'konitif-nodal-blockly';
  const highlightStyle=element.ownerDocument.createElement('style');
  highlightStyle.textContent=`
    .konitif-nodal-blockly .blocklyDraggable > .blocklyPath {
      stroke: var(--konitif-blockly-concept-accent, var(--konitif-blockly-block-border, #07111b70));
      stroke-width: 1.25px; stroke-linejoin: round; vector-effect: non-scaling-stroke;
    }
    .konitif-nodal-blockly .blocklyHighlighted > .blocklyPath {
      filter:none;
      stroke: var(--konitif-blockly-accent,#22d3ee); stroke-width: 3px;
    }
    .konitif-nodal-blockly .blocklySelected > .blocklyPathSelected {
      stroke: var(--konitif-blockly-accent,#22d3ee); stroke-width: 2.5px;
      vector-effect: non-scaling-stroke;
    }
    .konitif-nodal-blockly .blocklyInsertionMarker > .konitifBlocklySheen,
    .konitif-nodal-blockly .blocklyInsertionMarker > .konitifBlocklyDepth { display:none; }
    .konitif-nodal-blockly .blocklyText { font-weight:600; }
    .konitif-nodal-blockly .konitifBlocklyWarning { display:none; }
    .konitif-nodal-blockly [data-playback-warning] > .konitifBlocklyWarning { display:block; }
    .konitif-nodal-blockly [data-playback-state="queued"] > .blocklyPath { fill-opacity:.48; }
    .konitif-nodal-blockly [data-playback-state="queued"] > .konitifBlocklySheen { opacity:.35; }
    .konitif-nodal-blockly [data-playback-state="running"] > .blocklyPath { stroke:var(--konitif-blockly-accent,#22d3ee); stroke-width:2.5px; }
    .konitif-nodal-blockly [data-playback-state="paused"] > .blocklyPath { stroke:var(--konitif-blockly-warning,#fbbf24); stroke-width:2px; }
    .konitif-nodal-blockly [data-playback-state="completed"] > .blocklyPath { stroke:var(--konitif-blockly-success,#34d399); }
    .konitif-nodal-blockly [data-playback-state="failed"] > .blocklyPath { stroke:var(--konitif-blockly-error,#fb7185); stroke-width:2px; }
    .konitif-nodal-blockly [data-playback-warning] > .blocklyPath { stroke:var(--konitif-blockly-warning,#fbbf24); stroke-width:2px; }
    .konitif-nodal-blockly [data-playback-warning] > .blocklyWarningIcon .blocklyIconShape { fill:var(--konitif-blockly-warning,#fbbf24); stroke:#132435; }
    .konitif-nodal-blockly [data-playback-warning] > .blocklyWarningIcon .blocklyIconSymbol { fill:#132435; }
    .konitif-nodal-blockly .konitifBlocklyPlayback { fill:var(--konitif-blockly-muted,#94a3b8); stroke:none; }
    .konitif-nodal-blockly .konitifBlocklyPlaybackTrack {
      stroke:color-mix(in srgb,var(--konitif-blockly-muted,#94a3b8) 38%,transparent);
    }
    .konitif-nodal-blockly .konitifBlocklyPlaybackValue { stroke:var(--konitif-blockly-accent,#22d3ee); }
    .konitif-nodal-blockly [data-playback-state="completed"] > .konitifBlocklyPlayback .konitifBlocklyPlaybackValue { stroke:var(--konitif-blockly-success,#34d399); }
    .konitif-nodal-blockly [data-playback-state="paused"] > .konitifBlocklyPlayback .konitifBlocklyPlaybackValue,
    .konitif-nodal-blockly [data-playback-warning] > .konitifBlocklyPlayback .konitifBlocklyPlaybackValue { stroke:var(--konitif-blockly-warning,#fbbf24); }
    .konitif-nodal-blockly [data-playback-state="failed"] > .konitifBlocklyPlayback .konitifBlocklyPlaybackValue { stroke:var(--konitif-blockly-error,#fb7185); }
    .konitif-nodal-blockly [data-playback-state="running"] > .konitifBlocklyPlayback { fill:var(--konitif-blockly-accent,#22d3ee); }
    .konitif-nodal-blockly [data-playback-state="completed"] > .konitifBlocklyPlayback { fill:var(--konitif-blockly-success,#34d399); }
    .konitif-nodal-blockly [data-playback-state="paused"] > .konitifBlocklyPlayback,
    .konitif-nodal-blockly [data-playback-warning] > .konitifBlocklyPlayback { fill:var(--konitif-blockly-warning,#fbbf24); }
    .konitif-nodal-blockly .blocklyEditableText > rect {
      stroke: var(--konitif-blockly-field-border, #ffffff42); stroke-width:1px;
    }
    .konitif-nodal-blockly .blocklyFlyoutBackground {
      stroke:var(--konitif-blockly-border,#8884); stroke-width:1px;
    }
    .konitif-nodal-blockly__footer {
      display:flex; align-items:center; gap:10px; flex:0 0 auto;
      min-width:0; padding:8px 14px;
      border-top:1px solid var(--konitif-blockly-border,#8884);
      background:color-mix(in srgb,var(--konitif-blockly-surface,#eef2f6) 72%,transparent);
    }
    .konitif-nodal-blockly__progress {
      flex:1 1 12rem; width:auto; min-width:64px; height:4px;
      accent-color:var(--konitif-blockly-accent,#22d3ee);
    }
    .konitif-nodal-blockly__progress[data-interactive="true"] {
      cursor:ew-resize; touch-action:none;
    }
    .konitif-nodal-blockly__progress[data-interactive="true"]:focus-visible {
      outline:2px solid var(--konitif-blockly-accent,#22d3ee);
      outline-offset:4px;
    }
    .konitif-nodal-blockly__info { position:relative; display:inline-flex; flex:0 0 auto; }
    .konitif-nodal-blockly__info-button {
      display:inline-grid; place-items:center; width:30px; height:30px; padding:0;
      color:var(--konitif-blockly-muted,#60758c);
      background:var(--konitif-blockly-surface,#eef2f6);
      border:1px solid var(--konitif-blockly-border,#8884); border-radius:999px;
      font:700 13px/1 system-ui; cursor:help;
    }
    .konitif-nodal-blockly__info-button:hover,
    .konitif-nodal-blockly__info-button:focus-visible {
      color:var(--konitif-blockly-ink,#213044);
      border-color:var(--konitif-blockly-accent,#22d3ee);
      outline:none;
    }
    .konitif-nodal-blockly__tooltip {
      position:absolute; right:0; bottom:calc(100% + 8px); z-index:20;
      width:max-content; max-width:min(28rem,calc(100vw - 32px)); padding:8px 10px;
      color:var(--konitif-blockly-ink,#213044);
      background:var(--konitif-blockly-surface,#eef2f6);
      border:1px solid var(--konitif-blockly-border,#8884); border-radius:6px;
      box-shadow:0 8px 24px #0005; overflow-wrap:anywhere;
      opacity:0; visibility:hidden; transform:translateY(4px); pointer-events:none;
      transition:opacity 120ms ease,transform 120ms ease,visibility 120ms step-end;
    }
    .konitif-nodal-blockly__info:hover .konitif-nodal-blockly__tooltip,
    .konitif-nodal-blockly__info:focus-within .konitif-nodal-blockly__tooltip {
      opacity:1; visibility:visible; transform:translateY(0);
      transition:opacity 120ms ease,transform 120ms ease,visibility 0ms;
    }
    .konitif-nodal-blockly__status {
      position:absolute; width:1px; height:1px; padding:0; margin:-1px;
      overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
    }
    .konitif-nodal-blockly__command { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    @media (max-width:520px) {
      .konitif-nodal-blockly__footer { gap:7px; padding-inline:8px; }
      .konitif-nodal-blockly__command { max-width:42%; }
    }
    @media (forced-colors: active) {
      .konitif-nodal-blockly .konitifBlocklySheen,
      .konitif-nodal-blockly .konitifBlocklyDepth { display:none; }
      .konitif-nodal-blockly .blocklyDraggable > .blocklyPath { stroke:CanvasText; }
      .konitif-nodal-blockly .blocklyHighlighted > .blocklyPath { stroke:Highlight; }
    }
  `;
  root.append(highlightStyle);
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:240px;color:var(--konitif-blockly-ink,#213044);background:var(--konitif-blockly-canvas,#f8fafc);font:14px system-ui';
  const bar = element.ownerDocument.createElement('footer');
  bar.className = 'konitif-nodal-blockly__footer';
  const status = element.ownerDocument.createElement('span');
  status.className='konitif-nodal-blockly__status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const initialStatus=t('loading','Loading Blockly…'); status.textContent=initialStatus;
  const information = element.ownerDocument.createElement('span'); information.className='konitif-nodal-blockly__info';
  const informationButton = element.ownerDocument.createElement('button'); informationButton.type='button';
  informationButton.className='konitif-nodal-blockly__info-button'; informationButton.textContent='i';
  informationButton.setAttribute('aria-label',t('information','Program information'));
  const tooltip = element.ownerDocument.createElement('span'); tooltip.className='konitif-nodal-blockly__tooltip'; tooltip.setAttribute('role','tooltip');
  tooltip.id=`konitif-nodal-blockly-status-${crypto.randomUUID()}`; tooltip.textContent=initialStatus;
  informationButton.setAttribute('aria-describedby',tooltip.id); information.append(informationButton,tooltip);
  const setStatus = (message: string) => { status.textContent=message; tooltip.textContent=message; };
  const run = element.ownerDocument.createElement('button'); run.type='button'; run.textContent=t('run','Run'); run.disabled=true;
  run.style.cssText='color:inherit;background:var(--konitif-blockly-surface,#eef2f6);border:1px solid var(--konitif-blockly-border,#8884);border-radius:6px;padding:6px 12px;font:inherit';
  const canvas = element.ownerDocument.createElement('div'); canvas.style.cssText='flex:1;min-height:180px;position:relative;overflow:hidden';
  const stop = element.ownerDocument.createElement('button'); stop.type='button'; stop.textContent=t('stop','Stop'); stop.hidden=!options.host.runtime?.requestStop;
  stop.style.cssText=run.style.cssText;
  const progress = element.ownerDocument.createElement('progress'); progress.max=1; progress.value=0; progress.hidden=!options.host.runtime?.observe;
  progress.className='konitif-nodal-blockly__progress'; progress.setAttribute('aria-label',t('progress','Sequence progress'));
  const canSeek=typeof options.host.runtime?.requestSeek==='function';
  progress.dataset.interactive=String(canSeek); progress.tabIndex=canSeek?0:-1;
  if(canSeek){progress.setAttribute('role','slider');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');}
  const details = element.ownerDocument.createElement('details'); details.style.cssText='padding:6px 14px';
  const summary = element.ownerDocument.createElement('summary'); summary.textContent=t('details','Details');
  const diagnostic=element.ownerDocument.createElement('div'); diagnostic.style.cssText='overflow-wrap:anywhere;padding:8px 0';
  details.append(summary,diagnostic);
  for (const command of options.commands ?? []) {
    const button = element.ownerDocument.createElement('button'); button.type='button';button.textContent=command.label;button.className='konitif-nodal-blockly__command';button.style.cssText=run.style.cssText;
    button.addEventListener('click',()=>{const result=command.request();if(!result.accepted){diagnostic.textContent=result.reason??'command-rejected';details.hidden=false;}});
    bar.append(button);
  }
  bar.append(progress,information,run,stop,status);root.append(canvas,details,bar);element.append(root);
  const applySeek=(value:number)=>{
    const normalized=Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
    progress.value=normalized;progress.setAttribute('aria-valuenow',String(Math.round(normalized*100)));
    const result=options.host.runtime?.requestSeek?.(normalized);
    if(result&&!result.accepted){diagnostic.textContent=result.reason??'seek-rejected';details.hidden=false;}
  };
  const seekFromPointer=(event:PointerEvent)=>{
    const bounds=progress.getBoundingClientRect();
    if(!canSeek||bounds.width<=0)return;
    applySeek((event.clientX-bounds.left)/bounds.width);
  };
  let scrubbing=false;
  const progressPointerDown=(event:PointerEvent)=>{
    if(!canSeek)return;
    scrubbing=true;
    if(typeof progress.setPointerCapture==='function')progress.setPointerCapture(event.pointerId);
    seekFromPointer(event);event.preventDefault();
  };
  const progressPointerMove=(event:PointerEvent)=>{if(scrubbing)seekFromPointer(event);};
  const progressPointerUp=(event:PointerEvent)=>{if(!scrubbing)return;seekFromPointer(event);scrubbing=false;};
  const progressKeyDown=(event:KeyboardEvent)=>{
    if(!canSeek)return;
    const next=event.key==='Home'?0:event.key==='End'?1:event.key==='ArrowLeft'||event.key==='ArrowDown'?progress.value-.01:event.key==='ArrowRight'||event.key==='ArrowUp'?progress.value+.01:null;
    if(next===null)return;applySeek(next);event.preventDefault();
  };
  progress.addEventListener('pointerdown',progressPointerDown);
  progress.addEventListener('pointermove',progressPointerMove);
  progress.addEventListener('pointerup',progressPointerUp);
  progress.addEventListener('pointercancel',progressPointerUp);
  progress.addEventListener('keydown',progressKeyDown);
  function updateRun() {
    const snapshot = options.host.read();
    const availability = snapshot && options.host.runtime?.availability(snapshot);
    if (availability?.reason && options.host.runtime?.observe && !availability.available) {
      const state=options.host.runtime.observe().state;
      if(state!=='running' && state!=='preparing') {diagnostic.textContent=availability.reason;details.hidden=false;}
    }
    run.disabled = !session || !activeRequested || !availability?.available;
    run.style.opacity = run.disabled ? '0.5' : '1';
    run.title = availability?.available ? '' : availability?.reason ?? t('runtimeUnavailable','No compatible execution provider is available.');
    const observation = options.host.runtime?.observe?.();
    if (observation) {
      root.dataset.executionState=observation.state;
      progress.value=Math.max(0,Math.min(1,observation.progress));
      progress.setAttribute('aria-valuenow',String(Math.round(progress.value*100)));
      stop.disabled=observation.state!=='running' && observation.state!=='preparing';
      session?.highlight(observation.activeModuleId??null);
      session?.presentPlayback(observation.blocks??{}, state => t(`playback.${state}`, state.toUpperCase()));
      if (observation.state!=='idle') setStatus(observation.message || t(`execution.${observation.state}`,observation.state));
      if (observation.state==='failed') {diagnostic.textContent=observation.message??'execution-failed';details.hidden=false;}
    }
  }
  const click = () => { const result=session?.run(); if(result && !result.accepted)diagnostic.textContent=result.reason; updateRun(); };
  run.addEventListener('click',click);
  const stopClick = () => {options.host.runtime?.requestStop?.();updateRun();};
  stop.addEventListener('click',stopClick);
  let releaseRun: (() => void) | null = null;
  let releaseObservation: (() => void) | null = null;
  function activateSession() {
    if(!session || disposed || !activeRequested)return;
    session.activate();
    if(!releaseRun)releaseRun=options.host.subscribe(updateRun);
    if(!releaseObservation)releaseObservation=options.host.runtime?.subscribe?.(updateRun)??null;
    if(!resize && typeof ResizeObserver!=='undefined'){resize=new ResizeObserver(()=>session?.resize());resize.observe(canvas);}
    session.resize();updateRun();
  }
  const ready = Promise.all([import('blockly/core'),import('blockly/msg/en')]).then(([loaded,messages]) => {
    if(disposed)return;
    const api = (loaded as unknown as { default?: typeof loaded }).default ?? loaded;
    const messageSource = (messages as unknown as {default?:Record<string,string>}).default ?? messages;
    const english:Record<string,string> = Object.fromEntries(Object.entries(messageSource).filter((entry): entry is [string,string] => typeof entry[1] === 'string'));
    session=createNodalBlocklySession({host:options.host,catalog:options.catalog,createEditor:()=>createBlocklyEditor(api,canvas,english),status(message){
      const labels: Record<string,string> = {
        ready:t('ready','Ready to edit'), 'empty-catalog':t('emptyCatalog','No blocks contributed yet.'),
        'ready-references':t('readyReferences','Ready to edit. Choose source ports in the input menus.'),
        'ready-statements':t('readyStatements','Stack actions under On start. Place clips inside Play animation and values inside parameter sockets.'),
        'ready-mixed':t('readyMixed','Ready to edit. Attach value blocks or choose source ports in the input menus.'),
        'no-workflow':t('noWorkflow','Open or create a workflow in the host.'),
        'source-changed':t('sourceChanged','The workflow changed elsewhere. The current version has been restored.')
      };
      const code = message.split(':')[0];
      const issueLabels: Record<string,string> = {
        'missing-projection': t('missingProjection','No block presentation is registered for this node type.'),
        'composite-not-supported': t('unsupportedStructure','Composite editing is not yet supported. The workflow is preserved.'),
        'port-not-representable': t('incompatibleSchema','The node port schema cannot be represented by these blocks. The workflow is preserved.'),
        'schema-changed': t('incompatibleSchema','The node port schema cannot be represented by these blocks. The workflow is preserved.'),
        'connection-not-representable': t('unsupportedConnections','These connections cannot be edited with the supported block projections. The workflow is preserved.'),
        'shared-output-or-occupied-input': t('unsupportedConnections','These connections cannot be edited with the supported block projections. The workflow is preserved.'),
        'cycle-not-supported': t('unsupportedConnections','These connections cannot be edited with the supported block projections. The workflow is preserved.')
      };
      setStatus(labels[message]??(issueLabels[code] ? `${issueLabels[code]} ${message.slice(code.length+1)}` : t('unsupported','This workflow cannot be edited with the available blocks.')));
      diagnostic.textContent=labels[message]?'':message;details.hidden=!diagnostic.textContent;updateRun();
    }});
    activateSession();
  }).catch(error=>{
    if(disposed)return;
    resize?.disconnect();resize=null;releaseRun?.();releaseRun=null;releaseObservation?.();releaseObservation=null;session?.dispose();session=null;
    setStatus(t('loadFailed','Blockly could not be loaded.'));diagnostic.textContent=error instanceof Error?error.message:String(error);details.hidden=false;
    throw error;
  });
  return {ready,deactivate(){activeRequested=false;session?.deactivate();resize?.disconnect();resize=null;releaseRun?.();releaseRun=null;releaseObservation?.();releaseObservation=null;run.disabled=true;},activate(){if(disposed)throw new Error('surface-disposed');activeRequested=true;activateSession();},dispose(){
    if(disposed)return;disposed=true;resize?.disconnect();releaseRun?.();releaseObservation?.();session?.dispose();session=null;run.removeEventListener('click',click);stop.removeEventListener('click',stopClick);
    progress.removeEventListener('pointerdown',progressPointerDown);progress.removeEventListener('pointermove',progressPointerMove);progress.removeEventListener('pointerup',progressPointerUp);progress.removeEventListener('pointercancel',progressPointerUp);progress.removeEventListener('keydown',progressKeyDown);root.remove();
  }};
}
