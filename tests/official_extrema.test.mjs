import assert from 'node:assert/strict';
import test from 'node:test';
import {choosePublishedExtremum,jstDay} from '../js/official-extrema.js';
import {LIVE_SUPPORTED_ANNUAL_KEYS,LIVE_SUPPORTED_MONTHLY_KEYS} from '../js/constants.js';

const latestIso='2026-11-08T16:40:00+09:00';
const official={value:17.2,observedAt:'2026-11-08T14:23:00+09:00',publishedAt:'2026-11-08T16:00:00+09:00',quality:8,sourceResolution:'minute'};
const snap=(key,obs=official)=>({schema:1,observedDate:'2026-11-08',stations:{'62078':{[key]:obs}}});
const choose=(key,metric,reference,observation=official,fallbackTime=latestIso)=>choosePublishedExtremum({snapshot:snap(metric,observation),stationCode:'62078',elementKey:key,latestIso,fallback:{value:reference,observedAt:fallbackTime,sourceResolution:'ten-minute'}});

test('JST day',()=>assert.equal(jstDay(latestIso),'2026-11-08'));
test('JMA minute occurrence replaces older ten-minute max',()=>{
  const x=choose('dailyMaxTempLow','dailyMaxTemp',17.0);
  assert.equal(x.value,17.2);assert.equal(x.observedAt,official.observedAt);assert.equal(x.sourceResolution,'minute');
});
test('daily minimum is compared as a meteorological minimum regardless of ranking direction',()=>{
  const x=choose('dailyMinTempHigh','dailyMinTemp',11.5,{...official,value:11.4});
  assert.equal(x.value,11.4);
});
test('newer more extreme ten-minute observation overrides previous official as-of value',()=>{
  const x=choose('dailyMaxTempHigh','dailyMaxTemp',18.0);
  assert.equal(x.value,18.0);assert.equal(x.sourceResolution,'ten-minute');
});
test('same value or earlier ten-minute record does not supersede official',()=>{
  assert.equal(choose('dailyMaxTempHigh','dailyMaxTemp',18,official,'2026-11-08T15:40:00+09:00').value,17.2);
  assert.equal(choose('dailyMaxTempHigh','dailyMaxTemp',17.2).sourceResolution,'minute');
});
test('daily precipitation uses published as-of marker and later ten-minute sum overrides',()=>{
  const pub={...official,value:12.5,observedAt:'2026-11-08T16:00:00+09:00',sourceResolution:'official-asof'};
  assert.equal(choose('dailyPrecip','dailyPrecip',12,pub).sourceResolution,'official-asof');
  assert.equal(choose('dailyPrecip','dailyPrecip',13,pub).value,13);
});
test('official 3-72h precipitation supports month and annual rankings',()=>{
  for(const hours of [3,6,12,24,48,72]){
    const key=`monthMax${hours}hPrecip`, metric=`max${hours}hPrecip`;
    assert.ok(LIVE_SUPPORTED_MONTHLY_KEYS.has(key));
    assert.ok(LIVE_SUPPORTED_ANNUAL_KEYS.has(key));
    const x=choose(key,metric,0,{...official,value:45,sourceResolution:'ten-minute-official'});
    assert.equal(x.value,45);assert.equal(x.sourceResolution,'ten-minute-official');
  }
});
test('incorrect day or poor quality rejected',()=>{
  assert.equal(choose('dailyMaxWind','dailyMaxWind',16,{...official,quality:4}).value,16);
  assert.equal(choose('dailyMaxWind','dailyMaxWind',16,{...official,publishedAt:'2026-11-07T23:00:00+09:00'}).value,16);
});
test('table labels distinguish published minute, ten-minute and as-of sources', async()=>{
  const {renderTable}=await import('../js/renderers.js');
  const row={stationName:'大阪',startDate:'1900年',ranks:[{value:17.2,date:official.observedAt,isLiveRank:true,sourceResolution:'minute'}],liveCandidate:{value:17.2,observedAt:official.observedAt,sourceResolution:'minute',supported:true}};
  const body={innerHTML:''};renderTable(body,[row],{showLiveColumn:true});
  assert.match(body.innerHTML,/公表・分/);assert.match(body.innerHTML,/14:23/);
  row.ranks[0].sourceResolution='ten-minute-official';row.liveCandidate.sourceResolution='ten-minute-official';
  renderTable(body,[row],{showLiveColumn:true});assert.match(body.innerHTML,/公表・10分/);
  row.ranks[0].sourceResolution='official-asof';row.liveCandidate.sourceResolution='official-asof';
  renderTable(body,[row],{showLiveColumn:true});assert.match(body.innerHTML,/公表・時点/);
});
