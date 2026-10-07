import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_STORAGE_KEY, createWorkState, loadWorkState, saveWorkState,
  validateWorkState, exportWorkState, createGoal, updateGoal, addGoalTasks,
  updateGoalTask, toggleGoalTask, setGoalStatus, goalProgress,
  getGoalTasks, getTodayGoalTasks, recruitingGoalTemplate,
} from '../dist/goals-model.js';
import {
  STORAGE_KEY as ATS_STORAGE_KEY, createDemo as createATSDemo,
  createEmpty as createEmptyATS, exportDatabase, saveState as saveATSState,
  loadState as loadATSState,
} from '../dist/model.js';

const clone = value => structuredClone(value);
const newGoal = (work, fields = {}) => createGoal(work, {
  title:'Hoàn thiện quy trình tuyển dụng',
  success_criteria:'Chạy thử một job và kiểm tra dữ liệu đã được lưu đúng.',
  category:'recruiting', target_date:'2026-10-30', ...fields,
});
const task = (work, goal, fields = {}) => addGoalTasks(work, goal.goal_id, [
  {title:'Review workflow', due_date:'2026-10-07', ...fields},
])[0];

test('Goals starts empty and its export stays separate from the ten ATS database tables', () => {
  const ats = createATSDemo(), before = clone(exportDatabase(ats).tables);
  const work = createWorkState();
  assert.deepEqual(work.goals, []);
  assert.deepEqual(work.tasks, []);
  assert.deepEqual(work.activity, []);
  const goal = newGoal(work); task(work, goal);
  assert.deepEqual(exportDatabase(ats).tables, before);
  assert.equal(Object.keys(exportDatabase(ats).tables).length, 10);
  assert.ok(!Object.hasOwn(exportDatabase(ats).tables, 'Goals'));
  const exported = exportWorkState(work);
  assert.ok(Array.isArray(exported.goals) && Array.isArray(exported.tasks));
  assert.ok(!Object.hasOwn(exported, 'tables'));
});

test('goal creation and metadata edits preserve identity and auditable before/after records', () => {
  const work = createWorkState();
  const goal = newGoal(work, {title:'  Chốt workflow  ', owner:'  Recruiter  ', priority:'high'});
  assert.equal(goal.title, 'Chốt workflow');
  assert.equal(goal.owner, 'Recruiter');
  assert.equal(goal.status, 'active');
  const id = goal.goal_id;
  updateGoal(work, id, {description:'Review cùng HM', target_date:'2026-11-02'});
  assert.equal(goal.goal_id, id);
  assert.equal(goal.description, 'Review cùng HM');
  assert.equal(goal.target_date, '2026-11-02');
  const history = work.activity.findLast(item => item.entity_id === id);
  assert.equal(history.action, 'update');
  assert.equal(history.before.description, '');
  assert.equal(history.after.description, 'Review cùng HM');
  const before = clone(work);
  assert.throws(() => updateGoal(work, id, {status:'completed'}));
  assert.deepEqual(work, before);
});

test('adding a batch of goal tasks is atomic and task completion keeps its identity', () => {
  const work = createWorkState(), goal = newGoal(work);
  const before = clone(work);
  assert.throws(() => addGoalTasks(work, goal.goal_id, ['Task hợp lệ', {title:'   '}]));
  assert.deepEqual(work, before);
  assert.throws(() => addGoalTasks(work, goal.goal_id, []));
  const tasks = addGoalTasks(work, goal.goal_id, ['Task một', {title:'Task hai', owner:'HM', status:'blocked'}]);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map(item => item.order), [0, 1]);
  assert.equal(tasks[1].goal_id, goal.goal_id);
  const id = tasks[0].task_id;
  toggleGoalTask(work, id);
  assert.equal(tasks[0].task_id, id);
  assert.equal(tasks[0].status, 'done');
  assert.ok(tasks[0].completed_at);
  updateGoalTask(work, id, {description:'Bằng chứng đã kiểm tra'});
  assert.equal(tasks[0].description, 'Bằng chứng đã kiểm tra');
  assert.equal(getGoalTasks(work, goal.goal_id)[0].task_id, id);
});

test('progress ignores cancelled work and neither empty nor all-cancelled goals imply completion', () => {
  const work = createWorkState(), goal = newGoal(work);
  assert.deepEqual(goalProgress(work, goal.goal_id), {total:0, done:0, percent:0, blocked:0});
  const tasks = addGoalTasks(work, goal.goal_id, [
    {title:'Đã làm', status:'done'}, {title:'Bị chặn', status:'blocked'}, {title:'Bỏ scope', status:'cancelled'},
  ]);
  assert.deepEqual(goalProgress(work, goal.goal_id), {total:2, done:1, percent:50, blocked:1});
  assert.equal(goal.status, 'active');
  updateGoalTask(work, tasks[0].task_id, {status:'cancelled'});
  updateGoalTask(work, tasks[1].task_id, {status:'cancelled'});
  assert.deepEqual(goalProgress(work, goal.goal_id), {total:0, done:0, percent:0, blocked:0});
  assert.equal(goal.status, 'active');
  assert.throws(() => toggleGoalTask(work, tasks[2].task_id));
});

test('a goal completes only after all remaining tasks, criteria, and explicit human confirmation', () => {
  const work = createWorkState(), goal = newGoal(work, {success_criteria:''});
  const tasks = addGoalTasks(work, goal.goal_id, ['Task một', 'Task hai']);
  const initial = clone(work);
  assert.throws(() => setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true}));
  assert.deepEqual(work, initial);
  updateGoal(work, goal.goal_id, {success_criteria:'Đã thử và xác nhận kết quả.'});
  toggleGoalTask(work, tasks[0].task_id);
  assert.throws(() => setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true}));
  toggleGoalTask(work, tasks[1].task_id);
  assert.equal(goalProgress(work, goal.goal_id).percent, 100);
  assert.equal(goal.status, 'active');
  const allDone = clone(work);
  assert.throws(() => setGoalStatus(work, goal.goal_id, 'completed'));
  assert.deepEqual(work, allDone);
  setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true});
  assert.equal(goal.status, 'completed');
  assert.ok(goal.completed_at);
  assert.equal(work.activity.at(-1).action, 'status_change');
});

test('explicit confirmation cannot complete an empty goal or one with only cancelled tasks', () => {
  const work = createWorkState(), goal = newGoal(work);
  assert.throws(() => setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true}));
  task(work, goal, {status:'cancelled'});
  const before = clone(work);
  assert.throws(() => setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true}));
  assert.deepEqual(work, before);
  assert.equal(goalProgress(work, goal.goal_id).percent, 0);
});

test('a completed or archived goal must be reopened before task work can resume', () => {
  const work = createWorkState(), goal = newGoal(work), item = task(work, goal);
  toggleGoalTask(work, item.task_id);
  setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true});
  const before = clone(work);
  assert.throws(() => toggleGoalTask(work, item.task_id));
  assert.throws(() => addGoalTasks(work, goal.goal_id, ['Task phát sinh']));
  assert.deepEqual(work, before);
  setGoalStatus(work, goal.goal_id, 'active');
  toggleGoalTask(work, item.task_id);
  assert.equal(item.status, 'todo');
  assert.equal(item.completed_at, '');
  assert.equal(goal.completed_at, '');
  setGoalStatus(work, goal.goal_id, 'archived');
  const archived = clone(work);
  assert.throws(() => updateGoalTask(work, item.task_id, {title:'Thay đổi chưa được phép'}));
  assert.throws(() => addGoalTasks(work, goal.goal_id, ['Task mới']));
  assert.deepEqual(work, archived);
  setGoalStatus(work, goal.goal_id, 'active');
  updateGoalTask(work, item.task_id, {title:'Task sau khi mở lại'});
  assert.equal(item.title, 'Task sau khi mở lại');
});

test('today brief shows only due unfinished tasks under active goals, ordered by date and priority', () => {
  const work = createWorkState(), active = newGoal(work), held = newGoal(work, {status:'on_hold'}), archived = newGoal(work);
  const overdue = task(work, active, {title:'Quá hạn', due_date:'2026-10-06', priority:'low'});
  const high = task(work, active, {title:'Hôm nay high', priority:'high', status:'blocked'});
  const normal = task(work, active, {title:'Hôm nay normal', status:'in_progress'});
  task(work, active, {title:'Mai mới tới hạn', due_date:'2026-10-08'});
  task(work, active, {title:'Không deadline', due_date:''});
  task(work, active, {title:'Đã hoàn thành', status:'done'});
  task(work, active, {title:'Đã hủy', status:'cancelled'});
  task(work, held); task(work, archived);
  setGoalStatus(work, archived.goal_id, 'archived');
  assert.deepEqual(getTodayGoalTasks(work, '2026-10-07').map(item => item.task_id), [overdue.task_id, high.task_id, normal.task_id]);
  assert.throws(() => getTodayGoalTasks(work, '2026-02-30'));
});

test('invalid goal and task edits leave state unchanged and actual calendar dates are enforced', () => {
  const work = createWorkState(), goal = newGoal(work), item = task(work, goal);
  for (const action of [
    () => createGoal(work, {title:'   '}),
    () => createGoal(work, {title:'Bad date', target_date:'2026-02-30'}),
    () => updateGoal(work, goal.goal_id, {category:'unknown'}),
    () => updateGoal(work, goal.goal_id, {target_date:'2026-04-31'}),
    () => updateGoalTask(work, item.task_id, {due_date:'2026-02-29'}),
    () => updateGoalTask(work, item.task_id, {status:'unknown'}),
    () => updateGoalTask(work, item.task_id, {order:-1}),
    () => setGoalStatus(work, goal.goal_id, 'unknown'),
  ]) {
    const before = clone(work); assert.throws(action); assert.deepEqual(work, before);
  }
  updateGoal(work, goal.goal_id, {target_date:'2028-02-29'});
  updateGoalTask(work, item.task_id, {due_date:'2028-02-29'});
  assert.equal(item.due_date, '2028-02-29');
});

test('Goals export and import retain task links, timestamps, progress, and audit history', () => {
  const work = createWorkState(), goal = newGoal(work), item = task(work, goal);
  toggleGoalTask(work, item.task_id);
  setGoalStatus(work, goal.goal_id, 'completed', {confirmed:true});
  const imported = validateWorkState(JSON.parse(JSON.stringify(exportWorkState(work))));
  assert.deepEqual(imported, work);
  assert.notEqual(imported, work);
  assert.notEqual(imported.goals[0], work.goals[0]);
  assert.equal(imported.tasks[0].goal_id, goal.goal_id);
  assert.equal(imported.goals[0].status, 'completed');
  assert.equal(goalProgress(imported, goal.goal_id).percent, 100);
  assert.equal(imported.activity.at(-1).after.status, 'completed');
});

test('Goals import rejects dangling links, duplicate IDs, impossible dates and inconsistent completion', () => {
  const work = createWorkState(), goal = newGoal(work), item = task(work, goal);
  const changes = [
    value => { value.tasks[0].goal_id = 'missing-goal'; },
    value => { value.goals.push(clone(value.goals[0])); },
    value => { value.tasks.push(clone(value.tasks[0])); },
    value => { value.tasks[0].due_date = '2026-02-30'; },
    value => { value.goals[0].created_at = '2026-02-30T08:00:00.000Z'; },
    value => { value.activity[0].entity_id = 'missing-entity'; },
    value => { value.goals[0].status = 'completed'; value.goals[0].completed_at = new Date().toISOString(); },
    value => { value.tasks[0].status = 'done'; value.tasks[0].completed_at = ''; },
  ];
  for (const change of changes) { const invalid = clone(work); change(invalid); assert.throws(() => validateWorkState(invalid)); }
  const secondGoal = newGoal(work), secondTask = task(work, secondGoal);
  const wrongHistory = clone(work);
  const activity = wrongHistory.activity.find(event => event.entity_id === item.task_id);
  activity.goal_id = secondTask.goal_id;
  assert.throws(() => validateWorkState(wrongHistory));
});

test('Goals local storage has its own key and never replaces ATS records', () => {
  assert.notEqual(WORK_STORAGE_KEY, ATS_STORAGE_KEY);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map();
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{
    getItem:key => memory.get(key) ?? null,
    setItem:(key, value) => memory.set(key, String(value)),
  }});
  try {
    const ats = createEmptyATS(); assert.equal(saveATSState(ats), true);
    const atsBefore = memory.get(ATS_STORAGE_KEY);
    const work = createWorkState(); newGoal(work);
    assert.equal(saveWorkState(work), true);
    assert.equal(memory.get(ATS_STORAGE_KEY), atsBefore);
    assert.deepEqual(loadWorkState(), work);
    assert.deepEqual(loadATSState(), ats);
    assert.ok(memory.has(WORK_STORAGE_KEY));
    const storedWork = memory.get(WORK_STORAGE_KEY), invalid = clone(work);
    invalid.goals[0].title = '   ';
    assert.equal(saveWorkState(invalid), false);
    assert.equal(memory.get(WORK_STORAGE_KEY), storedWork);
    assert.equal(memory.get(ATS_STORAGE_KEY), atsBefore);
    memory.set(WORK_STORAGE_KEY, '{invalid JSON');
    assert.equal(loadWorkState(), null);
    assert.deepEqual(loadATSState(), ats);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('the recruiting preset returns independent todo examples without claiming AI execution or precompleting work', () => {
  const work = createWorkState(), before = clone(work);
  const preset = recruitingGoalTemplate();
  assert.ok(preset.title && preset.success_criteria);
  assert.ok(preset.tasks.length >= 6);
  assert.ok(preset.tasks.every(item => item.status === 'todo'));
  assert.deepEqual(work, before);
  preset.tasks[0].title = 'Edited proposal';
  assert.notEqual(recruitingGoalTemplate().tasks[0].title, 'Edited proposal');
  assert.ok(preset.tasks.some(item => /AI/.test(item.title)));
  const goal = createGoal(work, preset);
  addGoalTasks(work, goal.goal_id, preset.tasks);
  assert.equal(goalProgress(work, goal.goal_id).percent, 0);
  assert.equal(goal.status, 'active');
});
