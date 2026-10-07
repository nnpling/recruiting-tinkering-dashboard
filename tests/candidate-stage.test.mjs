import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo, recordDecision, validateImport, exportDatabase} from '../dist/model.js';
import {changeCandidateStage, renderCandidateStage} from '../dist/candidate-stage.js';

const escape=value=>String(value ?? '').replace(/[&<>"']/g,character=>({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[character]));

test('a direct stage change preserves application identity, assessment, and held-versus-active status',()=>{
  for(const status of ['active','on_hold']) {
    const state=createDemo(),application=state.tables.Applications.find(row=>row.stage==='screening');
    application.application_status=status;
    if(status==='on_hold')application.recruiter_decision='hold';
    const identity=[application.application_id,application.candidate_id,application.job_id,application.cv_document_id,application.current_round_id];
    const decision=application.recruiter_decision;
    const beforeApplication=structuredClone(application);
    const unrelated=Object.fromEntries(Object.entries(state.tables).filter(([name])=>!['Applications','ActivityLog'].includes(name)).map(([name,rows])=>[name,structuredClone(rows)]));
    const otherApplications=structuredClone(state.tables.Applications.filter(row=>row.application_id!==application.application_id));
    const result=changeCandidateStage(state,application.application_id,'interview');
    assert.deepEqual(result,{kind:'updated',reopened:false});
    assert.equal(application.stage,'interview');
    assert.equal(application.application_status,status);
    assert.equal(application.recruiter_decision,decision);
    assert.deepEqual([application.application_id,application.candidate_id,application.job_id,application.cv_document_id,application.current_round_id],identity);
    for(const [name,rows] of Object.entries(unrelated))assert.deepEqual(state.tables[name],rows,name);
    assert.deepEqual(state.tables.Applications.filter(row=>row.application_id!==application.application_id),otherApplications);
    const audit=state.tables.ActivityLog.at(-1);
    assert.equal(audit.entity_id,application.application_id);
    assert.equal(audit.action,'status_change');
    assert.equal(audit.source,'ats_ui');
    assert.deepEqual(JSON.parse(audit.old_value_json),beforeApplication);
    assert.equal(JSON.parse(audit.new_value_json).stage,'interview');
    assert.equal(JSON.parse(audit.new_value_json).recruiter_decision,decision);
    assert.deepEqual(validateImport(exportDatabase(state)).tables,state.tables);
  }
});

test('choosing Closed only requests the confirmation flow and leaves candidate work and calendar records intact',()=>{
  const state=createDemo(),application=state.tables.Applications.find(row=>row.stage==='interview');
  const before=structuredClone(state);
  assert.deepEqual(changeCandidateStage(state,application.application_id,'closed'),{kind:'close'});
  assert.deepEqual(state,before);
  assert.equal(application.application_status,'active');
  assert.equal(application.stage,'interview');
});

test('reopening a rejected application clears the decision while preserving cancelled work and history',()=>{
  const state=createDemo(),application=state.tables.Applications.find(row=>row.stage==='offer');
  const identity=[application.application_id,application.candidate_id,application.job_id];
  recordDecision(state,application.application_id,'reject','Role requirements changed after review.');
  const cancelled=structuredClone(state.tables.Tasks.filter(row=>row.application_id===application.application_id));
  assert.ok(cancelled.some(row=>row.task_status==='cancelled'));
  const feedback=structuredClone(state.tables.Feedback);
  const rounds=structuredClone(state.tables.Rounds);
  const emails=structuredClone(state.tables.Emails);
  const history=structuredClone(state.tables.ActivityLog);
  const result=changeCandidateStage(state,application.application_id,'screening');
  assert.deepEqual(result,{kind:'updated',reopened:true});
  assert.equal(application.application_status,'active');
  assert.equal(application.recruiter_decision,'pending');
  assert.equal(application.decision_reason,'');
  assert.equal(application.closed_at,'');
  assert.equal(application.closure_reason,'');
  assert.deepEqual([application.application_id,application.candidate_id,application.job_id],identity);
  assert.deepEqual(state.tables.Tasks.filter(row=>row.application_id===application.application_id),cancelled);
  assert.deepEqual(state.tables.Feedback,feedback);
  assert.deepEqual(state.tables.Rounds,rounds);
  assert.deepEqual(state.tables.Emails,emails);
  assert.deepEqual(state.tables.ActivityLog.slice(0,history.length),history);
  assert.equal(JSON.parse(state.tables.ActivityLog.at(-1).old_value_json).application_status,'rejected');
  assert.deepEqual(validateImport(exportDatabase(state)).tables,state.tables);
});

test('invalid stages, missing applications, and selecting the current stage never mutate records',()=>{
  const state=createDemo(),application=state.tables.Applications[0];
  for(const action of [
    ()=>changeCandidateStage(state,application.application_id,'invalid-stage'),
    ()=>changeCandidateStage(state,application.application_id,undefined),
    ()=>changeCandidateStage(state,'missing-application','interview'),
  ]) {
    const before=structuredClone(state);assert.throws(action);assert.deepEqual(state,before);
  }
  const before=structuredClone(state);
  assert.deepEqual(changeCandidateStage(state,application.application_id,application.stage),{kind:'unchanged'});
  assert.deepEqual(state,before);
  const closed=state.tables.Applications.find(row=>row.stage==='closed');
  const closedBefore=structuredClone(state);
  assert.deepEqual(changeCandidateStage(state,closed.application_id,'closed'),{kind:'unchanged'});
  assert.deepEqual(state,closedBefore);
});

test('the direct dropdown shows all seven stages, selects the actual one, and safely binds application identity',()=>{
  const application=Object.freeze({application_id:'app" onfocus="evil()',stage:'test'});
  const before=structuredClone(application);
  const markup=renderCandidateStage(application,{e:escape,label:value=>value==='test'?'<script>evil()</script>':value});
  const options=[...markup.matchAll(/<option value="([^"]+)"[^>]*>/g)].map(match=>match[1]);
  assert.deepEqual(options,['sourced','screening','interview','test','offer','onboarding','closed']);
  assert.match(markup,/<option value="test" selected>/);
  assert.equal([...markup.matchAll(/<option\b[^>]*\bselected\b/g)].length,1);
  assert.match(markup,/data-change="candidate-stage"/);
  assert.match(markup,/data-application-id="app&quot; onfocus=&quot;evil\(\)"/);
  assert.doesNotMatch(markup,/\bonfocus="evil\(\)"|<script>/);
  assert.match(markup,/&lt;script&gt;evil\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup,/<select\b[^>]*\b(?:disabled|readonly)(?:\s|=|>)/);
  assert.deepEqual(application,before);
});
