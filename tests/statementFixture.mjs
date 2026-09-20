import {addNodeToGraph,addEdgeToGraph,createNodalGraphDocument,createWorkflowFromNodalGraph} from '@konitif/nodal';
export function statementScenario(){
 const port=id=>({id,label:id,dataType:'object',mode:'value'});
 const dialect={id:'statements',title:'Statements',nodeRegistry:[
  {type:'start',title:'Start',inputs:[port('actions')],outputs:[],defaultConfig:{}},
  {type:'group',title:'Group',inputs:[port('trigger'),port('body')],outputs:[port('done')],defaultConfig:{}},
  {type:'action',title:'Action',inputs:[port('trigger')],outputs:[port('done')],defaultConfig:{label:'Action'}},
  {type:'delay',title:'Delay',inputs:[port('trigger'),{id:'seconds',label:'Seconds',mode:'value',dataType:'number'}],outputs:[port('done')],defaultConfig:{seconds:1}},
  {type:'number',title:'Number',inputs:[],outputs:[{id:'value',label:'Value',mode:'value',dataType:'number'}],defaultConfig:{value:1}}
 ]};
 const contributions=dialect.nodeRegistry.map(d=>({id:d.type,dialectId:dialect.id,nodeType:d.type,
  fields:Object.keys(d.defaultConfig).map(configKey=>({configKey,label:configKey,editor:typeof d.defaultConfig[configKey]==='number'?'number':'text'})),
  ...(d.type==='number'?{}:{statement:{...(d.type==='start'?{}:{previous:'trigger',next:'done'}),check:'actions',
   containers:d.type==='start'?[{portId:'actions',label:'Actions'}]:d.type==='group'?[{portId:'body',label:'Body'}]:[]}})
 }));
 let graph=createNodalGraphDocument({dialect:dialect.id});
 const ids={};
 for(const [id,nodeType] of [['start','start'],['group','group'],['a','action'],['b','action'],['c','action'],['delay','delay'],['number','number']]){
  const result=addNodeToGraph(graph,dialect,{nodeType,position:{x:0,y:0},config:nodeType==='action'?{label:id.toUpperCase()}:{}});
  graph=result.graph;ids[id]=result.nodeId;
 }
 for(const [source,target,portId,sourcePortId='done'] of [['a','b','trigger'],['b','c','trigger'],['c','group','body'],['group','delay','trigger'],['delay','start','actions'],['number','delay','seconds','value']]){
  graph=addEdgeToGraph(graph,dialect,{sourceNodeId:ids[source],sourcePortId,targetNodeId:ids[target],targetPortId:portId}).graph;
 }
 return{snapshot:{revision:'one',workflow:createWorkflowFromNodalGraph(graph),dialect},contributions,ids};
}
