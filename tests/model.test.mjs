import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmpty, createDemo, moveApplication, recordDecision, addFeedback,
  completeTask, createCandidate, createJob, createEmailDraft,
  updateEmailDraft, rescheduleRound, validateImport, exportDatabase, pct,
} from '../dist/model.js';

const tableNames = ['Jobs', 'Candidates', 'Applications', 'Documents', 'Rounds', 'Feedback', 'Tasks', 'Emails', 'Offers', 'ActivityLog'];
const rows = (state, name) => (state.tables ?? state.db ?? state.database ?? state)[name];
const clone = value => structuredClone(value);
const firstApplication = state => rows(state, 'Applications')[0];

test('empty workspace preserves the complete Sheet database topology', () => {
  const state = createEmpty();
  for (const name of tableNames) assert.deepEqual(rows(state, name), [], name);
  const exported = exportDatabase(state);
  for (const name of tableNames) assert.deepEqual(rows(exported, name), [], name);
  const imported = validateImport(exported);
  for (const name of tableNames) assert.deepEqual(rows(imported, name), [], name);
});

test('moving pipeline card preserves identity and foreign keys without sending email', () => {
  const state = createDemo();
  const app = firstApplication(state);
  const identity = [app.application_id, app.candidate_id, app.job_id];
  const emails = clone(rows(state, 'Emails'));
  moveApplication(state, app.application_id, 'test');
  assert.deepEqual([app.application_id, app.candidate_id, app.job_id], identity);
  assert.equal(app.stage, 'test');
  assert.deepEqual(rows(state, 'Emails'), emails);
  assert.ok(rows(state, 'ActivityLog').some(log => log.application_id === app.application_id));
});

test('rejecting requires a reason and invalid attempt leaves records unchanged', () => {
  const state = createDemo();
  const app = firstApplication(state);
  const before = clone(state);
  assert.throws(() => recordDecision(state, app.application_id, 'reject', '   '));
  assert.deepEqual(state, before);
  recordDecision(state, app.application_id, 'reject', 'Depth of relevant project experience is not sufficient.');
  assert.equal(app.application_status, 'rejected');
  assert.equal(app.recruiter_decision, 'reject');
  assert.equal(app.decision_reason, 'Depth of relevant project experience is not sufficient.');
  assert.ok(app.decided_at);
});

test('closing from pipeline requires a reason and explicit terminal status is retained', () => {
  const state = createDemo();
  const app = firstApplication(state);
  assert.throws(() => moveApplication(state, app.application_id, 'closed'));
  moveApplication(state, app.application_id, 'closed', { status: 'withdrawn', reason: 'Candidate withdrew after schedule discussion.' });
  assert.equal(app.stage, 'closed');
  assert.equal(app.application_status, 'withdrawn');
  assert.equal(app.closure_reason, 'Candidate withdrew after schedule discussion.');
});

test('HM feedback records a recommendation without taking the recruiter final decision', () => {
  const state = createDemo();
  const round = rows(state, 'Rounds').find(row => row.round_type === 'hm_interview');
  assert.ok(round, 'Demo must contain an HM interview.');
  const app = rows(state, 'Applications').find(row => row.application_id === round.application_id);
  const decision = app.recruiter_decision;
  const status = app.application_status;
  const finalDecision = round.final_decision;
  const emails = clone(rows(state, 'Emails'));
  const feedback = addFeedback(state, app.application_id, {
    round_id: round.round_id, feedback_type: 'interviewer', author_name: 'Test HM',
    author_email: 'hm@example.invalid', summary: 'Needs a second discussion about tradeoffs.', recommendation: 'reconsider',
  });
  assert.equal(feedback.application_id, app.application_id);
  assert.equal(feedback.round_id, round.round_id);
  assert.equal(feedback.recommendation, 'reconsider');
  assert.equal(feedback.feedback_status, 'submitted');
  assert.equal(app.recruiter_decision, decision);
  assert.equal(app.application_status, status);
  assert.equal(round.final_decision, finalDecision);
  assert.deepEqual(rows(state, 'Emails'), emails);
});

test('pending interviewer feedback keeps the criteria originally requested and rolls back invalid scope', () => {
  const state = createDemo();
  const pending = rows(state, 'Feedback').find(row => row.feedback_status === 'pending');
  const app = rows(state, 'Applications').find(row => row.application_id === pending.application_id);
  const job = rows(state, 'Jobs').find(row => row.job_id === app.job_id);
  pending.criteria_url_used = 'https://example.invalid/criteria/v1';
  pending.criteria_version_used = 'v1';
  job.criteria_url = 'https://example.invalid/criteria/v2';
  job.criteria_version = 'v2';
  const fields = {
    round_id: pending.round_id, author_name: pending.author_name,
    author_email: pending.author_email, summary: 'Behavioural evidence recorded against the requested criteria.',
    feedback_type: 'interviewer', recommendation: 'review_more', change_scope: 'invalid-scope',
  };
  const before = clone(state);
  assert.throws(() => addFeedback(state, app.application_id, fields));
  assert.deepEqual(state, before);
  const result = addFeedback(state, app.application_id, { ...fields, change_scope: 'application_only' });
  assert.equal(result.feedback_id, pending.feedback_id);
  assert.equal(result.criteria_url_used, 'https://example.invalid/criteria/v1');
  assert.equal(result.criteria_version_used, 'v1');
  assert.equal(result.feedback_status, 'submitted');
});

test('reopening a rejected application clears the active rejection while retaining history', () => {
  const state = createDemo();
  const app = rows(state, 'Applications').find(row => row.application_status === 'rejected');
  const count = rows(state, 'ActivityLog').length;
  moveApplication(state, app.application_id, 'screening', { status: 'active', reason: 'New evidence received.' });
  assert.equal(app.stage, 'screening');
  assert.equal(app.application_status, 'active');
  assert.equal(app.recruiter_decision, 'pending');
  assert.ok(!app.closed_at);
  assert.ok(!app.closure_reason);
  assert.ok(rows(state, 'ActivityLog').length > count);
  assert.ok(rows(state, 'ActivityLog').findLast(log => log.application_id === app.application_id).old_value_json.includes('rejected'));
});

test('one candidate can apply to two roles without duplicating the candidate pool', () => {
  const state = createEmpty();
  const firstJob = createJob(state, { job_title: 'Backend engineer', hiring_manager_name: 'Test HM', job_status: 'open' });
  const secondJob = createJob(state, { job_title: 'Platform engineer', hiring_manager_name: 'Test HM', job_status: 'open' });
  const input = { full_name: 'Test Candidate', email: 'candidate@example.invalid', source: 'direct_application' };
  const first = createCandidate(state, { ...input, job_id: firstJob.job_id });
  const second = createCandidate(state, { ...input, job_id: secondJob.job_id });
  assert.notEqual(first.application_id, second.application_id);
  assert.equal(first.candidate_id, second.candidate_id);
  assert.equal(rows(state, 'Candidates').length, 1);
  assert.equal(rows(state, 'Applications').length, 2);
  assert.throws(() => createCandidate(state, { ...input, job_id: firstJob.job_id }));
  assert.equal(rows(state, 'Applications').length, 2);
});

test('new job and candidate reference valid records and export all schema tables', () => {
  const state = createEmpty();
  const job = createJob(state, { job_title: 'Software engineer', hiring_manager_name: 'Test HM', job_status: 'open', work_mode: 'hybrid' });
  const app = createCandidate(state, { full_name: 'Another Candidate', email: 'another@example.invalid', job_id: job.job_id, source: 'referral' });
  assert.equal(app.job_id, job.job_id);
  assert.ok(rows(state, 'Candidates').some(candidate => candidate.candidate_id === app.candidate_id));
  assert.equal(app.recruiter_decision, 'pending');
  const exported = exportDatabase(state);
  for (const name of tableNames) assert.ok(Array.isArray(rows(exported, name)), name);
  const imported = validateImport(exported);
  assert.equal(rows(imported, 'Applications')[0].candidate_id, app.candidate_id);
  assert.equal(rows(imported, 'Jobs')[0].job_id, job.job_id);
});

test('email preparation and edits never mark an email as delivered without a provider', () => {
  const state = createDemo();
  const app = firstApplication(state);
  const draft = createEmailDraft(state, app.application_id, 'approach');
  assert.equal(draft.application_id, app.application_id);
  assert.equal(draft.email_status, 'draft');
  assert.ok(!draft.sent_at);
  const before = clone(state);
  assert.throws(() => updateEmailDraft(state, draft.email_id, { email_status: 'sent' }));
  assert.deepEqual(state, before);
  assert.throws(() => updateEmailDraft(state, draft.email_id, { provider_message_id: 'fabricated' }));
  assert.deepEqual(state, before);
  assert.ok(!draft.provider_message_id);
  updateEmailDraft(state, draft.email_id, { subject: 'Interview invitation', body: 'Please choose a convenient time.' });
  assert.equal(draft.subject, 'Interview invitation');
  assert.equal(draft.body, 'Please choose a convenient time.');
  assert.equal(draft.email_status, 'draft');
  assert.ok(!draft.sent_at);
});

test('completion records a task timestamp and keeps its identity', () => {
  const state = createDemo();
  const task = rows(state, 'Tasks').find(row => row.task_status === 'open');
  assert.ok(task);
  const identity = [task.task_id, task.application_id, task.round_id];
  completeTask(state, task.task_id);
  assert.equal(task.task_status, 'done');
  assert.ok(task.completed_at);
  assert.deepEqual([task.task_id, task.application_id, task.round_id], identity);
});

test('reschedule keeps the round and submitted feedback, and logs both schedules', () => {
  const state = createDemo();
  const round = rows(state, 'Rounds').find(row => row.round_type === 'hm_interview');
  const originalId = round.round_id;
  const applicationId = round.application_id;
  const oldStart = round.scheduled_start_at;
  const feedback = clone(rows(state, 'Feedback').filter(row => row.round_id === originalId));
  const start = '2026-10-12T03:00:00.000Z';
  const end = '2026-10-12T04:00:00.000Z';
  rescheduleRound(state, originalId, start, end, 'Candidate requested a new time.');
  assert.equal(round.round_id, originalId);
  assert.equal(round.application_id, applicationId);
  assert.equal(round.scheduled_start_at, start);
  assert.equal(round.scheduled_end_at, end);
  assert.ok(round.reschedule_count >= 1);
  assert.deepEqual(rows(state, 'Feedback').filter(row => row.round_id === originalId), feedback);
  const log = rows(state, 'ActivityLog').findLast(row => row.action === 'reschedule' && row.entity_id === originalId);
  assert.ok(log);
  assert.ok(JSON.stringify(log).includes(start));
  assert.ok(JSON.stringify(log).includes(oldStart));
  for (const task of rows(state, 'Tasks').filter(row => row.round_id === originalId && ['prepare_interview', 'attend_interview'].includes(row.task_type))) {
    const expected = task.task_type === 'prepare_interview' ? new Date(new Date(start).getTime() - 15 * 60000).toISOString() : start;
    assert.equal(task.due_at, expected);
  }
});

test('unknown score is distinct from a confirmed zero score', () => {
  assert.notEqual(pct(null), pct(0));
  assert.notEqual(pct(''), pct(0));
  assert.notEqual(pct('   '), pct(0));
  assert.match(pct(0), /0/);
  assert.match(pct(0.75), /75/);
  const state = createDemo();
  const feedback = rows(state, 'Feedback').find(row => row.feedback_type === 'ai_screening');
  assert.ok(feedback);
  feedback.fit_score = 0;
  feedback.coverage_score = null;
  const imported = validateImport(exportDatabase(state));
  const restored = rows(imported, 'Feedback').find(row => row.feedback_id === feedback.feedback_id);
  assert.equal(restored.fit_score, 0);
  assert.ok(restored.coverage_score === null || restored.coverage_score === '');
});

test('import rejects unknown columns, invalid statuses, and dangling references', () => {
  const base = exportDatabase(createDemo());
  const unknown = clone(base);
  rows(unknown, 'Candidates')[0].unexpected_column = 'not part of the Sheet schema';
  assert.throws(() => validateImport(unknown));
  const invalidStatus = clone(base);
  rows(invalidStatus, 'Applications')[0].application_status = 'maybe';
  assert.throws(() => validateImport(invalidStatus));
  const dangling = clone(base);
  rows(dangling, 'Applications')[0].candidate_id = 'nonexistent-candidate';
  assert.throws(() => validateImport(dangling));
  const duplicate = clone(base);
  rows(duplicate, 'Candidates').push(clone(rows(duplicate, 'Candidates')[0]));
  assert.throws(() => validateImport(duplicate));
  const wrongRound = clone(base);
  const app = rows(wrongRound, 'Applications')[0];
  app.current_round_id = rows(wrongRound, 'Rounds').find(round => round.application_id !== app.application_id).round_id;
  assert.throws(() => validateImport(wrongRound));
  const wrongAssessment = clone(base);
  const current = rows(wrongAssessment, 'Applications')[0];
  current.latest_screening_feedback_id = rows(wrongAssessment, 'Feedback').find(feedback => feedback.application_id !== current.application_id).feedback_id;
  assert.throws(() => validateImport(wrongAssessment));
});

test('import normalizes Sheets numeric cells while rejecting scores outside 0–1', () => {
  const base = exportDatabase(createDemo());
  const feedback = rows(base, 'Feedback').find(row => row.feedback_type === 'ai_screening');
  feedback.fit_score = '0.75';
  feedback.coverage_score = '0';
  const imported = validateImport(base);
  const restored = rows(imported, 'Feedback').find(row => row.feedback_id === feedback.feedback_id);
  assert.equal(restored.fit_score, 0.75);
  assert.equal(restored.coverage_score, 0);
  feedback.fit_score = 75;
  assert.throws(() => validateImport(base));
});

test('import keeps whitespace-only score unknown instead of fabricating zero', () => {
  const base = exportDatabase(createDemo());
  const feedback = rows(base, 'Feedback').find(row => row.feedback_type === 'ai_screening');
  feedback.fit_score = '   ';
  feedback.coverage_score = 0;
  const imported = validateImport(base);
  const restored = rows(imported, 'Feedback').find(row => row.feedback_id === feedback.feedback_id);
  assert.equal(restored.fit_score, null);
  assert.equal(restored.coverage_score, 0);
});

test('import rejects records that could disappear from pipeline due to blank required status', () => {
  const base = exportDatabase(createDemo());
  const missingStage = clone(base);
  delete rows(missingStage, 'Applications')[0].stage;
  assert.throws(() => validateImport(missingStage));
  const missingStatus = clone(base);
  rows(missingStatus, 'Applications')[0].application_status = '';
  assert.throws(() => validateImport(missingStatus));
  const missingName = clone(base);
  rows(missingName, 'Candidates')[0].full_name = '   ';
  assert.throws(() => validateImport(missingName));
});

test('import rejects date cells that roll over to another calendar day', () => {
  const base = exportDatabase(createDemo());
  rows(base, 'Jobs')[0].target_hire_date = '2026-02-30';
  assert.throws(() => validateImport(base));
});

function closureFixture() {
  const state = createDemo();
  const round = rows(state, 'Rounds').find(row => row.round_status === 'scheduled' && row.round_type === 'hm_interview');
  const app = rows(state, 'Applications').find(row => row.application_id === round.application_id);
  const future = new Date(Date.now() + 10 * 86400000).toISOString();
  const past = new Date(Date.now() - 10 * 86400000).toISOString();
  round.scheduled_start_at = future;
  round.scheduled_end_at = new Date(new Date(future).getTime() + 3600000).toISOString();
  const historical = { ...clone(round), round_id: 'round_test_completed', round_status: 'completed', scheduled_start_at: past, scheduled_end_at: past, completed_at: past };
  const underway = { ...clone(round), round_id: 'round_test_underway', round_status: 'in_progress' };
  const pastScheduled = { ...clone(round), round_id: 'round_test_past', round_status: 'scheduled', scheduled_start_at: past, scheduled_end_at: past };
  const planned = { ...clone(round), round_id: 'round_test_planned', round_status: 'planned', scheduled_start_at: '', scheduled_end_at: '' };
  rows(state, 'Rounds').push(historical, underway, pastScheduled, planned);
  const task = rows(state, 'Tasks').find(row => row.application_id === app.application_id && row.task_status === 'open');
  const thankYou = { ...clone(task), task_id: 'task_test_thank_you', task_type: 'send_thank_you' };
  const completedTask = { ...clone(task), task_id: 'task_test_completed', task_status: 'done', completed_at: past };
  rows(state, 'Tasks').push(thankYou, completedTask);
  const feedbackTemplate = rows(state, 'Feedback').find(row => row.feedback_status === 'pending');
  const pending = {
    ...clone(feedbackTemplate), feedback_id: 'feedback_test_pending', application_id: app.application_id,
    round_id: round.round_id, cv_document_id: app.cv_document_id,
  };
  const submitted = { ...clone(pending), feedback_id: 'feedback_test_submitted', feedback_status: 'submitted', submitted_at: past, summary: 'Preserve this historical evidence.' };
  rows(state, 'Feedback').push(pending, submitted);
  return { state, app, round, historical, underway, pastScheduled, planned, task, thankYou, completedTask, pending, submitted };
}

test('reject closes pending work and future rounds while preserving thank-you tasks and historical evidence', () => {
  const f = closureFixture();
  const emails = clone(rows(f.state, 'Emails'));
  const submitted = clone(f.submitted);
  const historical = clone(f.historical);
  const otherTask = rows(f.state, 'Tasks').find(task => task.application_id && task.application_id !== f.app.application_id);
  const otherBefore = clone(otherTask);
  recordDecision(f.state, f.app.application_id, 'reject', 'Role requirements were not met after review.');
  assert.equal(f.app.application_status, 'rejected');
  assert.equal(f.task.task_status, 'cancelled');
  assert.ok(f.task.cancellation_reason);
  assert.equal(f.thankYou.task_status, 'open');
  assert.equal(f.completedTask.task_status, 'done');
  assert.equal(f.round.round_status, 'cancelled');
  assert.equal(f.planned.round_status, 'cancelled');
  assert.equal(f.underway.round_status, 'in_progress');
  assert.equal(f.pastScheduled.round_status, 'scheduled');
  assert.deepEqual(f.historical, historical);
  assert.equal(f.pending.feedback_status, 'cancelled');
  assert.deepEqual(f.submitted, submitted);
  assert.deepEqual(otherTask, otherBefore);
  assert.deepEqual(rows(f.state, 'Emails'), emails);
  const cancelledIds = [f.task.task_id, f.round.round_id, f.planned.round_id, f.pending.feedback_id];
  for (const id of cancelledIds) {
    const log = rows(f.state, 'ActivityLog').findLast(row => row.entity_id === id && row.action === 'cancel');
    assert.ok(log, `${id}: cancellation must be auditable`);
    assert.equal(log.application_id, f.app.application_id);
    assert.ok(log.reason);
  }
  assert.doesNotThrow(() => validateImport(exportDatabase(f.state)));
});

test('terminal applications must be explicitly reopened before a new proceed decision', () => {
  const f = closureFixture();
  recordDecision(f.state, f.app.application_id, 'reject', 'Not enough evidence for the role.');
  const before = clone(f.state);
  assert.throws(() => recordDecision(f.state, f.app.application_id, 'proceed', 'New evidence received.'));
  assert.deepEqual(f.state, before);
  moveApplication(f.state, f.app.application_id, 'screening', { status: 'active', reason: 'New evidence received, reopening for review.' });
  recordDecision(f.state, f.app.application_id, 'proceed', 'Review completed with the new evidence.');
  assert.equal(f.app.application_status, 'active');
  assert.equal(f.app.recruiter_decision, 'proceed');
  assert.equal(f.task.task_status, 'cancelled');
  assert.equal(f.round.round_status, 'cancelled');
  assert.equal(f.pending.feedback_status, 'cancelled');
  assert.doesNotThrow(() => validateImport(exportDatabase(f.state)));
});

test('candidate withdrawal cancels pending work without manufacturing a rejection or an email', () => {
  const f = closureFixture();
  const emails = clone(rows(f.state, 'Emails'));
  moveApplication(f.state, f.app.application_id, 'closed', { status: 'withdrawn', reason: 'Candidate chose to stop the process.' });
  assert.equal(f.app.application_status, 'withdrawn');
  assert.equal(f.app.stage, 'closed');
  assert.notEqual(f.app.recruiter_decision, 'reject');
  assert.equal(f.task.task_status, 'cancelled');
  assert.equal(f.round.round_status, 'cancelled');
  assert.equal(f.pending.feedback_status, 'cancelled');
  assert.equal(f.submitted.feedback_status, 'submitted');
  assert.deepEqual(rows(f.state, 'Emails'), emails);
  assert.doesNotThrow(() => validateImport(exportDatabase(f.state)));
});
