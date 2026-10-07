import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo, completeTask, moveApplication, validateImport, exportDatabase} from '../dist/model.js';
import {getTodayRecruitingTasks, undoTaskCompletion, getTaskUndoBlockReason, getTodayCompletedGoalTasks} from '../dist/task-completion.js';

const TODAY='2026-10-07';
const NOW=new Date('2026-10-07T05:00:00.000Z'); // Noon in Vietnam.
const dateKey=value=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date(value));
const options={dateKey,todayKey:()=>TODAY,now:NOW};
const ids=tasks=>tasks.map(task=>task.task_id);
const task=(task_id,fields={})=>({task_id,job_id:'job_a',task_status:'open',priority:'normal',due_at:'',completed_at:'',...fields});
const fixture=tasks=>({tables:{Tasks:tasks}});

test('Today selects due pending work and elapsed snoozes while omitting future, cancelled, and old completions', () => {
  const state=fixture([
    task('undated'),
    task('overdue',{due_at:'2026-10-06T02:00:00Z'}),
    task('today',{task_status:'in_progress',due_at:'2026-10-07T08:00:00Z'}),
    task('future',{due_at:'2026-10-08T02:00:00Z'}),
    task('awake',{task_status:'snoozed',snoozed_until:'2026-10-07T04:00:00Z'}),
    task('sleeping',{task_status:'snoozed',snoozed_until:'2026-10-07T06:00:00Z'}),
    task('cancelled',{task_status:'cancelled'}),
    task('done-yesterday',{task_status:'done',completed_at:'2026-10-06T08:00:00Z'}),
  ]);
  const before=structuredClone(state),result=getTodayRecruitingTasks(state,options);
  assert.deepEqual(new Set(ids(result.pending)),new Set(['undated','overdue','today','awake']));
  assert.deepEqual(result.completed,[]);
  assert.deepEqual(state,before);
});

test('completed work uses the Vietnamese completion date rather than its due date or UTC date', () => {
  const state=fixture([
    task('just-after-midnight',{task_status:'done',completed_at:'2026-10-06T17:01:00Z',due_at:'2026-10-08T08:00:00Z'}),
    task('just-before-midnight',{task_status:'done',completed_at:'2026-10-06T16:59:00Z'}),
    task('completed-today',{task_status:'done',completed_at:'2026-10-07T04:00:00Z',due_at:'2026-10-01T08:00:00Z'}),
    task('completed-tomorrow',{task_status:'done',completed_at:'2026-10-07T17:01:00Z'}),
    task('missing-completion-time',{task_status:'done'}),
  ]);
  const result=getTodayRecruitingTasks(state,options);
  assert.deepEqual(result.pending,[]);
  assert.deepEqual(ids(result.completed),['completed-today','just-after-midnight']);
});

test('job selection applies to both pending and completed groups without changing their records', () => {
  const state=fixture([
    task('a-pending'), task('b-pending',{job_id:'job_b'}), task('workspace',{job_id:''}),
    task('a-done',{task_status:'done',completed_at:'2026-10-07T03:00:00Z'}),
    task('b-done',{job_id:'job_b',task_status:'done',completed_at:'2026-10-07T03:00:00Z'}),
  ]);
  const before=structuredClone(state);
  const filtered=getTodayRecruitingTasks(state,{...options,jobFilter:'job_a'});
  assert.deepEqual(ids(filtered.pending),['a-pending']);
  assert.deepEqual(ids(filtered.completed),['a-done']);
  const all=getTodayRecruitingTasks(state,options);
  assert.equal(all.pending.length,3); assert.equal(all.completed.length,2);
  assert.deepEqual(state,before);
});

test('pending priority and due ordering is stable and completed rows can be appended last newest-first', () => {
  const records=[
    task('normal-undated'),task('high-later',{priority:'high',due_at:'2026-10-07T07:00:00Z'}),
    task('normal-earlier',{due_at:'2026-10-06T02:00:00Z'}),
    task('high-earlier',{priority:'high',due_at:'2026-10-07T02:00:00Z'}),
    task('normal-tie-1',{due_at:'2026-10-07T02:00:00Z'}),
    task('normal-tie-2',{due_at:'2026-10-07T02:00:00Z'}),
    task('done-old',{task_status:'done',completed_at:'2026-10-07T02:00:00Z'}),
    task('done-new',{task_status:'done',completed_at:'2026-10-07T04:00:00Z'}),
  ];
  const state=fixture(Object.freeze(records.map(record=>Object.freeze(record))));
  const result=getTodayRecruitingTasks(state,options);
  assert.deepEqual(ids(result.pending),['high-earlier','high-later','normal-earlier','normal-tie-1','normal-tie-2','normal-undated']);
  assert.deepEqual(ids(result.completed),['done-new','done-old']);
  assert.deepEqual(ids([...result.pending,...result.completed]).slice(-2),['done-new','done-old']);
  assert.equal(result.completed[0],records[7]);
});

test('Today selector accepts the current UI function helpers and explicit dates while rejecting invalid dates', () => {
  const state=fixture([task('work')]);
  assert.deepEqual(ids(getTodayRecruitingTasks(state,options).pending),['work']);
  assert.deepEqual(ids(getTodayRecruitingTasks(state,{todayKey:TODAY,now:NOW}).pending),['work']);
  assert.deepEqual(ids(getTodayRecruitingTasks(state,{now:NOW}).pending),['work']);
  assert.throws(()=>getTodayRecruitingTasks(state,{todayKey:'2026-02-30'}));
  assert.throws(()=>getTodayRecruitingTasks(state,{todayKey:TODAY,now:'invalid'}));
});

test('completion and undo preserve task links, retain an audit trail, and leave unrelated records and emails unchanged', () => {
  const state=createDemo(),target=state.tables.Tasks.find(row=>row.task_status==='open');
  const identity=[target.task_id,target.application_id,target.job_id,target.round_id,target.related_feedback_id,target.related_email_id];
  const unrelated=Object.fromEntries(Object.entries(state.tables).filter(([name])=>!['Tasks','ActivityLog'].includes(name)).map(([name,rows])=>[name,structuredClone(rows)]));
  const otherTasks=structuredClone(state.tables.Tasks.filter(row=>row.task_id!==target.task_id));
  const originalLogs=state.tables.ActivityLog.length;
  completeTask(state,target.task_id);
  const completionTime=target.completed_at,completedSnapshot=structuredClone(target);
  assert.ok(completionTime);
  const day=dateKey(completionTime);
  assert.ok(getTodayRecruitingTasks(state,{dateKey,todayKey:day}).completed.some(row=>row.task_id===target.task_id));
  const result=undoTaskCompletion(state,target.task_id);
  assert.equal(result,target);
  assert.equal(target.task_status,'open');
  assert.equal(target.completed_at,'');
  assert.equal(target.snoozed_until,'');
  assert.deepEqual([target.task_id,target.application_id,target.job_id,target.round_id,target.related_feedback_id,target.related_email_id],identity);
  assert.ok(Number.isFinite(Date.parse(target.updated_at)));
  assert.equal(target.updated_by,'recruiter-local');
  assert.deepEqual(state.tables.Tasks.filter(row=>row.task_id!==target.task_id),otherTasks);
  for(const [name,rows] of Object.entries(unrelated))assert.deepEqual(state.tables[name],rows,name);
  assert.equal(state.tables.ActivityLog.length,originalLogs+2);
  const audit=state.tables.ActivityLog.at(-1);
  assert.equal(audit.entity_type,'Tasks');assert.equal(audit.entity_id,target.task_id);
  assert.equal(audit.application_id,target.application_id);
  assert.equal(audit.source,'ats_ui');assert.equal(audit.action,'status_change');
  assert.deepEqual(JSON.parse(audit.old_value_json),completedSnapshot);
  assert.equal(JSON.parse(audit.new_value_json).completed_at,'');
  assert.equal(JSON.parse(audit.new_value_json).task_status,'open');
  assert.ok(audit.reason && audit.correlation_id);
  assert.deepEqual(validateImport(exportDatabase(state)).tables,state.tables);
});

test('undo rejects missing, open, and cancelled tasks atomically and prevents a duplicate undo', () => {
  const state=createDemo(),target=state.tables.Tasks.find(row=>row.task_status==='open');
  for(const taskId of ['missing-task',target.task_id]) {
    const before=structuredClone(state);assert.throws(()=>undoTaskCompletion(state,taskId));assert.deepEqual(state,before);
  }
  target.task_status='cancelled';
  const cancelled=structuredClone(state);assert.throws(()=>undoTaskCompletion(state,target.task_id));assert.deepEqual(state,cancelled);
  target.task_status='open';completeTask(state,target.task_id);undoTaskCompletion(state,target.task_id);
  const reopened=structuredClone(state);assert.throws(()=>undoTaskCompletion(state,target.task_id));assert.deepEqual(state,reopened);
});

test('closed candidate work blocks Undo until the application is reopened, with a thank-you exception',()=>{
  for (const status of ['rejected','withdrawn','offer_declined','hired']) {
    const state=createDemo(),target=state.tables.Tasks.find(task=>task.task_type==='review_cv');
    completeTask(state,target.task_id);
    moveApplication(state,target.application_id,'closed',{status,reason:'Process ended after review.'});
    const before=structuredClone(state),reason=getTaskUndoBlockReason(state,target.task_id);
    assert.match(reason,/Mở lại hồ sơ/);
    assert.throws(()=>undoTaskCompletion(state,target.task_id),error=>error.message===reason);
    assert.deepEqual(state,before,'Blocked Undo must not change completion or add history.');
    moveApplication(state,target.application_id,'screening',{status:'active',reason:'Explicitly reopened for another review.'});
    const priorHistory=structuredClone(state.tables.ActivityLog);
    assert.equal(getTaskUndoBlockReason(state,target.task_id),'');
    undoTaskCompletion(state,target.task_id);
    assert.equal(target.task_status,'open');assert.equal(target.completed_at,'');
    assert.deepEqual(state.tables.ActivityLog.slice(0,priorHistory.length),priorHistory);
    assert.deepEqual(validateImport(exportDatabase(state)).tables,state.tables);
  }
  const closedOnly=createDemo(),review=closedOnly.tables.Tasks.find(task=>task.task_type==='review_cv');
  completeTask(closedOnly,review.task_id);
  closedOnly.tables.Applications.find(app=>app.application_id===review.application_id).stage='closed';
  const closedOnlyBefore=structuredClone(closedOnly);
  assert.ok(getTaskUndoBlockReason(closedOnly,review.task_id));
  assert.throws(()=>undoTaskCompletion(closedOnly,review.task_id));
  assert.deepEqual(closedOnly,closedOnlyBefore);

  const state=createDemo(),thankYou=state.tables.Tasks.find(task=>task.task_type==='send_thank_you');
  const application=state.tables.Applications.find(app=>app.application_id===thankYou.application_id);
  assert.equal(application.stage,'closed');
  const emails=structuredClone(state.tables.Emails),closedApplication=structuredClone(application);
  completeTask(state,thankYou.task_id);
  assert.equal(getTaskUndoBlockReason(state,thankYou.task_id),'');
  undoTaskCompletion(state,thankYou.task_id);
  assert.equal(thankYou.task_status,'open');
  assert.deepEqual(application,closedApplication);
  assert.deepEqual(state.tables.Emails,emails,'Undoing thank-you does not create or send an email.');
  assert.deepEqual(validateImport(exportDatabase(state)).tables,state.tables);
});

test('finished, cancelled or no-show rounds block stale preparation/attendance Undo while other work remains reversible',()=>{
  for (const roundStatus of ['completed','cancelled','no_show']) {
    for (const type of ['prepare_interview','attend_interview']) {
      const state=createDemo(),target=state.tables.Tasks.find(task=>task.task_type==='prepare_interview');
      target.task_type=type;
      completeTask(state,target.task_id);
      const round=state.tables.Rounds.find(round=>round.round_id===target.round_id);
      round.round_status=roundStatus;
      const before=structuredClone(state),reason=getTaskUndoBlockReason(state,target.task_id);
      assert.match(reason,/Không thể mở lại nhắc/);
      assert.throws(()=>undoTaskCompletion(state,target.task_id),error=>error.message===reason);
      assert.deepEqual(state,before,'Stale reminder stays completed with its history intact.');
    }
  }
  const state=createDemo(),followup=state.tables.Tasks.find(task=>task.task_type==='followup_feedback');
  assert.equal(state.tables.Rounds.find(round=>round.round_id===followup.round_id).round_status,'completed');
  completeTask(state,followup.task_id);
  assert.equal(getTaskUndoBlockReason(state,followup.task_id),'');
  undoTaskCompletion(state,followup.task_id);assert.equal(followup.task_status,'open');
  const operation=state.tables.Tasks.find(task=>task.task_type==='funnel_checkpoint');
  assert.equal(operation.application_id,'');
  completeTask(state,operation.task_id);
  assert.equal(getTaskUndoBlockReason(state,operation.task_id),'');
  undoTaskCompletion(state,operation.task_id);assert.equal(operation.task_status,'open');
  assert.deepEqual(validateImport(exportDatabase(state)).tables,state.tables);
});

test('completed goal work stays visible under active or completed goals, excluding held and archived goals', () => {
  const work={goals:[
    {goal_id:'active',status:'active'},{goal_id:'finished',status:'completed'},
    {goal_id:'held',status:'on_hold'},{goal_id:'archived',status:'archived'},
  ],tasks:[
    {task_id:'active-done',goal_id:'active',status:'done',completed_at:'2026-10-06T17:01:00Z'},
    {task_id:'finished-done',goal_id:'finished',status:'done',completed_at:'2026-10-07T04:00:00Z'},
    {task_id:'held-done',goal_id:'held',status:'done',completed_at:'2026-10-07T03:00:00Z'},
    {task_id:'archived-done',goal_id:'archived',status:'done',completed_at:'2026-10-07T03:00:00Z'},
    {task_id:'old-done',goal_id:'active',status:'done',completed_at:'2026-10-06T16:59:00Z'},
    {task_id:'not-done',goal_id:'active',status:'todo',completed_at:''},
    {task_id:'cancelled',goal_id:'active',status:'cancelled',completed_at:''},
  ]};
  const before=structuredClone(work);
  assert.deepEqual(ids(getTodayCompletedGoalTasks(work,TODAY)),['finished-done','active-done']);
  assert.deepEqual(work,before);
  assert.throws(()=>getTodayCompletedGoalTasks(work,'2026-02-30'));
});
