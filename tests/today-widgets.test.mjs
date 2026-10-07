import test from 'node:test';
import assert from 'node:assert/strict';
import { getGreeting, getDailyQuote, summarizeOpenJobs, renderOpenJobsSummary, formatRoundName, humanizeRoundText } from '../dist/today-widgets.js';

const vietnamTime = (hour, minute = 0) => new Date(`2026-10-07T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`);

test('greeting changes at every Vietnam time boundary, including midnight and 23:00', () => {
  const cases = [
    [0, 0, 'Have some rest'], [7, 59, 'Have some rest'],
    [8, 0, 'Good morning'], [11, 59, 'Good morning'],
    [12, 0, 'Good afternoon'], [15, 59, 'Good afternoon'],
    [16, 0, 'Good evening'], [17, 59, 'Good evening'],
    [18, 0, "Let's wrap today up"], [22, 59, "Let's wrap today up"],
    [23, 0, 'Have some rest'], [23, 59, 'Have some rest'],
  ];
  for (const [hour, minute, greeting] of cases) assert.equal(getGreeting(vietnamTime(hour, minute)), `${greeting}, Linh!`);
  assert.equal(getGreeting(vietnamTime(8), '  An  '), 'Good morning, An!');
  assert.equal(getGreeting(vietnamTime(8), ''), 'Good morning!');
});

test('daily quote remains stable for a whole Vietnam day across UTC midnight', () => {
  const start = new Date('2026-10-06T17:00:00Z');
  const middle = new Date('2026-10-07T06:00:00Z');
  const end = new Date('2026-10-07T16:59:59Z');
  assert.equal(getDailyQuote(start), getDailyQuote(middle));
  assert.equal(getDailyQuote(middle), getDailyQuote(end));
  assert.notEqual(getDailyQuote(end), getDailyQuote(new Date('2026-10-07T17:00:00Z')));
  const quotes = new Set(Array.from({length: 31}, (_, index) => getDailyQuote(new Date(Date.UTC(2026, 9, 7 + index, 6)))));
  assert.equal(quotes.size, 31);
  assert.ok([...quotes].every(quote => typeof quote === 'string' && quote.length > 15));
});

function fixture() {
  return {tables: {
    Jobs: [
      {job_id: 'job1', job_title: 'Backend engineer', job_status: 'open'},
      {job_id: 'job2', job_title: 'Designer', job_status: 'open'},
      {job_id: 'job3', job_title: 'Closed role', job_status: 'closed'},
      {job_id: 'job4', job_title: 'Held role', job_status: 'on_hold'},
      {job_id: 'job5', job_title: 'Draft role', job_status: 'draft'},
    ],
    Applications: [
      {application_id: 'app1', candidate_id: 'same-person', job_id: 'job1', stage: 'interview', application_status: 'active', current_round_id: 'round-current'},
      {application_id: 'app2', candidate_id: 'person2', job_id: 'job1', stage: 'offer', application_status: 'on_hold'},
      {application_id: 'app3', candidate_id: 'same-person', job_id: 'job2', stage: 'test', application_status: 'active', current_round_id: 'test-current'},
      {application_id: 'app4', candidate_id: 'person4', job_id: 'job1', stage: 'interview', application_status: 'active', current_round_id: 'foreign-round'},
      {application_id: 'app5', candidate_id: 'person5', job_id: 'job1', stage: 'test', application_status: 'active', current_round_id: 'test-finished'},
      {application_id: 'app6', candidate_id: 'person6', job_id: 'job1', stage: 'interview', application_status: 'active', current_round_id: 'screening-round'},
      ...['rejected', 'withdrawn', 'offer_declined', 'hired'].map((status, index) => ({application_id: `terminal${index}`, job_id: 'job1', stage: 'offer', application_status: status})),
      {application_id: 'closed-stage', job_id: 'job1', stage: 'closed', application_status: 'active'},
      {application_id: 'closed-job-app', job_id: 'job3', stage: 'offer', application_status: 'active'},
    ],
    Rounds: [
      {round_id: 'round-old', application_id: 'app1', round_type: 'hm_interview', round_number: 1, round_status: 'completed'},
      {round_id: 'round-current', application_id: 'app1', round_type: 'hm_interview', round_number: 2, round_status: 'scheduled'},
      {round_id: 'round-future', application_id: 'app1', round_type: 'hm_interview', round_number: 3, round_status: 'planned'},
      {round_id: 'test-current', application_id: 'app3', round_type: 'test', round_number: 1, round_status: 'in_progress'},
      {round_id: 'foreign-round', application_id: 'app1', round_type: 'hm_interview', round_number: 8, round_status: 'scheduled'},
      {round_id: 'test-finished', application_id: 'app5', round_type: 'test', round_number: 2, round_status: 'cancelled'},
      {round_id: 'screening-round', application_id: 'app6', round_type: 'recruiter_screen', round_number: 1, round_status: 'scheduled'},
    ],
  }};
}

test('summary counts processing applications for open jobs, including hold and multiple roles for one person', () => {
  const summary = summarizeOpenJobs(fixture());
  assert.equal(summary.openJobCount, 2);
  assert.equal(summary.processingCount, 6);
  assert.equal(summary.offerCount, 1);
  assert.equal(summary.jobs[0].processingCount, 5);
  assert.equal(summary.jobs[1].processingCount, 1);
  const selected = summarizeOpenJobs(fixture(), 'job2');
  assert.equal(selected.openJobCount, 1);
  assert.equal(selected.processingCount, 1);
  assert.equal(selected.offerCount, 0);
  assert.equal(summarizeOpenJobs(fixture(), 'job3').openJobCount, 0);
});

test('round grouping follows the linked current round once and falls back for stale or foreign links', () => {
  const state = fixture();
  state.tables.Applications.push({...state.tables.Applications[0]});
  const summary = summarizeOpenJobs(state);
  assert.equal(summary.processingCount, 6);
  assert.deepEqual(summary.jobs[0].groups.map(group => [group.label, group.count]), [
    ['Phỏng vấn', 2], ['Interview Round 2', 1], ['Bài test', 1], ['Offer', 1],
  ]);
  assert.deepEqual(summary.jobs[1].groups.map(group => [group.label, group.count]), [['Test 1', 1]]);
  assert.ok(!summary.jobs.flatMap(job => job.groups).some(group => /Round (1|3|8)$/.test(group.label)));
});

test('a planned current HM round is grouped by its actual number, with no guessed round when unlinked', () => {
  const state = fixture();
  state.tables.Applications[0].current_round_id = 'round-future';
  const groups = summarizeOpenJobs(state).jobs[0].groups;
  assert.equal(groups.find(group => group.label === 'Interview Round 3').count, 1);
  state.tables.Applications[0].current_round_id = '';
  assert.equal(summarizeOpenJobs(state).jobs[0].groups.find(group => group.key === 'interview').count, 3);
});

test('completed current round awaiting feedback retains its actual round number', () => {
  const state = fixture();
  state.tables.Rounds.find(round => round.round_id === 'round-current').round_status = 'completed';
  assert.equal(summarizeOpenJobs(state).jobs[0].groups.find(group => group.label === 'Interview Round 2').count, 1);
});

test('summary renders accessible collapsed details and escapes user-controlled titles and IDs', () => {
  const state = fixture();
  state.tables.Jobs[0].job_title = '<img src=x onerror="alert(1)">';
  state.tables.Jobs[0].job_id = 'job" data-danger="yes';
  state.tables.Applications.forEach(application => {if (application.job_id === 'job1') application.job_id = state.tables.Jobs[0].job_id;});
  const html = renderOpenJobsSummary(state);
  assert.match(html, /^<details class="open-jobs-summary panel"><summary>/);
  assert.match(html, /2 vị trí · 6 hồ sơ đang xử lý · 1 hồ sơ ở Offer/);
  assert.match(html, /data-action="job-pipeline"/);
  assert.match(html, /data-id="job&quot; data-danger=&quot;yes"/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('data-danger="yes'));
  assert.match(html, /<ul class="open-job-groups" aria-label="Phân bố hồ sơ theo giai đoạn">/);
  assert.match(renderOpenJobsSummary(state, {expanded: true}), /^<details class="open-jobs-summary panel" open>/);
  const empty = renderOpenJobsSummary({tables: {Jobs: [], Applications: [], Rounds: []}});
  assert.match(empty, /0 vị trí · 0 hồ sơ đang xử lý · 0 hồ sơ ở Offer/);
  assert.match(empty, /Chưa có vị trí đang mở/);
});

test('human round names cover interview, test, recruiter screening, and unknown numbering', () => {
  assert.equal(formatRoundName({round_type: 'hm_interview', round_number: 10}), 'Interview Round 10');
  assert.equal(formatRoundName({round_type: 'test', round_number: 2}), 'Test 2');
  assert.equal(formatRoundName({round_type: 'recruiter_screen', round_number: 1}), 'Recruiter screening');
  assert.equal(formatRoundName({round_type: 'hm_interview'}), 'Interview');
  assert.equal(formatRoundName({round_type: 'test'}), 'Test');
});

test('legacy prose labels are humanized without changing identifiers, URLs, or unrelated tokens', () => {
  assert.equal(humanizeRoundText('Chuẩn bị D1 · An; hỏi feedback D10. Theo dõi T1/T2.'), 'Chuẩn bị Interview Round 1 · An; hỏi feedback Interview Round 10. Theo dõi Test 1/Test 2.');
  const identifiers = 'round_D1 task-T1 doc_T2 candidate-D10 D12id idD1 T10 T3 D1.0 https://example.invalid/D1?test=T1 HTTPS://example.invalid/D10';
  assert.equal(humanizeRoundText(identifiers), identifiers);
  assert.equal(humanizeRoundText('“D2” (T2) sau vòng D3'), '“Interview Round 2” (Test 2) sau vòng Interview Round 3');
  assert.equal(humanizeRoundText(null), '');
});
