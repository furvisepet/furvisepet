// Opt-in transport for a disposable Docker database. One persistent psql session
// preserves transactions and request settings; this never connects to a host URL.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
export function dockerPostgres() {
 const container=process.env.FURVISE_TEST_CONTAINER;
 const database=process.env.FURVISE_TEST_DATABASE;
 if(!/^furvise-ask-validation-[a-z0-9-]+$/.test(container||'') || database!=='ask_continuation_validation')
  throw new Error('Explicit disposable validation container and database required');
 const child=spawn('docker',['exec','-i',container,'sh','-c',`exec psql -X -qAt -U postgres -d ${database} 2>&1`],{stdio:['pipe','pipe','pipe']});
 let buffer='',pending=null;
 child.stdout.on('data',chunk=>{
  buffer+=chunk.toString();
  if(!pending)return;
  const end=buffer.indexOf(pending.marker+'\n');
  if(end<0)return;
  const output=buffer.slice(0,end).trim(); buffer=buffer.slice(end+pending.marker.length+1);
  const job=pending;pending=null;clearTimeout(job.timer);
  if(/^(ERROR|FATAL):/m.test(output))job.reject(new Error(output));else job.resolve(output);
 });
 child.on('error',error=>{if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}});
 child.on('exit',code=>{if(pending){clearTimeout(pending.timer);pending.reject(new Error(`psql exited ${code}`));pending=null;}});
 const exec=sql=>new Promise((resolve,reject)=>{
  if(pending)return reject(new Error('Use separate connections for concurrent queries'));
  const marker='done_'+randomUUID().replaceAll('-','');
  const timer=setTimeout(()=>{child.kill();reject(new Error('Disposable SQL timeout'));},60000);
  pending={marker,resolve,reject,timer};
  child.stdin.write(`${sql}\n;\n\\echo ${marker}\n`);
 });
 const literal=value=>value===null?'null':Array.isArray(value)?`ARRAY[${value.map(literal).join(',')}]`:typeof value==='boolean'?String(value):typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
 return {
  exec,
  async query(sql,parameters=[]) {
   const bound=sql.replace(/\$(\d+)/g,(_,index)=>literal(parameters[Number(index)-1]));
   if(/^\s*select\b/i.test(bound)) {
    const output=await exec(`select coalesce(json_agg(audit_row),'[]') from (${bound.replace(/;\s*$/,'')}) audit_row;`);
    return {rows:JSON.parse(output.split('\n').filter(line=>line.startsWith('[')).at(-1))};
   }
   await exec(bound+';');return {rows:[]};
  },
  async close(){child.stdin.end('\\q\n');}
 };
}
