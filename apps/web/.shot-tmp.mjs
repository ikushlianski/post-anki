import { chromium } from 'playwright'
const routes={home:'/',login:'/login',review:'/knowledge/review',knowledge:'/knowledge',inbox:'/knowledge/inbox',subjects:'/subjects',settings:'/admin-settings',today:'/today'}
const b=await chromium.launch()
for (const [w,h] of [[1440,900],[390,844]]) {
 const p=await b.newPage({viewport:{width:w,height:h}})
 for (const [n,u] of Object.entries(routes)) {
  await p.goto('http://localhost:5540'+u,{waitUntil:'networkidle'}).catch(()=>{})
  await p.waitForTimeout(1200)
  console.log(n,w,p.url())
  await p.screenshot({path:'/private/tmp/claude-501/-Users-ikushlianski-webdata-ilya-projects-post-anki/d25ce310-b3f3-4bff-9063-c57b74790109/scratchpad/web-audit-'+n+'-'+w+'.png',fullPage:true})
 }
}
await b.close()
