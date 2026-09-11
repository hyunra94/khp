const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('completion sends email only on explicit opt-in; old clients and nonadmins cannot send',async()=>{
 const source=fs.readFileSync('supabase/functions/notify-status-change/index.ts','utf8');
 const handler=source.slice(source.indexOf('Deno.serve(')).replace('req: Request','req').replaceAll('(app as any)','app').replace(' as string','');
 let run,admin=true,sent=[];
 const ctx={Deno:{serve:fn=>run=fn},Response,CORS_HEADERS:{},json:(body,status=200)=>({body,status}),FALLBACK_TEMPLATES:{'수료':{subject:'test',body:'test'}},ATTACH_ON_STATUSES:[],
  sb:{auth:{getUser:async()=>({data:{user:{email:'test@example.invalid'}}})},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='admins'?(admin?{}:null):{status:'수료',trainees:{email:'test@example.invalid',phone:'01000000000'},courses:{name:'test'},trainee_id:'t'}})})})})},
  getTemplate:async()=>null,isChannelEnabled:async()=>true,sendEmail:async()=>{sent.push('email');return {ok:true};},sendSms:async()=>{sent.push('sms');return {ok:true};},logNotification:async()=>{},applyVars:x=>x,toHtml:x=>x};
 vm.createContext(ctx);vm.runInContext(handler,ctx);
 const request=body=>new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)});
 const skipped=await run(request({applicationId:'a'}));assert.equal(skipped.body.skipped,true);assert.deepEqual(sent,[]);
 await run(request({applicationId:'a',notifyCompletion:true}));assert.deepEqual(sent,['email']);
 admin=false;assert.equal((await run(request({applicationId:'a',notifyCompletion:true}))).status,403);assert.deepEqual(sent,['email']);
});
