import assert from 'node:assert/strict';
import test from 'node:test';
import {choosePublishedExtremum, jstDay} from '../js/official-extrema.js';

const latestIso='2026-11-08T16:40:00+09:00';
const official={value:17.2,observedAt:'2026-11-08T14:23:00+09:00',publishedAt:'2026-11-08T16:00:00+09:00',quality:8};
const snap=(key, obs=official)=>({schema:1,observedDate:'2026-11-08',stations:{'62078':{[key]:obs}}});
const choose=(elementKey, dataset, fallbackValue, obs=official, now=latestIso)=>choosePublishedExtremum({snapshot:snap(dataset,obs), stationCode:'62078', elementKey, latestIso:now, fallback:{value:fallbackValue,observedAt:now,sourceResolution:'ten-minute'}});

test('JST day interpretation works with +09:00',()=>assert.equal(jstDay(latestIso),'2026-11-08'));
test('published minute-level occurrence replaces lower ten-minute max',()=>{
  const result=choose('dailyMaxTempLow','dailyMaxTemp',17.0);
  assert.equal(result.value,17.2); assert.equal(result.observedAt,'2026-11-08T14:23:00+09:00');
  assert.equal(result.sourceResolution,'minute');
});
test('comparison is meteorological MAX even for low-daily-maximum ranking',()=>{
  const result=choose('dailyMaxTempLow','dailyMaxTemp',17.0);
  assert.equal(result.value,17.2);
});
test('comparison is meteorological MIN even for high-daily-minimum ranking',()=>{
  const x={...official,value:11.4};
  const result=choose('dailyMinTempHigh','dailyMinTemp',11.5,x);
  assert.equal(result.value,11.4); assert.equal(result.sourceResolution,'minute');
});
test('newer more-extreme ten-minute value is not discarded by older published snapshot',()=>{
  const result=choose('dailyMaxWind','dailyMaxWind',18.0);
  assert.equal(result.value,18.0); assert.equal(result.sourceResolution,'ten-minute');
});
test('outdated or low quality source is not used',()=>{
  assert.equal(choose('dailyMaxWind','dailyMaxWind',16.0,{...official,quality:4}).value,16.0);
  assert.equal(choose('dailyMaxWind','dailyMaxWind',16.0,{...official,publishedAt:'2026-11-07T23:00:00+09:00'}).value,16.0);
  assert.equal(choose('dailyMaxWind','dailyMaxWind',16.0,official,'2026-11-09T16:00:00+09:00').value,16.0);
});
test('unsupported metrics remain ten-minute reference',()=>{
  assert.equal(choose('dailyMinHumidity','dailyMaxTemp',30).value,30);
});

test('ranking cell and live column show a clear occurrence-time marker', async()=>{
  const {renderTable} = await import('../js/renderers.js');
  const body = {innerHTML:''};
  renderTable(body,[{
    stationName:'大阪',startDate:'1900年',
    ranks:[{value:17.2,date:official.observedAt,isLiveRank:true,sourceResolution:'minute'}],
    liveCandidate:{value:17.2,observedAt:official.observedAt,sourceResolution:'minute',supported:true},
  }],{showLiveColumn:true});
  assert.match(body.innerHTML,/公表・分/);
  assert.match(body.innerHTML,/起時/);
  assert.match(body.innerHTML,/14:23/);
});

test('fallback ranking shows 10-minute marker', async()=>{
  const {renderTable} = await import('../js/renderers.js');
  const body = {innerHTML:''};
  renderTable(body,[{
    stationName:'大阪',startDate:'1900年',
    ranks:[{value:17.0,date:latestIso,isLiveRank:true,sourceResolution:'ten-minute'}],
  }]);
  assert.match(body.innerHTML,/>10分</);
  assert.doesNotMatch(body.innerHTML,/>公表・分</);
});
