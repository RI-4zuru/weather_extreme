import test from 'node:test';
import assert from 'node:assert/strict';
import { assessProvisionalRank } from '../js/breaking-news.js';
const day = '2026-10-18';
const rain = [100,80,70,60,50,40,30,20,10,5].map((value,i)=>({value,date:`${2010+i}年6月1日`}));
test('crossing previous record is labelled top-1 update',()=>{
  assert.deepEqual(assessProvisionalRank(101,rain,'dailyPrecip',day),{rank:1,top1:true,tiedFirst:false});
});
test('equal first is rank-in but not a new record',()=>{
  assert.deepEqual(assessProvisionalRank(100,rain,'dailyPrecip',day),{rank:1,top1:false,tiedFirst:true});
});
test('does not label records outside top 10 as news',()=>{
  assert.equal(assessProvisionalRank(4,rain,'dailyPrecip',day),null);
});
test('same-day history is excluded: one bulletin not two',()=>{
  const records=[{value:110,date:'2026年10月18日 14:00 時点'}, ...rain];
  assert.deepEqual(assessProvisionalRank(111,records,'dailyPrecip',day),{rank:1,top1:true,tiedFirst:false});
});
test('low value is best for low-ranked metrics',()=>{
  const rows=[{value:10,date:'2015年2月1日'},{value:20,date:'2014年2月1日'}];
  assert.deepEqual(assessProvisionalRank(8,rows,'dailyMinHumidity',day),{rank:1,top1:true,tiedFirst:false});
});
test('same-month month ranking must compare date; no previous records => unknown',()=>{
  assert.equal(assessProvisionalRank(100,[{value:100,date:'2026年10月18日'}],'dailyPrecip',day),null);
});
test('invalid readings never trigger alerts',()=>{
  assert.equal(assessProvisionalRank(null,rain,'dailyPrecip',day),null);
  assert.equal(assessProvisionalRank(NaN,rain,'dailyPrecip',day),null);
});
