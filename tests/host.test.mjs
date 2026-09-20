import test from 'node:test';
import assert from 'node:assert/strict';
import {createBehaviorStudioNodalBlocklyHost} from '../test-support/productNodalBlocklyHost.mjs';
import {getBehaviorStudioToolsForProfile,validateBehaviorStudioToolCatalog} from '../test-support/toolCatalog.js';
import {createHost} from './fixtures.mjs';
test('prepared product host rejects stale subjects and preserves product fields on canonical publication',()=>{
 const base=createHost().read();let artifact={id:'artifact',revision:2,workflow:base.workflow,execution:{dialectId:base.dialect.id},poseConfiguration:{keep:'product'}};let publishes=0,refuse=false;
 const host=createBehaviorStudioNodalBlocklyHost({read:()=>artifact,subscribe:()=>()=>{},resolveDialect:()=>base.dialect,publish(candidate){if(refuse)return{accepted:false,diagnostics:[{message:'host policy'}]};publishes++;artifact={...candidate,revision:artifact.revision+1};return{accepted:true,diagnostics:[]};}});
 const snapshot=host.read();assert.equal(host.commit({baseRevision:'stale',workflowId:base.workflow.id,candidate:base.workflow}).accepted,false);
 assert.equal(host.commit({baseRevision:snapshot.revision,workflowId:base.workflow.id,candidate:{...base.workflow,id:'different'}}).accepted,false);assert.equal(publishes,0);
 assert.equal(host.commit({baseRevision:snapshot.revision,workflowId:base.workflow.id,candidate:{...base.workflow,title:'Edited'}}).accepted,true);assert.equal(artifact.workflow.title,'Edited');assert.deepEqual(artifact.poseConfiguration,{keep:'product'});
 const current=host.read();refuse=true;assert.equal(host.commit({baseRevision:current.revision,workflowId:current.workflow.id,candidate:current.workflow}).accepted,false);assert.equal(publishes,1);
 assert.equal(host.runtime,undefined);
});
test('prepared catalog admits one multi-instance Nodal Blockly Tool in the product profile',()=>{
 assert.deepEqual(validateBehaviorStudioToolCatalog(),[]);
 const entries=getBehaviorStudioToolsForProfile('behavior').filter(t=>t.id==='konitif.nodal-blockly');
 assert.equal(entries.length,1);assert.equal(entries[0].instancePolicy,'multi-instance');assert.equal(entries[0].implementationBindingKey,'konitif.nodal-blockly');
});
