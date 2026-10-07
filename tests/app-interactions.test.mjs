import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDemo, STORAGE_KEY} from '../dist/model.js';
import {createWorkState, WORK_STORAGE_KEY} from '../dist/goals-model.js';
import {getGreeting, getDailyQuote} from '../dist/today-widgets.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function classList() {
  const classes = new Set();
  return {
    add: (...values) => values.forEach(value => classes.add(value)),
    remove: (...values) => values.forEach(value => classes.delete(value)),
    contains: value => classes.has(value),
    toggle(value, force) {const enabled=force ?? !classes.has(value); if(enabled)classes.add(value);else classes.delete(value);return enabled;},
  };
}

function element(extra = {}) {
  return {innerHTML:'',textContent:'',classList:classList(),dataset:{},tagName:'DIV',isConnected:true,
    focus(){},closest(){return null;},querySelector(){return null;},matches(){return false;},...extra};
}

function optionsFor(html, field) {
  const select = html.match(new RegExp(`<select\\b[^>]*name="${field}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select, `Expected ${field} selection to be available.`);
  return [...select[1].matchAll(/<option\s+value="([^"]*)"([^>]*)>/g)].map(([,value,attributes])=>({value,selected:/\bselected\b/.test(attributes)}));
}

test('actual app events retain completed work, preserve inline drafts, and require an explicit closure decision', async () => {
  // This is a Node-only event integration harness. It supplies no browser,
  // network, layout engine, or simulated provider integration.
  const schema = JSON.parse(await readFile(new URL('../dist/schema.json', import.meta.url),'utf8'));
  const initial = createDemo();
  const selectedTask = initial.tables.Tasks.find(task=>task.task_type==='review_cv' && task.task_status==='open');
  const selectedApplication = initial.tables.Applications.find(application=>application.application_id===selectedTask.application_id);
  const selectedCandidate = initial.tables.Candidates.find(candidate=>candidate.candidate_id===selectedApplication.candidate_id);
  const originalNotes = selectedCandidate.notes;
  const originalEmails = structuredClone(initial.tables.Emails);
  const identity = [selectedTask.task_id,selectedTask.application_id,selectedTask.job_id,selectedTask.round_id];
  const values = new Map([
    [STORAGE_KEY, JSON.stringify(initial)],
    [WORK_STORAGE_KEY, JSON.stringify(createWorkState())],
    ['recruiting-profile-v1', JSON.stringify({display_name:'Linh'})],
  ]);
  const localStorage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const app=element(), overlay=element(), toast=element(), drawerBody=element({scrollTop:31});
  const greeting=element(), quote=element(), date=element(), stageFocus=element();
  const nodes=new Map([['#app',app],['#overlay',overlay],['#toast',toast],['.drawer-body',drawerBody],['.candidate-stage-select',stageFocus],['#today-greeting',greeting],['#today-quote',quote],['#today-date',date]]);
  const listeners=new Map(), intervalCallbacks=[];
  const document={
    body:element(),hidden:false,activeElement:element(),
    querySelector:selector=>nodes.get(selector)??null,
    querySelectorAll:()=>[],
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback);},
  };
  class FormDataStub {
    constructor(form){this.values=Object.entries(form.fields??{});}
    *[Symbol.iterator](){yield* this.values;}
    get(name){return this.values.find(([key])=>key===name)?.[1]??null;}
    getAll(name){return this.values.filter(([key])=>key===name).map(([,value])=>value);}
  }
  const installed = {
    document, window:{addEventListener(){}}, localStorage, FormData:FormDataStub,
    fetch:async url=>{assert.equal(url,'./schema.json');return {json:async()=>schema};},
    setInterval:callback=>{intervalCallbacks.push(callback);return intervalCallbacks.length;},
    clearInterval(){},setTimeout:()=>1,clearTimeout(){},
  };
  const descriptors = new Map(Object.keys(installed).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(installed))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const stored=()=>JSON.parse(localStorage.getItem(STORAGE_KEY));
  const dispatch=async(type,target,extra={})=>{
    const event={target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
    for(const listener of listeners.get(type)??[])await listener(event);
    return event;
  };
  const click=async(action,id)=>{
    const target=element({tagName:'BUTTON',dataset:{action,id},closest(selector){return selector==='[data-action]'?this:null;}});
    return dispatch('click',target);
  };
  try {
    await import('../dist/app.js');

    assert.ok(app.innerHTML.includes(escape(getGreeting(new Date(),'Linh'))));
    assert.ok(app.innerHTML.includes(escape(getDailyQuote())));
    assert.match(app.innerHTML, /<details class="open-jobs-summary panel"><summary>/);
    assert.match(app.innerHTML, /2 vị trí · 8 hồ sơ đang xử lý · 1 hồ sơ ở Offer/);
    assert.equal(intervalCallbacks.length,1,'App installs one refresh timer, which the harness does not run automatically.');

    await click('complete-task',selectedTask.task_id);
    let task=stored().tables.Tasks.find(row=>row.task_id===selectedTask.task_id);
    assert.equal(task.task_status,'done');
    assert.ok(task.completed_at);
    const completedHeading=app.innerHTML.indexOf('ĐÃ HOÀN TẤT HÔM NAY');
    assert.ok(completedHeading>app.innerHTML.indexOf('SẮP TỚI'));
    const completedHtml=app.innerHTML.slice(completedHeading);
    assert.ok(completedHtml.includes(escape(selectedTask.title)),'Completed task stays visible below pending/upcoming work.');
    assert.match(completedHtml, /class="task-row is-complete"/);
    assert.ok(completedHtml.includes(`data-action="undo-task" data-id="${selectedTask.task_id}"`));

    await click('undo-task',selectedTask.task_id);
    task=stored().tables.Tasks.find(row=>row.task_id===selectedTask.task_id);
    assert.equal(task.task_status,'open');
    assert.equal(task.completed_at,'');
    assert.deepEqual([task.task_id,task.application_id,task.job_id,task.round_id],identity);

    await click('open-candidate',selectedApplication.application_id);
    assert.ok(overlay.innerHTML.includes(escape(selectedCandidate.full_name)));
    assert.match(overlay.innerHTML, /class="candidate-stage-select"/);
    assert.ok(!overlay.innerHTML.includes('decision-block'),'The removed recruiter-decision panel is absent.');
    assert.ok(!overlay.innerHTML.includes('Đổi giai đoạn'),'The old Change stage button is absent.');

    const draftText='Unsaved candidate note — keep this while changing stage.';
    const error=element({hidden:true});
    const form=element({dataset:{recruitingField:'notes',applicationId:selectedApplication.application_id},fields:{notes:draftText},querySelector:selector=>selector==='.inline-recruiting-error'?error:null});
    const input=element({tagName:'TEXTAREA',closest:selector=>selector==='[data-recruiting-field]'?form:null});
    await dispatch('input',input);
    const control=element({tagName:'SELECT',value:'interview',dataset:{change:'candidate-stage',applicationId:selectedApplication.application_id}});
    await dispatch('change',control);
    let application=stored().tables.Applications.find(row=>row.application_id===selectedApplication.application_id);
    assert.equal(application.stage,'interview');
    assert.equal(application.application_status,'active');
    assert.equal(application.candidate_id,selectedApplication.candidate_id);
    assert.ok(overlay.innerHTML.includes(draftText),'Inline notes survive the stage-triggered rerender.');
    assert.equal(stored().tables.Candidates.find(row=>row.candidate_id===selectedCandidate.candidate_id).notes,originalNotes,'An unsaved draft is not silently committed.');
    assert.deepEqual(stored().tables.Emails,originalEmails,'Stage changes do not send or alter email records.');
    const beforeTimer=overlay.innerHTML;
    intervalCallbacks[0]();
    assert.equal(overlay.innerHTML,beforeTimer,'Same-day greeting refresh does not replace an open candidate form.');

    const beforeClosing=localStorage.getItem(STORAGE_KEY);
    control.value='closed';
    await dispatch('change',control);
    assert.equal(control.value,'interview','The selector resets until closure is explicitly saved.');
    assert.equal(localStorage.getItem(STORAGE_KEY),beforeClosing,'Choosing closed opens a prompt without closing the application.');
    assert.match(overlay.innerHTML,/Đóng hồ sơ ứng viên/);
    const closureOptions=optionsFor(overlay.innerHTML,'application_status');
    assert.equal(closureOptions.find(option=>option.selected)?.value,'rejected');
    assert.ok(!closureOptions.some(option=>['active','on_hold'].includes(option.value)));
    await click('close-modal');
    assert.equal(localStorage.getItem(STORAGE_KEY),beforeClosing);
    assert.ok(!overlay.innerHTML.includes('id="modal-form"'));
    assert.ok(overlay.innerHTML.includes(draftText),'Canceling closure keeps the notes draft.');

    await click('application-status',selectedApplication.application_id);
    assert.deepEqual(optionsFor(overlay.innerHTML,'application_status').map(option=>option.value),['active','on_hold'],'Active application status form retains pause/resume, without unsaveable terminal options.');
    assert.equal(localStorage.getItem(STORAGE_KEY),beforeClosing);
  } finally {
    for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
