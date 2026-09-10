const { test } = require('node:test');
const assert = require('node:assert/strict');
const cert = require('../features/codex-certificates.js');
test('number label includes year and ho without duplicating existing labels', () => {
  assert.equal(cert.certificateLabel('2026-0012','2026-09-10'),'제2026-0012호');
  assert.equal(cert.certificateLabel('12','2026-09-10'),'제2026-12호');
  assert.equal(cert.certificateLabel('제2026-12호','2026-09-10'),'제2026-12호');
  assert.equal(cert.certificateLabel(null,'2026-09-10'),'발급 시 자동 부여');
});
const row = (id, round, start, end, a, b) => ({ id, trainee_id: 'person', trainees: { name: '테스트' },
  part_a_completed: a, part_b_completed: b,
  courses: { round, start_date: start, end_date: end, course_type_id: 'drone', course_types: { name: '드론', has_parts: true } } });
test('A and B across rounds share one document and full training period', () => {
  const groups = cert.groupCompletions([row('a',3,'2026-08-22','2026-09-20',false,true),row('b',4,'2026-10-10','2026-11-08',true,false)]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].snapshot.courseNames.length,2);
  assert.equal(groups[0].snapshot.startDate,'2026-08-22');
  assert.equal(groups[0].snapshot.endDate,'2026-11-08');
  assert.deepEqual(groups[0].ids,['a','b']);
});
test('one part uses one course; unchecked parts cannot generate a certificate', () => {
  assert.equal(cert.groupCompletions([row('a',1,'2026-09-10',null,true,false)])[0].snapshot.courseNames.length,1);
  assert.equal(cert.groupCompletions([row('a',1,'2026-09-10',null,false,false)])[0].ids.length,0);
});
test('one-day course prints the date once', () => {
  assert.equal(cert.period({startDate:'2026-09-10',endDate:'2026-09-10'}),'2026. 09. 10.');
});

test('AB counts twice, duplicate registrations once per person round and part', () => {
  const a=row('a',1,'2026-09-10',null,true,true);
  assert.equal(cert.completionUnits([a]).length,2);
  assert.equal(cert.completionUnits([a,{...a,id:'duplicate'}]).length,2);
  assert.equal(cert.completionUnits([a,row('b',2,'2026-10-10',null,true,false)]).length,3);
  assert.equal(cert.completionUnits([row('c',1,'2026-09-10',null,false,false)]).length,0);
  assert.equal(new Set(cert.completionUnits([a]).map(x=>x.trainee_id)).size,1);
});
test('adding B to a previously completed A creates a distinct source identity', () => {
  const a=cert.groupCompletions([row('a',1,'2026-09-10',null,true,false)])[0];
  const ab=cert.groupCompletions([row('a',1,'2026-09-10',null,true,true)])[0];
  assert.notEqual(a.sourceKey,ab.sourceKey);
});
test('missing dates require correction rather than a guessed range', () => {
  const group = cert.groupCompletions([row('a',1,null,null,true,false)])[0];
  assert.equal(group.snapshot.startDate,'');
  assert.throws(()=>cert.validate({...group.snapshot,birthDate:'1990-01-01'}));
});
test('different applicants and ordinary repeated courses stay separate', () => {
  const a=row('a',1,'2026-09-10',null,true,false), b={...a,id:'b',trainee_id:'other'};
  assert.equal(cert.groupCompletions([a,b]).length,2);
  a.courses.course_types.has_parts=false;
  assert.equal(cert.groupCompletions([a,{...a,id:'c'}]).length,2);
});
test('invalid birthdays and reversed ranges are rejected', () => {
  const s={name:'테스트',birthDate:'1990-02-30',startDate:'2026-09-10',endDate:'2026-09-10',courseNames:['교육']};
  assert.throws(()=>cert.validate(s));
  assert.throws(()=>cert.validate({...s,birthDate:'1990-01-01',endDate:'2026-09-09'}));
});

test('certificate uses approved names without display names or part labels', () => {
  const a = row('a',1,'2026-09-10',null,true,true);
  Object.assign(a.courses.course_types, {certificate_part_a_name:'승인 과정 A',certificate_part_b_name:'승인 과정 B'});
  assert.deepEqual(cert.groupCompletions([a])[0].snapshot.courseNames,['승인 과정 A','승인 과정 B']);
  a.part_a_completed=false;
  assert.deepEqual(cert.groupCompletions([a])[0].snapshot.courseNames,['승인 과정 B']);
  a.courses.course_types.has_parts=false;
  a.courses.course_types.certificate_course_name='승인 단일 과정';
  assert.deepEqual(cert.groupCompletions([a])[0].snapshot.courseNames,['승인 단일 과정']);
});

test('missing approved names keep their slots and block issuance', () => {
  const a = row('a',1,'2026-09-10',null,true,true);
  a.courses.course_types.certificate_part_b_name='승인 B';
  const s=cert.groupCompletions([a])[0].snapshot;
  assert.deepEqual(s.courseNames,['','승인 B']);
  assert.throws(()=>cert.validate({...s,birthDate:'1990-01-01'}),/승인 과목명/);
});
