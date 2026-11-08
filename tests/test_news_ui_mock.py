import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
html=Path('/mnt/data/extreme_work/news-window.html').read_text(encoding='utf-8')
# Browser test fixture: set_content uses about:blank; provide an origin only for URL creation.
html=html.replace("new URL('./index.html',location.href)","new URL('./index.html','https://example.invalid/weather_extreme/news-window.html')")
items=[
 dict(prefKey='osaka',region='近畿',prefName='大阪府',stationName='枚方',elementKey='dailyMinHumidity',elementLabel='日最小相対湿度',elementOrder=31,month='all',rank=1,top1=True,value=5,unit='%',observedAt='2026-10-18T14:40:00+09:00'),
 dict(prefKey='osaka',region='近畿',prefName='大阪府',stationName='豊中',elementKey='dailyPrecip',elementLabel='日降水量',elementOrder=1,month='10',rank=5,top1=False,value=12,unit='mm',observedAt='2026-10-18T14:40:00+09:00'),
 dict(prefKey='osaka',region='近畿',prefName='大阪府',stationName='堺',elementKey='dailyPrecip',elementLabel='日降水量',elementOrder=1,month='all',rank=4,top1=False,value=20,unit='mm',observedAt='2026-10-18T14:40:00+09:00'),
 dict(prefKey='osaka',region='近畿',prefName='大阪府',stationName='大阪',elementKey='dailyPrecip',elementLabel='日降水量',elementOrder=1,month='all',rank=2,top1=False,value=18,unit='mm',observedAt='2026-10-18T14:40:00+09:00'),
 dict(prefKey='osaka',region='近畿',prefName='大阪府',stationName='枚方',elementKey='dailyPrecip',elementLabel='日降水量',elementOrder=1,month='10',rank=1,top1=True,value=21,unit='mm',observedAt='2026-10-18T14:40:00+09:00'),
]
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await b.new_page(viewport={'width':1410,'height':760})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html)
  await page.evaluate('''(items)=>{
    Object.defineProperty(window,'opener',{value:window,configurable:true});
    window.dispatchEvent(new MessageEvent('message',{data:{wxNewsWindow:true,kind:'reports',reports:[{scope:{label:'大阪府'},status:'ready',items,scannedAt:'2026-10-18T14:40:00+09:00'}]},source:window,origin:'null'}))
  }''',items)
  assert await page.locator('#annualList tbody tr').count()==3
  assert await page.locator('#monthlyList tbody tr').count()==2
  assert await page.locator('nav button').count()==2
  assert (await page.locator('#annualList .station-name').all_inner_texts())[-1]=='枚方' or (await page.locator('#annualList .station-name').all_inner_texts())[-1]=='大阪'
  print('station sort',await page.locator('#annualList .station-name').all_inner_texts())
  href=await page.locator('#annualList tbody tr').first.locator('a.jump').get_attribute('href')
  assert 'news_pref=osaka' in href and 'news_month=all' in href and 'news_element=dailyPrecip' in href
  widths=await page.locator('#annualList tbody tr .value').evaluate_all('(els)=>els.map(el=>el.getBoundingClientRect().right)')
  assert max(widths)-min(widths)<1.0, widths
  await page.screenshot(path='/mnt/data/extreme_work/tests/news_v3_preview.png')
  await page.locator('[data-filter="top"]').click()
  assert await page.locator('#annualList tbody tr').count()==1
  assert await page.locator('#monthlyList tbody tr').count()==1
  await page.locator('[data-filter="all"]').click()
  assert await page.locator('#annualList tbody tr').count()==3
  assert not errors,errors
  print('PASS: annual 3/month 2, element -> station sort, link query, aligned value columns, toggles')
  print('table href',href)
  await b.close()
asyncio.run(main())
