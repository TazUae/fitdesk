import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { setTimeout as delay } from 'node:timers/promises'

const target='http://127.0.0.1:3000'
const chrome=process.env.CHROME_BINARY
assert.ok(chrome,'Use verified local Chrome binary')
for(let i=0;i<50;i++){
  try{if((await fetch(target+'/api/health')).ok)break}catch{}
  if(i===49)throw Error('Disposable Next server unavailable')
  await delay(1000)
}
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox']})
try{
  const context=await browser.newContext()
  const email='phase2-browser-'+Date.now()+'@example.invalid'
  const r=await context.request.post(target+'/api/auth/sign-up/email',{
    headers:{origin:target},
    data:{name:'CSRF Synthetic Account',email,password:'Local-only-SafePassword12345-Strong!'}
  })
  assert.ok(r.ok(),'Real auth sign-up failed: '+r.status())
  const cookies=await context.cookies(target)
  const token=cookies.find(c=>/session_token/.test(c.name))
  assert.ok(token,'Better Auth did not persist browser cookie')
  assert.equal(token.sameSite,'Lax')
  assert.equal(token.httpOnly,true)
  console.log('PASS | Chromium stored real Better Auth session | HttpOnly and SameSite=Lax')
  const page=await context.newPage()
  let res=await page.goto(target+'/auth/login',{waitUntil:'domcontentloaded'})
  assert.equal(res?.status(),200)
  await page.locator('input').first().waitFor({timeout:10000})
  console.log('PASS | React19 public login page hydrates in real Chromium | 200 + interactive inputs')
  res=await page.goto('http://localhost:3000/api/health',{waitUntil:'domcontentloaded'})
  assert.equal(res?.status(),200)
  let captured=null
  await page.route('**/api/workspace/retry',async route=>{
    captured=await route.request().allHeaders()
    await route.continue()
  })
  await page.evaluate(async()=> {
    try {await fetch('http://127.0.0.1:3000/api/workspace/retry',{method:'POST',credentials:'include',mode:'no-cors'})}
    catch{}
  })
  assert.ok(captured,'Cross-site browser request not observed')
  assert.equal(captured.cookie??'','', 'Browser sent SameSite=Lax session cookie on cross-site POST')
  console.log('PASS | Real Chromium cross-site POST | session cookie withheld by SameSite=Lax')
  console.log('CSRF_SCOPE | Browser SameSite test only; same-site subdomain attacks and explicit Origin/CSRF enforcement require separate review')
}finally{await browser.close()}
