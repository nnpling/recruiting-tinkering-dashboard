import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recruitingValues, recruitingChanges, renderRecruitingDetails,
} from '../dist/recruiting-details.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[character]));
const helpers = {e:escape, icon:() => '<svg aria-hidden="true"></svg>'};
const fixtures = () => ({
  application:Object.freeze({
    application_id:'app_test', candidate_id:'candidate_test', job_id:'job_test',
    source:'referral', salary_expectation:0, salary_currency:'USD',
    notice_period_days:0, available_start_date:'2026-11-02', application_status:'active',
  }),
  candidate:Object.freeze({
    candidate_id:'candidate_test', source:'direct_application', location:'TP. Hồ Chí Minh',
    open_to_work_status:'unknown', notes:'Ghi chú gốc\nGiữ xuống dòng.',
  }),
});

test('recruiting values read the correct Candidate or Application without changing either record', () => {
  const {application, candidate} = fixtures(), before = structuredClone({application, candidate});
  assert.deepEqual(recruitingValues('source', application, candidate), {source:'referral'});
  assert.deepEqual(recruitingValues('source', {...application, source:''}, candidate), {source:''});
  assert.deepEqual(recruitingValues('source', {...application, source:undefined}, candidate), {source:'direct_application'});
  assert.deepEqual(recruitingValues('source', {...application, source:null}, candidate), {source:'direct_application'});
  assert.deepEqual(recruitingValues('location', application, candidate), {location:'TP. Hồ Chí Minh'});
  assert.deepEqual(recruitingValues('salary', application, candidate), {salary_expectation:0, salary_currency:'USD'});
  assert.deepEqual(recruitingValues('notice_period_days', application, candidate), {notice_period_days:0});
  assert.deepEqual(recruitingValues('available_start_date', application, candidate), {available_start_date:'2026-11-02'});
  assert.deepEqual(recruitingValues('open_to_work_status', application, candidate), {open_to_work_status:'unknown'});
  assert.deepEqual(recruitingValues('notes', application, candidate), {notes:candidate.notes});
  assert.deepEqual({application, candidate}, before);
});

test('recruiting changes target only the correct table and preserve note formatting', () => {
  const cases = [
    ['source', {source:'linkedin'}, {table:'Applications', changes:{source:'linkedin'}}],
    ['location', {location:'  Hà Nội  '}, {table:'Candidates', changes:{location:'Hà Nội'}}],
    ['notice_period_days', {notice_period_days:'30'}, {table:'Applications', changes:{notice_period_days:30}}],
    ['available_start_date', {available_start_date:'2026-11-02'}, {table:'Applications', changes:{available_start_date:'2026-11-02'}}],
    ['open_to_work_status', {open_to_work_status:'verified'}, {table:'Candidates', changes:{open_to_work_status:'verified'}}],
    ['notes', {notes:'  Giữ khoảng trắng\nVà xuống dòng.  '}, {table:'Candidates', changes:{notes:'  Giữ khoảng trắng\nVà xuống dòng.  '}}],
  ];
  for (const [field, values, expected] of cases) {
    const before = structuredClone(values);
    assert.deepEqual(recruitingChanges(field, Object.freeze(values)), expected);
    assert.deepEqual(values, before);
  }
});

test('salary and currency are one update while a known zero remains different from an unknown blank', () => {
  assert.deepEqual(recruitingChanges('salary', {salary_expectation:'0', salary_currency:' usd '}), {
    table:'Applications', changes:{salary_expectation:0, salary_currency:'USD'},
  });
  assert.deepEqual(recruitingChanges('salary', {salary_expectation:'  ', salary_currency:'vnd'}), {
    table:'Applications', changes:{salary_expectation:'', salary_currency:'VND'},
  });
  assert.deepEqual(recruitingChanges('notice_period_days', {notice_period_days:'0'}).changes, {notice_period_days:0});
  assert.deepEqual(recruitingChanges('notice_period_days', {notice_period_days:'  '}).changes, {notice_period_days:''});
  assert.deepEqual(recruitingValues('salary', {salary_expectation:null}, {}), {salary_expectation:'', salary_currency:'VND'});
  assert.deepEqual(recruitingValues('notice_period_days', {notice_period_days:null}, {}), {notice_period_days:''});
  const missingCurrency = Object.freeze({salary_expectation:'0', salary_currency:'   '});
  const before = structuredClone(missingCurrency);
  assert.throws(() => recruitingChanges('salary', missingCurrency));
  assert.deepEqual(missingCurrency, before);
});

test('invalid money and notice periods fail without mutating submitted values', () => {
  const invalid = [
    ['salary', {salary_expectation:'-1', salary_currency:'VND'}],
    ['salary', {salary_expectation:'NaN', salary_currency:'VND'}],
    ['salary', {salary_expectation:NaN, salary_currency:'VND'}],
    ['salary', {salary_expectation:'Infinity', salary_currency:'USD'}],
    ['notice_period_days', {notice_period_days:'-1'}],
    ['notice_period_days', {notice_period_days:'2.5'}],
    ['notice_period_days', {notice_period_days:'NaN'}],
    ['notice_period_days', {notice_period_days:Number.MAX_SAFE_INTEGER + 1}],
  ];
  for (const [field, values] of invalid) {
    const before = structuredClone(values);
    assert.throws(() => recruitingChanges(field, Object.freeze(values)));
    assert.deepEqual(values, before);
  }
});

test('available-start date accepts an actual leap day and rejects rollover or timestamp values', () => {
  assert.deepEqual(recruitingChanges('available_start_date', {available_start_date:'2028-02-29'}), {
    table:'Applications', changes:{available_start_date:'2028-02-29'},
  });
  assert.deepEqual(recruitingChanges('available_start_date', {available_start_date:''}).changes, {available_start_date:''});
  for (const value of ['2026-02-29', '2026-02-30', '2026-04-31', '2026/10/07', '2026-10-07T10:00:00Z', 'not-a-date']) {
    assert.throws(() => recruitingChanges('available_start_date', {available_start_date:value}));
  }
});

test('unrecognized fields and unrelated submitted properties cannot edit identity or candidate decisions', () => {
  const {application, candidate} = fixtures();
  for (const field of ['application_status', 'candidate_id', 'table', 'constructor', '__proto__']) {
    assert.throws(() => recruitingValues(field, application, candidate));
    assert.throws(() => recruitingChanges(field, {application_status:'rejected'}));
  }
  for (const [field, values] of [
    ['source', {source:'referral', application_status:'rejected'}],
    ['salary', {salary_expectation:'100', salary_currency:'USD', decided_by:'forged'}],
    ['notes', {notes:'New note', candidate_id:'other-candidate'}],
  ]) {
    const before = structuredClone(values);
    assert.throws(() => recruitingChanges(field, Object.freeze(values)));
    assert.deepEqual(values, before);
  }
});

test('source and open-to-work controls validate their own enum without inventing verification', () => {
  assert.deepEqual(recruitingChanges('source', {source:''}), {table:'Applications', changes:{source:''}});
  assert.deepEqual(recruitingChanges('open_to_work_status', {open_to_work_status:'unknown'}), {
    table:'Candidates', changes:{open_to_work_status:'unknown'},
  });
  assert.throws(() => recruitingChanges('source', {source:'unlisted-network'}));
  assert.throws(() => recruitingChanges('open_to_work_status', {open_to_work_status:'maybe'}));
  assert.throws(() => recruitingChanges('open_to_work_status', {open_to_work_status:''}));
});

test('recruiting details expose enabled direct controls without requiring the old edit button', () => {
  const {application, candidate} = fixtures();
  const markup = renderRecruitingDetails(application, candidate, helpers);
  for (const name of ['source', 'location', 'salary_expectation', 'salary_currency', 'notice_period_days', 'available_start_date', 'open_to_work_status', 'notes']) {
    const control = markup.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bname="${name}"[^>]*>`));
    assert.ok(control, `Direct control ${name} should be rendered.`);
    assert.doesNotMatch(control[0], /\b(?:disabled|readonly)(?:\s|=|>)/i);
  }
  assert.match(markup, /data-recruiting-field="salary"/);
  assert.match(markup, /aria-label="Mức lương kỳ vọng"/);
  assert.match(markup, /aria-label="Đơn vị tiền tệ"/);
  assert.doesNotMatch(markup, /data-action="edit-candidate"/);
  assert.doesNotMatch(markup, /<button\b[^>]*>\s*Sửa\s*<\/button>/);
});

test('rendered values and application identity are escaped and local drafts never mutate saved records', () => {
  const application = Object.freeze({application_id:'app" onclick="evil()', salary_expectation:0, salary_currency:'USD'});
  const candidate = Object.freeze({location:'<img src=x onerror=evil()>', notes:'</textarea><script>evil()</script>'});
  const drafts = Object.freeze({[`${application.application_id}:location`]:Object.freeze({location:'<svg onload=evil()>'})});
  const before = structuredClone({application, candidate, drafts});
  const markup = renderRecruitingDetails(application, candidate, {...helpers, drafts});
  assert.doesNotMatch(markup, /<script>|<img\b|<svg\s+onload=/i);
  assert.doesNotMatch(markup, /\bonclick="evil\(\)"/);
  assert.match(markup, /&lt;svg onload=evil\(\)&gt;/);
  assert.match(markup, /&lt;\/textarea&gt;&lt;script&gt;evil\(\)&lt;\/script&gt;/);
  assert.match(markup, /app&quot;/);
  assert.match(markup, /is-dirty/);
  assert.deepEqual({application, candidate, drafts}, before);
});
