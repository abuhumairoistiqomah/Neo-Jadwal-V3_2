import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRphSuggestions,parseRphRows,normalizeCalendarDate,coveredClassIds,canPublishCalendarProposal,type CalendarProposal} from '../domain/operationalCalendarV319';
const make = (changes:Partial<CalendarProposal>={}):CalendarProposal => ({id:'p',start:'2026-09-21',end:'2026-09-21',label:'Trip',scope:'IKHWAN',disposition:'NO_KBM',eventType:'Kegiatan',classIds:[],periodStart:null,periodEnd:null,source:'Test',...changes});
test('RC1 RPH templates contain scope-specific field trips and do not treat compensatory teacher leave as general holidays',()=>{
 const rows=makeRphSuggestions();
 assert.equal(rows.find(r=>r.label==='Field Trip Ikhwan')?.scope,'IKHWAN');
 assert.equal(rows.find(r=>r.label==='Field Trip Akhwat')?.scope,'AKHWAT');
 assert.equal(rows.some(r=>r.label.toLowerCase().includes('libur pengganti')),false);
 assert.equal(rows.find(r=>r.label.includes('25/'))?.disposition,undefined);
 assert.equal(rows.find(r=>r.start==='2026-08-25')?.disposition,'REVIEW');
});
test('RC1 Excel serial and Indonesian dates are parsed strictly',()=>{
 assert.equal(normalizeCalendarDate('19/10/2026'),'2026-10-19');
 assert.equal(normalizeCalendarDate('2026-02-30'),null);
 assert.equal(normalizeCalendarDate(46314),'2026-10-19');
});
test('RC1 importer ignores v/X columns and active school rows',()=>{
 const result=parseRphRows([{Tanggal:'20/07/2026',Keterangan:'Hari pertama KBM', 'Kelas 1':'X'}, {Tanggal:'21/09/2026',Keterangan:'Field Trip', 'Kelas 1':'v'}, {Tanggal:'22/09/2026',Keterangan:''}]);
 assert.equal(result.proposals.length,1);
 assert.equal(result.skipped,2);
 assert.equal(result.proposals[0].disposition,'REVIEW');
});
test('RC1 class coverage derives gender from exact class rows, never from teacher schedule',()=>{
 const classes=[{id:'a',gender:'IKHWAN'},{id:'b',gender:'AKHWAT'},{id:'c',gender:'IKHWAN'}];
 assert.deepEqual(coveredClassIds(make(),classes),['a','c']);
 assert.deepEqual(coveredClassIds(make({scope:'CLASS',classIds:['b']}),classes),['b']);
 assert.deepEqual(coveredClassIds(make({scope:'ALL'}),classes),['a','b','c']);
});
test('RC1 operational rules fail closed on review and no matched scoped classes',()=>{
 assert.match(canPublishCalendarProposal(make({disposition:'REVIEW'}),1)||'',/Review|review/);
 assert.match(canPublishCalendarProposal(make(),0)||'',/Cakupan/);
 assert.equal(canPublishCalendarProposal(make(),2),null);
 assert.match(canPublishCalendarProposal(make({start:'2026-12-31',end:'2026-01-01'}),2)||'',/Tanggal/);
});
test('RC1 uses RLS and existing academic calendar RPC for publication, separate from education calendar',()=>{
 const sql=readFileSync('supabase/migrations/202610200001_v3_19_rc1_operational_term.sql','utf8');
 const ui=readFileSync('src/components/OperationalCalendarV319Admin.tsx','utf8');
 const app=readFileSync('src/App.tsx','utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/current_user_is_staff/);
 assert.match(ui,/saveAcademicEventGroup\(/);
 assert.match(ui,/window\.confirm\(/);
 assert.match(app,/operational-calendar/);
 assert.doesNotMatch(ui,/education_calendar_events/);
});
