import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWorkflowToNodalGraph, executeWorkflowViaNodalRuntime } from '@konitif/nodal';
import { BlocklyContributionCatalog, projectBlocklyWorkflow, proposeBlocklyEdit, createNodalBlocklySession } from '../dist/index.js';
import {createHost,contributions,number,sum,fakeEditor} from './fixtures.mjs';

test('selection is ephemeral, refreshed after an own parameter edit and released on removal/readd',()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog();catalog.register('fixture',contributions);
 const seed=proposeBlocklyEdit(host.read(),contributions,[number('n',2)]);
 host.commit({baseRevision:'0',workflowId:seed.candidate.id,candidate:seed.candidate});
 const selections=[],editors=[];host.select=request=>selections.push(request);
 const session=createNodalBlocklySession({host,catalog,createEditor(){
  const editor=fakeEditor();let selection=null;
  editor.onSelectionChange=listener=>{selection=listener;return()=>{selection=null;};};
  editor.select=id=>selection?.(id);editors.push(editor);return editor;
 }});
 session.activate();const editor=editors[0],commits=host.commits;
 editor.select('n');assert.equal(host.commits,commits);
 assert.deepEqual(selections,[{workflowId:host.read().workflow.id,revision:host.read().revision,moduleId:'n'}]);
 editor.edit([number('n',5)]);assert.equal(host.commits,commits+1);
 assert.equal(selections.at(-1).revision,host.read().revision);assert.equal(selections.at(-1).moduleId,'n');
 const count=selections.length;host.invalidate();assert.equal(selections.length,count);
 session.deactivate();editor.select('n');assert.equal(selections.length,count);
 session.activate();assert.equal(selections.length,count);editors[1].select('n');assert.equal(selections.length,count+1);
 session.dispose();editors[1].select('n');assert.equal(selections.length,count+1);
});

test('catalog starts empty, rejects duplicates, scopes leases, releases only its owner',()=>{
 const a=new BlocklyContributionCatalog(),b=new BlocklyContributionCatalog();assert.deepEqual(a.list(),[]);
 const release=a.register('one',[contributions[0]]);a.register('two',[contributions[1]]);
 assert.throws(()=>a.register('three',[contributions[0]]),/duplicate/);
 const copy=a.list();copy[0].nodeType='mutated';assert.equal(a.list()[0].nodeType,'test:number');
 release();release();assert.equal(a.list().length,1);assert.equal(b.list().length,0);a.dispose();assert.deepEqual(a.list(),[]);
 assert.throws(()=>a.register('later',[]),/disposed/);
});
test('two occurrences preserve their identities, opaque metadata, edge identities and common runtime meaning',()=>{
 const host=createHost(),base=host.read();
 const edit=proposeBlocklyEdit(base,contributions,[number('n1',2),number('n2',5),sum('sum','n1','n2')]);assert.equal(edit.accepted,true);
 assert.equal(host.commit({baseRevision:base.revision,workflowId:base.workflow.id,candidate:edit.candidate}).accepted,true);
 const current=host.read();assert.deepEqual(current.workflow.metadata.keep,{opaque:true});assert.deepEqual(current.workflow.composition.metadata,{keep:'composition'});
 assert.deepEqual(current.workflow.composition.modules.map(m=>m.id),['n1','n2','sum']);
 assert.equal(current.workflow.composition.modules[0].metadata.config.opaque,'kept');
 assert.equal(executeWorkflowViaNodalRuntime({workflow:current.workflow,dialect:current.dialect}).runtimeResult.outputsByNodeId.sum.value,7);
 const projected=projectBlocklyWorkflow(current,contributions);assert.equal(projected.editable,true);
 const noop=proposeBlocklyEdit(current,contributions,[...projected.blocks].reverse());assert.equal(noop.accepted,true);assert.equal(noop.changed,false);
 const changed=projected.blocks.map(b=>b.id==='n1'?{...b,fields:{value:11}}:b);
 const next=proposeBlocklyEdit(current,contributions,changed);assert.equal(next.accepted,true);
 assert.deepEqual(next.candidate.composition.connections,current.workflow.composition.connections);
 assert.equal(next.candidate.composition.modules[1].metadata.config.value,5);
 assert.deepEqual(projectWorkflowToNodalGraph(next.candidate).nodes.map(n=>n.id),['n1','n2','sum']);
});
test('invalid fields, cycles, duplicate occurrences and shared children are refused without mutation',()=>{
 const host=createHost(),base=host.read(),original=JSON.stringify(base.workflow);
 for(const reading of [[number('n1',NaN)],[number('n1',2),number('n1',3)],[sum('s','s',null)],[number('n',3),sum('s','n','n')]]){
   assert.equal(proposeBlocklyEdit(base,contributions,reading).accepted,false);
   assert.equal(JSON.stringify(host.read().workflow),original);
 }
});
test('missing projections and composite references leave the canonical subject read-only',()=>{
 const host=createHost(),base=host.read();const edit=proposeBlocklyEdit(base,contributions,[number('n',2)]);assert.equal(edit.accepted,true);
 const snapshot={...base,workflow:edit.candidate};assert.equal(projectBlocklyWorkflow(snapshot,[]).editable,false);
 const composite={...contributions[0],composite:{definition:{workflowId:'x',revision:'1'},parameters:[],results:[],completionPortId:'done',errorPortId:'error',editing:'shared-definition'}};
 assert.match(projectBlocklyWorkflow(snapshot,[composite]).issues[0],/composite/);
 assert.deepEqual(host.read().workflow,base.workflow);
});
test('activate/deactivate/readd and simultaneous sessions keep canonical data and independent listeners',()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog();const release=catalog.register('fixture',contributions);
 const editorsA=[],editorsB=[];
 const a=createNodalBlocklySession({host,catalog,createEditor(){const editor=fakeEditor();editorsA.push(editor);return editor;}});
 const b=createNodalBlocklySession({host,catalog,createEditor(){const editor=fakeEditor();editorsB.push(editor);return editor;}});
 assert.equal(host.listeners,0);a.activate();a.activate();b.activate();assert.equal(host.listeners,2);assert.equal(editorsA.length,1);
 editorsA[0].edit([number('first',2)]);assert.equal(host.commits,1);assert.equal(editorsB[0].read()[0].id,'first');
 const canonical=host.read().workflow;a.deactivate();assert.equal(host.listeners,1);assert.equal(editorsA[0].disposed,true);
 assert.deepEqual(host.read().workflow,canonical);a.activate();assert.equal(host.listeners,2);assert.equal(editorsA.length,2);assert.equal(editorsA[1].read()[0].id,'first');
 a.dispose();b.dispose();assert.equal(host.listeners,0);assert.deepEqual(host.read().workflow,canonical);
 assert.equal(projectWorkflowToNodalGraph(canonical).nodes[0].id,'first');
 assert.equal(executeWorkflowViaNodalRuntime({workflow:canonical,dialect:host.read().dialect}).runtimeResult.outputsByNodeId.first.value,2);
 assert.equal(catalog.list().length,2);release();assert.deepEqual(catalog.list(),[]);
});
test('host rejection restores the previous projection and never leaves a local authoritative draft',()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog();catalog.register('fixture',contributions);const editor=fakeEditor(),statuses=[];
 const session=createNodalBlocklySession({host,catalog,createEditor:()=>editor,status:s=>statuses.push(s)});session.activate();
 host.refuse(true);editor.edit([number('n',4)]);assert.equal(host.commits,0);assert.deepEqual(editor.read(),[]);assert.equal(statuses.at(-1),'host-refused');session.dispose();
});
test('runtime availability is delegated and removal of runtime never claims a run',()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog();let runs=0,available=true;
 host.runtime={availability:()=>({available}),requestRun:()=>{runs++;return{accepted:true};}};
 const session=createNodalBlocklySession({host,catalog,createEditor:fakeEditor});session.activate();assert.equal(session.run().accepted,true);assert.equal(runs,1);
 available=false;assert.equal(session.run().accepted,false);assert.equal(runs,1);session.dispose();assert.equal(session.run().accepted,false);
});
test('module deletion prunes only references and port contracts of deleted occurrences',()=>{
 const host=createHost(),base=host.read();let edit=proposeBlocklyEdit(base,contributions,[number('n1',2),number('n2',5)]);assert.equal(edit.accepted,true);
 edit.candidate.composition.domains.push({id:'group',title:'Group',moduleIds:['n1','n2'],metadata:{keep:1}});
 const snapshot={...base,workflow:edit.candidate};const next=proposeBlocklyEdit(snapshot,contributions,[number('n2',5)]);assert.equal(next.accepted,true);
 assert.deepEqual(next.candidate.composition.domains[0],{id:'group',title:'Group',moduleIds:['n2'],metadata:{keep:1}});
 assert.equal(next.candidate.composition.contracts.some(c=>c.id.includes('.n1.')),false);
});
test('revoking and re-registering projections preserves canonical modules and restores editing',()=>{
 const host=createHost(),catalog=new BlocklyContributionCatalog(),editor=fakeEditor(),statuses=[];
 const release=catalog.register('provider',contributions);
 const session=createNodalBlocklySession({host,catalog,createEditor:()=>editor,status:s=>statuses.push(s)});session.activate();editor.edit([number('kept',2)]);
 const baseline=host.read().workflow;release();assert.match(statuses.at(-1),/missing-projection/);assert.deepEqual(host.read().workflow,baseline);
 catalog.register('provider',contributions);assert.equal(statuses.at(-1),'ready');release();assert.equal(catalog.list().length,2);
 assert.equal(editor.read()[0].id,'kept');session.dispose();
});
