import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here=dirname(fileURLToPath(import.meta.url))
const root=join(here,'../..')
const origin='http://127.0.0.1:35793'
const chrome = process.env.CHROME_BINARY
assert.ok(chrome,'CHROME_BINARY must point to an installed, host-verified browser')
const vite=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--config',join(here,'vite.react19.config.mjs')],{
 cwd:root,env:{...process.env,CI:'true'},stdio:['ignore','pipe','pipe']
})
let stderr=''
vite.stderr.on('data',d=>{stderr+=(String(d));if(stderr.length>6000)stderr=stderr.slice(-6000)})
let browser
try{
 let ready=false
 for(let i=0;i<90;i++){
   try{const r=await fetch(origin+'/react19-fixture.html',{signal:AbortSignal.timeout(1500)});if(r.ok){ready=true;break}}catch{}
   if(vite.exitCode!==null)throw Error('Vite died: '+stderr.slice(-600))
   await sleep(1000)
 }
 assert.ok(ready,'Vite React19 fixture did not become ready: '+stderr.slice(-600))
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:900,height:700}})
 const errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/react19-fixture.html',{waitUntil:'networkidle',timeout:60000})
 await page.getByRole('heading',{name:/FitDesk React19 isolated/}).waitFor()
 const field=page.locator('input[type=tel]')
 await field.fill('2025550149')
 await page.waitForTimeout(700)
 let value=JSON.parse(await page.getByTestId('phone-value').innerText())
 assert.equal(value.phone_country,'US')
 assert.equal(value.phone_number,'2025550149')
 console.log('PASS | React19 PhoneInput real Chromium typing | controlled US phone persisted')
 await page.locator('#remote-phone-update').click()
 await page.waitForTimeout(250)
 value=JSON.parse(await page.getByTestId('phone-value').innerText())
 assert.equal(value.phone_country,'GB')
 assert.equal(value.phone_number,'7700900123')
 assert.ok((await field.inputValue()).replace(/\D/g,'').includes('7700900123'))
 console.log('PASS | React19 PhoneInput external controlled update | GB value displayed')
 const calendar=page.getByRole('region',{name:'Mini calendar'})
 await calendar.getByRole('button',{name:'Next month'}).click()
 assert.match(await calendar.innerText(),/November\s+2026/)
 console.log('PASS | React19 MiniCalendar local navigation | November rendered')
 await page.locator('#choose-december').click()
 assert.match(await calendar.innerText(),/December\s+2026/)
 assert.equal(await page.locator('#date-value').innerText(),'2026-12-15')
 const pressed=calendar.locator('button[aria-pressed=true]')
 assert.equal(await pressed.count(),1)
 assert.match(await pressed.getAttribute('aria-label'),/Dec 15 2026/)
 console.log('PASS | React19 MiniCalendar controlled external date | December 15 visibly selected')
 assert.deepEqual(errors,[],'browser React errors')
 console.log('BROWSER_REACT19_PASSED=4')
}finally{
 if(browser)await browser.close()
 vite.kill('SIGTERM')
}
