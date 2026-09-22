import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBlocklyEditor } from '../dist/editor.js';
import { projectBlocklyWorkflow, proposeBlocklyEdit } from '../dist/index.js';
import { mountNodalBlocklySurface } from '../dist/surface.js';
import { BlocklyContributionCatalog, createNodalBlocklySession } from '../dist/index.js';
import {createHost,contributions,number,sum} from './fixtures.mjs';
import { structuredScenario } from './structuredFixture.mjs';
import { mixedScenario } from './mixedFixture.mjs';
import { statementScenario } from './statementFixture.mjs';

const dom = new JSDOM('<!doctype html><html><body><div id="one"></div><div id="two"></div></body></html>', {pretendToBeVisual:true,url:'http://localhost'});
for(const name of ['window','document','HTMLElement','Element','Node','DocumentFragment','SVGElement','DOMParser','XMLSerializer','HTMLCanvasElement','Event','FocusEvent','MouseEvent','KeyboardEvent']) globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle;
// jsdom has no SVG layout or canvas. Only geometry/text measurement are replaced, not Blockly logic.
dom.window.SVGElement.prototype.getBBox=function(){return{x:0,y:0,width:120,height:40};};
dom.window.SVGElement.prototype.getScreenCTM=function(){return{a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;}};};
dom.window.SVGElement.prototype.createSVGPoint=function(){return{x:0,y:0,matrixTransform(){return this;}};};
dom.window.HTMLCanvasElement.prototype.getContext=function(){return{measureText(text){return{width:String(text).length*8};}};};
const loaded=await import('blockly/core');
const api=loaded.default??loaded;

test('Blockly 12 variable reads use the variable-map authority without the deprecated prototype',()=>{
 const deprecated=api.Workspace.prototype.getAllVariables;
 const warnings=[];const warn=console.warn;console.warn=(...values)=>warnings.push(values.join(' '));
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  assert.notEqual(api.Workspace.prototype.getAllVariables,deprecated);
  assert.deepEqual(workspace.getAllVariables(),workspace.getVariableMap().getAllVariables());
 }finally{editor.dispose();console.warn=warn;}
 assert.equal(api.Workspace.prototype.getAllVariables,deprecated);
 assert.deepEqual(warnings,[]);
});

test('playback paint is differential, warning is scoped, and no semantic edit or selection is emitted', async () => {
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  const a=workspace.getBlockById(ids.a),b=workspace.getBlockById(ids.b);
  let edits=0,selections=0;editor.onSemanticChange(()=>edits++);editor.onSelectionChange(()=>selections++);
  const before=JSON.stringify(editor.read());
  const reading={ [ids.a]:{state:'paused',progress:.4,warning:{message:'Physical fall detected'}},[ids.b]:{state:'queued',progress:0} };
  editor.presentPlayback(reading,state=>state.toUpperCase());
  assert.equal(a.getSvgRoot().dataset.playbackState,'paused');
  assert.equal(a.getSvgRoot().dataset.playbackWarning,'true');
  assert.equal(b.getSvgRoot().dataset.playbackWarning,undefined);
  assert.equal(a.getSvgRoot().querySelector('.konitifBlocklyWarning').getAttribute('d'),a.getSvgRoot().querySelector('.blocklyPath').getAttribute('d'));
  assert.ok(a.getIcon(api.icons.WarningIcon.TYPE));
  const playback=a.getSvgRoot().querySelector(':scope > .konitifBlocklyPlayback');
  assert.match(playback.querySelector('title').textContent,/Physical fall/);
  assert.equal(playback.querySelector('text').getAttribute('text-anchor'),'end');
  assert.equal(Number(playback.querySelector('text').getAttribute('x')),a.childlessWidth-8);
  const track=playback.querySelector('.konitifBlocklyPlaybackTrack'),value=playback.querySelector('.konitifBlocklyPlaybackValue');
  assert.equal(track.getAttribute('x1'),track.getAttribute('x2'));
  assert.ok(Number(track.getAttribute('x1'))<0);
  assert.equal(value.getAttribute('x1'),track.getAttribute('x1'));
  assert.equal(value.getAttribute('x2'),track.getAttribute('x2'));
  assert.equal(value.getAttribute('y1'),track.getAttribute('y1'));
  assert.ok(Number(value.getAttribute('y2'))>Number(value.getAttribute('y1')));
  assert.ok(Number(value.getAttribute('y2'))<Number(track.getAttribute('y2')));
  await api.renderManagement.finishQueuedRenders();
  editor.presentPlayback(reading,state=>state.toUpperCase());
  const mutations=[];const observer=new window.MutationObserver(records=>mutations.push(...records));observer.observe(a.getSvgRoot(),{subtree:true,attributes:true,childList:true,characterData:true});
  for(let i=0;i<20;i++)editor.presentPlayback(reading,state=>state.toUpperCase());
  await Promise.resolve();observer.disconnect();assert.equal(mutations.length,0);
  editor.presentPlayback({[ids.a]:{state:'completed',progress:1},[ids.b]:{state:'running',progress:.1}},state=>state.toUpperCase());
  assert.equal(a.getSvgRoot().dataset.playbackWarning,undefined);
  assert.ok(!a.getIcon(api.icons.WarningIcon.TYPE));
  assert.equal(a.getSvgRoot().querySelector(':scope > .konitifBlocklyPlayback .konitifBlocklyPlaybackValue').getAttribute('y2'),a.getSvgRoot().querySelector(':scope > .konitifBlocklyPlayback .konitifBlocklyPlaybackTrack').getAttribute('y2'));
  assert.equal(b.getSvgRoot().dataset.playbackState,'running');
  editor.presentPlayback({},state=>state);
  assert.equal(a.getSvgRoot().dataset.playbackState,undefined);
  assert.equal(a.getSvgRoot().querySelector(':scope > .konitifBlocklyPlayback'),null);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(edits,0);assert.equal(selections,0);assert.equal(JSON.stringify(editor.read()),before);
 }finally{editor.dispose();}
});

test('native selection emits canonical occurrence identity without a semantic edit or serialization',async()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 const selected=[];let edits=0;
 try {
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  const release=editor.onSelectionChange(id=>selected.push(id));
  editor.onSemanticChange(()=>edits++);
  const before=JSON.stringify(editor.read());
  workspace.getBlockById(ids.b).select();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(selected,[ids.b]);assert.equal(edits,0);
  workspace.getBlockById(ids.b).select();workspace.scroll(20,30);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(selected.every(id=>id===ids.b));assert.equal(edits,0);
  assert.equal(JSON.stringify(editor.read()),before);
  const count=selected.length;
  release();workspace.getBlockById(ids.c).select();
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(selected.length,count);
 }finally{editor.dispose();}
});

test('glass paint follows native paths and preserves readings without adding filters or observers',()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  const root=workspace.getBlockById(ids.a).getSvgRoot();
  const shape=root.querySelector(':scope > .blocklyPath'),sheen=root.querySelector(':scope > .konitifBlocklySheen'),depth=root.querySelector(':scope > .konitifBlocklyDepth');
  assert.equal(sheen.getAttribute('d'),shape.getAttribute('d'));assert.equal(depth.getAttribute('d'),shape.getAttribute('d'));
  assert.equal(sheen.getAttribute('pointer-events'),'none');assert.equal(depth.getAttribute('pointer-events'),'none');
  assert.equal(sheen.getAttribute('aria-hidden'),'true');assert.equal(sheen.getAttribute('filter'),null);
  assert.equal(workspace.getParentSvg().querySelectorAll('defs[data-konitif-blockly-paint] linearGradient').length,2);
  const before=JSON.stringify(editor.read());
  editor.highlight(ids.a);editor.resize();editor.highlight(null);
  assert.equal(JSON.stringify(editor.read()),before);
  const proposal=proposeBlocklyEdit(snapshot,contributions,editor.read());assert.equal(proposal.accepted,true);assert.equal(proposal.changed,false);
  const marker=workspace.newBlock(workspace.getBlockById(ids.a).type);marker.setInsertionMarker(true);marker.initSvg();marker.render();
  assert.equal(marker.getSvgRoot().querySelector('.konitifBlocklySheen').style.display,'none');
  assert.equal(marker.getSvgRoot().querySelector('.konitifBlocklyDepth').style.display,'none');marker.dispose();
 }finally{editor.dispose();}
});

test('glass renderer and gradient identities are leased independently and released on disposal',()=>{
 const before=Object.keys(api.registry.getAllItems(api.registry.Type.RENDERER));
 const {snapshot,contributions}=statementScenario();
 const one=createBlocklyEditor(api,document.getElementById('one')),two=createBlocklyEditor(api,document.getElementById('two'));
 try {
  one.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);two.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const ids=[...document.querySelectorAll('defs[data-konitif-blockly-paint] linearGradient')].map(el=>el.id);
  assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);
  one.dispose();one.dispose();assert.equal(document.querySelectorAll('defs[data-konitif-blockly-paint]').length,1);
  assert.equal(two.read().length,7);
 }finally{one.dispose();two.dispose();}
 assert.deepEqual(Object.keys(api.registry.getAllItems(api.registry.Type.RENDERER)),before);
});

test('RTL glass geometry follows the native mirrored block outline',()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const root=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered).getBlockById(ids.a).getSvgRoot();
  const block=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered).getBlockById(ids.a);
  block.pathObject.flipRTL();
  assert.equal(root.querySelector('.konitifBlocklySheen').getAttribute('transform'),root.querySelector('.blocklyPath').getAttribute('transform'));
  assert.equal(root.querySelector('.konitifBlocklyDepth').getAttribute('transform'),'translate(0, 2) scale(-1 1)');
 }finally{editor.dispose();}
});

test('native statement containers restore stacks, nested parameters and canonical no-op',()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try{
  const projection=projectBlocklyWorkflow(snapshot,contributions);assert.equal(projection.editable,true);
  editor.render(projection,contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  assert.equal(workspace.getRenderer().getConstants().STATEMENT_INPUT_PADDING_LEFT,28);
  const block=id=>workspace.getBlockById(ids[id]);
  assert.equal(block('start').getInputTargetBlock('input_0'),block('group'));
  assert.equal(block('group').getInputTargetBlock('input_1'),block('a'));
  assert.equal(block('a').getNextBlock(),block('b'));assert.equal(block('b').getNextBlock(),block('c'));
  assert.equal(block('group').getNextBlock(),block('delay'));
  assert.equal(block('delay').getInputTargetBlock('input_1'),block('number'));
  const noop=proposeBlocklyEdit(snapshot,contributions,editor.read());assert.equal(noop.accepted,true);assert.equal(noop.changed,false);
 }finally{editor.dispose();}
});

test('footer progress seeks by click, drag and keyboard through the host runtime',async()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog(),element=document.getElementById('one'),seeks=[];
 host.runtime={availability:()=>({available:true}),requestRun:()=>({accepted:true}),requestSeek(value){seeks.push(value);return{accepted:true};},observe:()=>({state:'stopped',progress:.2})};
 const surface=mountNodalBlocklySurface(element,{host,catalog});
 try{
  await surface.ready;
  const progress=element.querySelector('progress');
  progress.getBoundingClientRect=()=>({left:100,right:300,top:0,bottom:4,width:200,height:4,x:100,y:0,toJSON(){return{};}});
  progress.dispatchEvent(new MouseEvent('pointerdown',{clientX:150,bubbles:true,cancelable:true}));
  progress.dispatchEvent(new MouseEvent('pointermove',{clientX:250,bubbles:true,cancelable:true}));
  progress.dispatchEvent(new MouseEvent('pointerup',{clientX:300,bubbles:true,cancelable:true}));
  progress.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  assert.deepEqual(seeks,[.25,.75,1,.99]);
  assert.equal(progress.getAttribute('role'),'slider');assert.equal(progress.getAttribute('aria-valuenow'),'99');
 }finally{surface.dispose();catalog.dispose();}
});

test('active block highlighting resolves parsed vendor colours rather than CSS variable expressions',()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try{editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  assert.doesNotThrow(()=>editor.highlight(ids.a));assert.ok(document.querySelector('#one .blocklyHighlighted'));
  editor.highlight(null);assert.equal(document.querySelector('#one .blocklyHighlighted'),null);
 }finally{editor.dispose();}
});

test('searchable option fields filter labels and values without changing canonical selection', async()=>{
 const {snapshot,contributions}=structuredScenario();
 const options=[
  {label:'Choose animation',value:''},
  {label:'Alpha Walk',value:'catalog-alpha-walk'},
  {label:'Beta Gesture',value:'catalog-beta-gesture'}
 ];
 contributions[0]={...contributions[0],fields:[{...contributions[0].fields[0],options,searchable:true,searchPlaceholder:'Search animations'}]};
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try{
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  const field=workspace.getBlockById('first').getField('field_0');
  field.showEditor();await Promise.resolve();
  const search=document.querySelector('.konitifBlocklySearchableDropdownInput');
  assert.ok(search);assert.equal(search.placeholder,'Search animations');
  search.value='beta';search.dispatchEvent(new Event('input',{bubbles:true}));
  const visible=[...document.querySelectorAll('.blocklyDropDownDiv .blocklyMenuItem')].filter(item=>!item.hidden);
  assert.equal(visible.length,1);assert.match(visible[0].textContent,/Beta Gesture/);
  assert.equal(field.getValue(),'');
  visible[0].dispatchEvent(new MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:10,clientY:10}));
  assert.equal(field.getValue(),'catalog-beta-gesture');
 }finally{api.DropDownDiv.hideWithoutAnimation();editor.dispose();}
});

test('vendor insertion markers never become canonical occurrences or connections',()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try{editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered);
  const marker=workspace.newBlock(workspace.getBlockById(ids.a).type);marker.setInsertionMarker(true);marker.initSvg();marker.render();
  assert.equal(editor.read().length,7);
  const result=proposeBlocklyEdit(snapshot,contributions,editor.read());assert.equal(result.accepted,true);assert.equal(result.changed,false);
  marker.dispose();
 }finally{editor.dispose();}
});

test('native statement reordering changes canonical completion edges, not node identities',()=>{
 const {snapshot,contributions,ids}=statementScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try{
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout&&w.rendered),block=id=>workspace.getBlockById(ids[id]);
  block('b').previousConnection.disconnect();block('c').previousConnection.disconnect();
  block('a').nextConnection.connect(block('c').previousConnection);
  block('c').nextConnection.connect(block('b').previousConnection);
  const result=proposeBlocklyEdit(snapshot,contributions,editor.read());assert.equal(result.accepted,true);
  assert.deepEqual(result.candidate.composition.modules.map(m=>m.id),snapshot.workflow.composition.modules.map(m=>m.id));
  const projection=projectBlocklyWorkflow({...snapshot,workflow:result.candidate},contributions);
  assert.deepEqual(projection.blocks.find(b=>b.id===ids.group).inputs.body,{moduleId:ids.b,portId:'done'});
  assert.deepEqual(projection.blocks.find(b=>b.id===ids.c).inputs.trigger,{moduleId:ids.a,portId:'done'});
 }finally{editor.dispose();}
});

test('mixed editing nests scalar values beside explicit control references without copying occurrences', () => {
 const {snapshot,contributions}=mixedScenario();
 const projection=projectBlocklyWorkflow(snapshot,contributions);
 assert.equal(projection.layout,'mixed');
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projection,contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  assert.ok(workspace.getBlockById('scalar').outputConnection);
  assert.equal(workspace.getBlockById('sum').getInput('input_0').connection.targetBlock().id,'scalar');
  assert.ok(workspace.getBlockById('second').getField('input_0'));
  assert.deepEqual(editor.read().find(b=>b.id==='sum').inputs.a,{moduleId:'scalar',portId:'value'});
  const proposal=proposeBlocklyEdit(snapshot,contributions,editor.read());
  assert.equal(proposal.accepted,true); assert.equal(proposal.changed,false);
  assert.equal(workspace.getAllBlocks(false).length,6);
 } finally { editor.dispose(); }
});

test('mixed fan-out retains one source occurrence and exact references instead of duplicating nested blocks', () => {
 const {snapshot,contributions}=mixedScenario();
 const reading=projectBlocklyWorkflow(snapshot,contributions).blocks;
 reading.find(b=>b.id==='sum').inputs.b={moduleId:'scalar',portId:'value'};
 const proposal=proposeBlocklyEdit(snapshot,contributions,reading);
 assert.equal(proposal.accepted,true); snapshot.workflow=proposal.candidate;
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  assert.equal(workspace.getBlockById('sum').getInput('input_0').connection.targetBlock(),null);
  assert.deepEqual(editor.read().find(b=>b.id==='sum').inputs.a,{moduleId:'scalar',portId:'value'});
  assert.deepEqual(editor.read().find(b=>b.id==='sum').inputs.b,{moduleId:'scalar',portId:'value'});
  assert.equal(workspace.getAllBlocks(false).length,6);
 } finally { editor.dispose(); }
});

test('mixed value gestures replace references atomically and shared admission restores an invalid value type', async () => {
 const {snapshot,contributions}=mixedScenario();
 const seed=projectBlocklyWorkflow(snapshot,contributions).blocks;
 seed.push(number('another',8));
 const seeded=proposeBlocklyEdit(snapshot,contributions,seed);
 assert.equal(seeded.accepted,true); snapshot.workflow=seeded.candidate;
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 let commits=0, refusals=0;
 const refresh=()=>editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
 refresh();
 const release=editor.onSemanticChange(()=>{
  const result=proposeBlocklyEdit(snapshot,contributions,editor.read());
  if(result.accepted && result.changed){snapshot.workflow=result.candidate;commits++;}
  if(!result.accepted)refusals++;
  refresh();
 });
 const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
 try {
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  workspace.getBlockById('sum').setFieldValue(JSON.stringify({moduleId:'another',portId:'value'}),'input_0');
  await settle();
  assert.deepEqual(editor.read().find(b=>b.id==='sum').inputs.a,{moduleId:'another',portId:'value'});
  assert.equal(commits,1);
  const input=workspace.getBlockById('sum').getInput('input_0').connection;
  if(input.targetConnection)input.disconnect();
  input.connect(workspace.getBlockById('scalar').outputConnection);
  await settle();
  assert.deepEqual(editor.read().find(b=>b.id==='sum').inputs.a,{moduleId:'scalar',portId:'value'});
  assert.equal(workspace.getBlockById('sum').getFieldValue('input_0'),'');
  assert.equal(commits,2);
  // A deliberately incompatible native output must not become canonical.
  const entry=snapshot.dialect.nodeRegistry.find(d=>d.type==='test:number');
  const incompatible={...entry,type:'test:text',outputs:[{...entry.outputs[0],dataType:'string'}],defaultConfig:{value:'text'}};
  snapshot.dialect={...snapshot.dialect,nodeRegistry:[...snapshot.dialect.nodeRegistry,incompatible]};
  contributions.push({id:'test.text',dialectId:snapshot.dialect.id,nodeType:'test:text',fields:[{configKey:'value',label:'Text',editor:'text'}]});
  const add=proposeBlocklyEdit(snapshot,contributions,[...editor.read(),{id:'text',contributionId:'test.text',fields:{value:'text'},inputs:{}}]);
  assert.equal(add.accepted,true);snapshot.workflow=add.candidate;refresh();
  const current=structuredClone(snapshot.workflow);
  const target=workspace.getBlockById('sum').getInput('input_0').connection;
  target.disconnect(); target.connect(workspace.getBlockById('text').outputConnection);
  await settle();
  assert.equal(refusals,1);assert.deepEqual(snapshot.workflow,current);
  assert.deepEqual(editor.read().find(b=>b.id==='sum').inputs.a,{moduleId:'scalar',portId:'value'});
 } finally { release();editor.dispose(); }
});

test('compact reference palette creates fully editable port cards through Blockly serialization', () => {
 const {snapshot,contributions}=structuredScenario();
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projectBlocklyWorkflow(snapshot,contributions),contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  const palette=workspace.getFlyout().getWorkspace().getAllBlocks(false)[0];
  assert.equal(palette.getField('input_0'),null);
  const placed=api.serialization.blocks.append(api.serialization.blocks.save(palette),workspace);
  assert.ok(placed.getField('input_0'));
  placed.setFieldValue('Created','field_0');
  const proposal=proposeBlocklyEdit(snapshot,contributions,editor.read());
  assert.equal(proposal.accepted,true,proposal.reason);
  assert.equal(proposal.candidate.composition.modules.length,5);
  assert.deepEqual(proposal.candidate.composition.connections,snapshot.workflow.composition.connections);
 } finally {editor.dispose();}
});

test('real reference menus preserve branches, admit rewiring and disconnect a deleted source', async () => {
 const scenario=structuredScenario();
 let snapshot=scenario.snapshot, commits=0, refuse=false;
 const listeners=new Set();
 const host={read:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},commit(request){
  if(refuse)return {accepted:false,reason:'host-refused'};
  snapshot={...snapshot,workflow:request.candidate,revision:String(++commits)};
  for(const listener of [...listeners])listener();return {accepted:true};
 }};
 const catalog=new BlocklyContributionCatalog();catalog.register('ports',scenario.contributions);
 let editor;
 const session=createNodalBlocklySession({host,catalog,createEditor:()=>editor=createBlocklyEditor(api,document.getElementById('one'))});
 try {
  session.activate();
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  assert.deepEqual(editor.read().sort((a,b)=>a.id.localeCompare(b.id)),projectBlocklyWorkflow(snapshot,scenario.contributions).blocks.sort((a,b)=>a.id.localeCompare(b.id)));
  const second=workspace.getBlockById('second');
  const options=second.getField('input_0').getOptions(false).map(option=>option[1]);
  assert.ok(options.includes(JSON.stringify({moduleId:'first',portId:'done'})));
  assert.ok(!options.includes(JSON.stringify({moduleId:'first',portId:'event'})));
  second.setFieldValue(JSON.stringify({moduleId:'first',portId:'failed'}),'input_0');
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(commits,1);
  assert.equal(snapshot.workflow.composition.connections.find(c=>c.target.moduleId==='second').source.portId,'failed');
  refuse=true;
  workspace.getBlockById('second').setFieldValue(JSON.stringify({moduleId:'first',portId:'done'}),'input_0');
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(commits,1);
  assert.deepEqual(editor.read().find(b=>b.id==='second').inputs.trigger,{moduleId:'first',portId:'failed'});
  refuse=false;
  workspace.getBlockById('first').dispose(false);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(commits,2);
  assert.equal(snapshot.workflow.composition.modules.length,3);
  assert.equal(snapshot.workflow.composition.connections.length,0);
 } finally {session.dispose();catalog.dispose();}
 assert.equal(listeners.size,0);
});

test('accepted equivalent projection preserves the active field DOM and block identity',()=>{
 const host=createHost(),base=host.read();
 const proposal=proposeBlocklyEdit(base,contributions,[number('existing',3)]);
 const snapshot={...base,workflow:proposal.candidate};
 const projection=projectBlocklyWorkflow(snapshot,contributions);
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  editor.render(projection,contributions,snapshot);
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  const block=workspace.getAllBlocks(false)[0];
  const dom=block.getSvgRoot();
  editor.render(projection,contributions,{...snapshot,revision:'next'});
  assert.ok(workspace.getAllBlocks(false)[0]===block);
  assert.ok(block.getSvgRoot()===dom);
 } finally { editor.dispose(); }
});

test('workspace theme reads host-scoped CSS variables, not a fixed white canvas',()=>{
 const editor=createBlocklyEditor(api,document.getElementById('one'));
 try {
  const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
  assert.match(workspace.getTheme().getComponentStyle('workspaceBackgroundColour'),/--konitif-blockly-canvas/);
  assert.match(workspace.getTheme().getComponentStyle('flyoutBackgroundColour'),/--konitif-blockly-surface/);
 } finally { editor.dispose(); }
});

test('missing projection explains the absent presentation without changing the canonical graph',async()=>{
 const host=createHost(),base=host.read();
 const proposal=proposeBlocklyEdit(base,contributions,[number('existing',3)]);
 host.commit({baseRevision:base.revision,workflowId:base.workflow.id,candidate:proposal.candidate});
 const before=JSON.stringify(host.read());
 const catalog=new BlocklyContributionCatalog(),element=document.getElementById('one');
 const surface=mountNodalBlocklySurface(element,{host,catalog});
 try {
  await surface.ready;
  assert.match(element.querySelector('[role=status]').textContent,/No block presentation.*test:number/);
  assert.equal(JSON.stringify(host.read()),before);
 } finally { surface.dispose();catalog.dispose(); }
});

test('real Blockly workspaces preserve block identities/connections and clean only their own definitions',()=>{
 const host=createHost(),base=host.read(),proposal=proposeBlocklyEdit(base,contributions,[number('a',3),number('b',4),sum('total','a','b')]);assert.equal(proposal.accepted,true);
 const snapshot={...base,workflow:proposal.candidate},projection=projectBlocklyWorkflow(snapshot,contributions);
 const before=new Set(Object.keys(api.Blocks));
 const one=createBlocklyEditor(api,document.getElementById('one'));one.render(projection,contributions,snapshot);
 const second=createBlocklyEditor(api,document.getElementById('two'));second.render(projection,contributions,snapshot);
 assert.equal(one.read().length,3);assert.deepEqual(one.read().find(b=>b.id==='total').inputs,{a:'a',b:'b'});
 const ownKeys=Object.keys(api.Blocks).filter(k=>!before.has(k));assert.equal(ownKeys.length,4);
 one.dispose();one.dispose();assert.equal(Object.keys(api.Blocks).filter(k=>!before.has(k)).length,2);assert.equal(second.read().length,3);
 second.dispose();assert.deepEqual(new Set(Object.keys(api.Blocks)),before);
 assert.equal(document.querySelectorAll('.blocklySvg').length,0);
});
test('surface mounts empty, deactivates, reactivates, disposes and cancels a pending mount',async()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog(),element=document.getElementById('one');
 const surface=mountNodalBlocklySurface(element,{host,catalog});await surface.ready;
 const root=element.querySelector('.konitif-nodal-blockly'),footer=element.querySelector('.konitif-nodal-blockly__footer');
 const run=[...element.querySelectorAll('button')].find(button=>button.textContent==='Run');
 assert.equal(root.lastElementChild,footer);assert.match(footer.querySelector('[role=tooltip]').textContent,/No blocks contributed/);
 assert.equal(footer.querySelector('progress').classList.contains('konitif-nodal-blockly__progress'),true);
 assert.match(element.querySelector('[role=status]').textContent,/No blocks contributed/);assert.equal(host.listeners,2);assert.equal(run.disabled,true);
 surface.deactivate();assert.equal(host.listeners,0);surface.activate();assert.equal(host.listeners,2);
 surface.dispose();assert.equal(host.listeners,0);assert.equal(element.children.length,0);
 const cancelled=mountNodalBlocklySurface(element,{host,catalog});cancelled.dispose();await cancelled.ready;
 assert.equal(element.children.length,0);assert.equal(host.listeners,0);
 const inactive=mountNodalBlocklySurface(element,{host,catalog});inactive.deactivate();await inactive.ready;assert.equal(host.listeners,0);
 inactive.activate();assert.equal(host.listeners,2);inactive.dispose();assert.equal(host.listeners,0);
});
test('actual Blockly gestures commit canonical fields; moves and late render events do not mutate the workflow',async()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog();catalog.register('test-provider',contributions);
 let editor;
 const session=createNodalBlocklySession({host,catalog,createEditor:()=>editor=createBlocklyEditor(api,document.getElementById('one'))});
 session.activate();
 const workspace=api.Workspace.getAll().find(w=>!w.isFlyout && w.rendered);
 assert.ok(workspace);
 const key=Object.keys(api.Blocks).find(k=>k.startsWith('konitif_')&&k.endsWith('_0'));
 const block=workspace.newBlock(key);block.initSvg();block.render();block.setFieldValue('9','field_0');
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(host.read().workflow.composition.modules.length,1);
 assert.equal(host.read().workflow.composition.modules[0].metadata.config.value,9);
 const before=host.commits;
 workspace.getAllBlocks(false)[0].moveBy(20,20);
 await new Promise(resolve=>setTimeout(resolve,100));assert.equal(host.commits,before);
 session.dispose();assert.equal(host.listeners,0);
});
