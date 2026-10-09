import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
// LOCAL, DISPOSABLE fixture ONLY. Never run against any public/nonloopback origin.
const origin = process.env.PHASE2_FIXTURE_ORIGIN
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/, 'loopback-only fixture')
const checks=[]
const pass=(name, result)=>{checks.push(name);console.log('PASS | '+name+' | '+result)}
const http=(path,init={})=>fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(10000),...init})
const loc=r=>new URL(r.headers.get('location')??'/',origin)
let ready=false
for(let i=0;i<75;i++){try{const r=await http('/api/health');if(r.ok){ready=true;break}}catch{}await delay(1000)}
assert.ok(ready,'nonproduction container did not pass health check')
pass('health','HTTP 200')
for(const route of ['/dashboard','/dashboard/sessions','/dashboard/clients']){
 const r=await http(route);assert.equal(r.status,307,route+' must deny anonymous access')
 const u=loc(r);assert.equal(u.pathname,'/auth/login');assert.equal(u.searchParams.get('callbackUrl'),route)
 pass('Proxy live '+route,'307 redirect to login, callback intact')
}
for(const [route,method] of [['/api/workspace/retry','POST'],['/api/controlplane/jobs/no-such-job','GET'],['/api/controlplane/jobs/no-such-job','POST']]){
 const r=await http(route,{method});assert.equal(r.status,401,route+' rejects unsigned request');pass(method+' '+route,'401')
}
const email='phase2-test-'+Date.now()+'@example.invalid'
const registration=await http('/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name:'Synthetic Fixture',email,password:'Synthetic-only-local-password-Strong-1234!'})})
assert.ok(registration.ok,'fixture signup failed status '+registration.status)
const cookies=typeof registration.headers.getSetCookie==='function'?registration.headers.getSetCookie():[registration.headers.get('set-cookie')].filter(Boolean)
const sessionCookie=cookies.find(v=>/session_token=/.test(v))
assert.ok(sessionCookie,'no session cookie issued')
const attrs=sessionCookie.toLowerCase().split(';').map(x=>x.trim())
assert.ok(attrs.includes('httponly'),'missing HttpOnly')
assert.ok(attrs.includes('samesite=lax')||attrs.includes('samesite=strict'),'missing SameSite=Lax/Strict')
const cookie=sessionCookie.split(';',1)[0]
pass('Better Auth real cookie',attrs.filter(x=>/^(httponly|secure|samesite=)/.test(x)).join(','))
const session=await http('/api/auth/get-session',{headers:{cookie}})
assert.equal(session.status,200);const profile=await session.json();assert.equal(profile?.user?.email,email)
pass('Cookie resolves local auth session','200 signed-in session')
const r=await http('/dashboard/sessions',{headers:{cookie}})
assert.equal(r.status,307);assert.equal(loc(r).pathname,'/onboarding')
pass('Authenticated but not provisioned','307 onboarding')
for(const route of ['/api/workspace/retry','/api/controlplane/jobs/no-such-job']){
 const r=await http(route,{method:'POST',headers:{cookie,origin:'https://foreign-origin.invalid'}})
 assert.equal(r.status,403,'authenticated cross-origin POST must be explicitly blocked '+route)
 pass('Authenticated cross-origin POST denied '+route,'HTTP 403 strict Origin enforcement')
 const sameOrigin=await http(route,{method:'POST',headers:{cookie,origin}})
 assert.equal(sameOrigin.status,404,'authorized same-origin request should reach owner-scoped record lookup')
 pass('Authenticated same-origin nonexistent job '+route,'HTTP 404 owner-scoped lookup')
}
console.log('CAUTION | Manually injecting Cookie bypasses browser SameSite; 404 does not prove CSRF rejected.')
console.log('PASSED_CHECKS='+checks.length)
