import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoalsFeature} from '../dist/goals-view.js';
import {createWorkState,validateWorkState,goalProgress,getTodayGoalTasks} from '../dist/goals-model.js';

function harness() {
  let work=createWorkState(), modal;
  const ui={page:'goals',goalId:null,goalFilter:'active',goalCategory:'all',goalSearch:''};
  const messages=[], downloads=[];
  const text=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const feature=createGoalsFeature({
    getWork:()=>work,setWork:v=>{work=v;},getUi:()=>ui,render:()=>{},
    persist:()=>{work=validateWorkState(work);},e:text,icon:()=>'',
    header:(title,subtitle,actions)=>`${text(title)}${text(subtitle)}${actions}`,
    button:(title,action,kind,icon,extra='')=>`<button data-action="${action}" ${extra}>${text(title)}</button>`,
    field:(name,title,value)=>`<input name="${name}" value="${text(value)}">`,select:()=>'',dateLabel:v=>v,
    showModal:v=>{modal=v;},toast:v=>messages.push(v),download:(...args)=>downloads.push(args),
  });
  const data=values=>{const f=new FormData();for(const [key,value] of Object.entries(values))f.append(key,value);return f;};
  const create=()=>{feature.handleAction('goal-create',{});modal.onSubmit(data({title:'Goal UI test',description:'Build a workflow',success_criteria:'Data is retained and editable',category:'operations',owner:'Recruiter',target_date:'',priority:'normal',initial_tasks:'1. Confirm scope\n- Build prototype'}));return work.goals[0];};
  return {feature,ui,messages,downloads,data,create,getWork:()=>work,getModal:()=>modal};
}

test('Goal view creates an editable plan, saves task deadlines, and requires final confirmation',()=>{
  const h=harness(),g=h.create();
  assert.equal(h.getWork().tasks.length,2);
  assert.equal(h.ui.goalId,g.goal_id);
  const t=h.getWork().tasks[0];
  h.feature.handleAction('goal-task-edit',{id:t.task_id});
  h.getModal().onSubmit(h.data({title:t.title,description:'Ready when signed off',owner:'Recruiter',due_date:'2026-10-07',status:'in_progress',priority:'high'}));
  assert.equal(getTodayGoalTasks(h.getWork(),'2026-10-07')[0].task_id,t.task_id);
  assert.match(h.feature.renderTaskBrief(h.getWork().tasks[0]),/data-action="goal-open"/);
  h.feature.handleAction('goal-finish',{id:g.goal_id});
  assert.match(h.messages.at(-1),/Hoàn tất các task/);
  for(const row of [...h.getWork().tasks])h.feature.handleAction('goal-toggle-task',{id:row.task_id});
  assert.equal(goalProgress(h.getWork(),g.goal_id).percent,100);
  assert.equal(h.getWork().goals[0].status,'active');
  h.feature.handleAction('goal-finish',{id:g.goal_id});
  h.getModal().onSubmit(h.data({confirmed:'yes'}));
  assert.equal(h.getWork().goals[0].status,'completed');
  assert.match(h.feature.renderPage(),/Mở lại goal/);
});

test('Goal view exports parseable separate JSON and clear-filters actually clears the search',()=>{
  const h=harness();h.create();
  h.feature.handleAction('goal-export',{});
  const json=JSON.parse(h.downloads[0][0]);
  assert.equal(validateWorkState(json).tasks.length,2);
  assert.ok(!json.tables);
  Object.assign(h.ui,{goalId:null,goalFilter:'completed',goalCategory:'recruiting',goalSearch:'no matching name'});
  assert.match(h.feature.renderPage(),/goal-clear-filters/);
  h.feature.handleAction('goal-clear-filters',{});
  assert.equal(h.ui.goalSearch,'');
  assert.equal(h.ui.goalCategory,'all');
  assert.equal(h.ui.goalFilter,'all');
  assert.match(h.feature.renderPage(),/Goal UI test/);
});
