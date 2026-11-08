import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveValuesForStations } from '../js/live-source.js';
import { state } from '../js/state.js';
import fs from 'node:fs';

const iso='2026-11-08T16:40:00+09:00';
const official={value:62,observedAt:'2026-11-08T15:30:00+09:00',publishedAt:'2026-11-08T16:30:00+09:00',quality:8,sourceResolution:'ten-minute-official'};

test('hidden 3-72h rain elements are selectable in annual AND monthly lists',()=>{
  const all=JSON.parse(fs.readFileSync(new URL('../config/elements.json',import.meta.url),'utf8'));
  for(const type of ['annualElements','monthlyElements']){
    for(const h of [3,6,12,48,72]) {
      const item=all[type].find(x=>x.key===`monthMax${h}hPrecip`);
      assert.ok(item,`${type} ${h}h`);assert.equal(item.hidden,false);
    }
    // 24h has an existing, equivalent max24hPrecip entry; avoid duplicate menus and news.
    assert.equal(all[type].find(x=>x.key==='max24hPrecip')?.hidden,false);
    assert.equal(all[type].find(x=>x.key==='monthMax24hPrecip')?.hidden,true);
  }
});

test('official-only rain data does not require per-station JMA point downloads',async()=>{
  const saved=globalThis.fetch;
  state.latestTimeCache={iso:'',fetchedAt:0};
  const requested=[];
  globalThis.fetch=async (input)=>{
    const uri=String(input);requested.push(uri);
    if(uri.includes('latest_time.txt'))return {ok:true,text:async()=>iso};
    if(uri.includes('official_extrema.json'))return {ok:true,json:async()=>({schema:1,observedDate:'2026-11-08',stations:{'62078':{max24hPrecip:official}}})};
    throw new Error('Unexpected fetch '+uri);
  };
  try {
    const result=await buildLiveValuesForStations({stationCodes:['62078'],elementKey:'monthMax24hPrecip',month:'11'});
    assert.equal(result.support,'supported');
    assert.equal(result.valuesByCode['62078'].value,62);
    assert.equal(result.valuesByCode['62078'].sourceResolution,'ten-minute-official');
    assert.ok(!requested.some(x=>x.includes('/point/')));
  }finally{globalThis.fetch=saved;}
});
