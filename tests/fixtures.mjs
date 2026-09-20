import { createNodalGraphDocument, createWorkflowFromNodalGraph } from '@konitif/nodal';
import { commitWorkflowComposition } from '@konitif/composition';
export const dialect = {
  id:'test.values', title:'Test values', nodeRegistry:[
    {type:'test:number',title:'Number',description:'Reference only',inputs:[],outputs:[{id:'value',label:'Value',dataType:'number',mode:'value'}],defaultConfig:{value:2,opaque:'kept'},execute:({node})=>({outputs:{value:node.config.value}})},
    {type:'test:sum',title:'Sum',description:'Reference only',inputs:[{id:'a',label:'A',dataType:'number',mode:'value'},{id:'b',label:'B',dataType:'number',mode:'value'}],outputs:[{id:'value',label:'Result',dataType:'number',mode:'value'}],defaultConfig:{},execute:({resolvedInputs})=>({outputs:{value:Number(resolvedInputs.a??0)+Number(resolvedInputs.b??0)}})}
  ]
};
export const contributions=[
  {id:'test.number',dialectId:dialect.id,nodeType:'test:number',fields:[{configKey:'value',label:'Value',editor:'number'}]},
  {id:'test.sum',dialectId:dialect.id,nodeType:'test:sum'}
];
export const number=(id,value)=>({id,contributionId:'test.number',fields:{value},inputs:{}});
export const sum=(id,a,b)=>({id,contributionId:'test.sum',fields:{},inputs:{a,b}});
export function createHost(){
  const workflow=createWorkflowFromNodalGraph(createNodalGraphDocument({id:'fixture',dialect:dialect.id}));
  workflow.metadata.keep={opaque:true};workflow.composition.metadata={keep:'composition'};
  let revision=0,current=workflow, commits=0, refuses=false;
  const listeners=new Set();
  return {
    read:()=>({workflow:structuredClone(current),revision:String(revision),dialect}),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    commit(request){
      if(refuses)return{accepted:false,reason:'host-refused'};
      if(request.baseRevision!==String(revision)||request.workflowId!==current.id)return{accepted:false,reason:'source-changed'};
      const result=commitWorkflowComposition(current,request.candidate);
      if(!result.accepted)return{accepted:false,reason:'canonical-refused'};
      current=result.workflow;revision++;commits++;for(const fn of [...listeners])fn();return{accepted:true};
    },
    invalidate(){revision++;for(const fn of [...listeners])fn();},
    refuse(value){refuses=value;},
    get listeners(){return listeners.size;},get commits(){return commits;}
  };
}
export function fakeEditor(){
  let reading=[],listeners=new Set();return{
    disposed:false,renders:0,
    render(projection){reading=structuredClone(projection.blocks);this.renders++;},
    read(){return structuredClone(reading);},
    onSemanticChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    edit(next){reading=structuredClone(next);for(const fn of [...listeners])fn();},
    resize(){},dispose(){this.disposed=true;listeners.clear();}
  };
}
