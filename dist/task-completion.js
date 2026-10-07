/** Today selectors are read-only; completion changes remain in the ATS model. */
export { undoTaskCompletion, getTaskUndoBlockReason } from './model.js';

const priorityRank = {high:0, normal:1, low:2};
const empty = value => value == null || (typeof value==='string' && !value.trim());

function vietnamDate(value) {
  if (empty(value)) return '';
  const timestamp=new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp);
  const get=type=>parts.find(part=>part.type===type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function validateDay(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ngày xem công việc cần có dạng YYYY-MM-DD.');
  const parsed=new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw new Error('Ngày xem công việc không hợp lệ.');
  return value;
}

const dueTime = value => empty(value) ? Infinity : Date.parse(value);

/**
 * Keep unfinished work separate from work finished today, so the view can
 * append completed rows without hiding the user's progress. `todayKey` can
 * be the existing UI helper function or an explicit YYYY-MM-DD date.
 */
export function getTodayRecruitingTasks(state,{dateKey=vietnamDate,todayKey,jobFilter='all',now=new Date()}={}) {
  const nowTime=new Date(now).getTime();
  if (!Number.isFinite(nowTime)) throw new Error('Mốc thời gian xem công việc không hợp lệ.');
  const day=validateDay(typeof todayKey==='function' ? todayKey() : todayKey ?? vietnamDate(now));
  if (typeof dateKey!=='function') throw new Error('Cần hàm định dạng ngày để xem công việc.');
  const pending=[],completed=[];
  for (const [index,task] of state.tables.Tasks.entries()) {
    if (jobFilter!=='all' && task.job_id!==jobFilter) continue;
    if (task.task_status==='done') {
      if (!empty(task.completed_at) && dateKey(task.completed_at)===day) completed.push({task,index});
      continue;
    }
    if (!['open','in_progress','snoozed'].includes(task.task_status)) continue;
    if (!empty(task.due_at)) {
      const dueDay=dateKey(task.due_at);
      if (!dueDay || dueDay>day) continue;
    }
    if (task.task_status==='snoozed' && !empty(task.snoozed_until) && !(Date.parse(task.snoozed_until)<=nowTime)) continue;
    pending.push({task,index});
  }
  pending.sort((a,b)=>(priorityRank[a.task.priority] ?? 1)-(priorityRank[b.task.priority] ?? 1) || dueTime(a.task.due_at)-dueTime(b.task.due_at) || a.index-b.index);
  completed.sort((a,b)=>Date.parse(b.task.completed_at)-Date.parse(a.task.completed_at) || a.index-b.index);
  return {pending:pending.map(({task})=>task),completed:completed.map(({task})=>task)};
}

/** Finished goal tasks remain visible even when the goal was completed too. */
export function getTodayCompletedGoalTasks(work,todayDate=vietnamDate(new Date())) {
  const day=validateDay(todayDate);
  const visibleGoals=new Set(work.goals.filter(goal=>['active','completed'].includes(goal.status)).map(goal=>goal.goal_id));
  return work.tasks.map((task,index)=>({task,index}))
    .filter(({task})=>visibleGoals.has(task.goal_id) && task.status==='done' && vietnamDate(task.completed_at)===day)
    .sort((a,b)=>Date.parse(b.task.completed_at)-Date.parse(a.task.completed_at) || a.index-b.index)
    .map(({task})=>task);
}
