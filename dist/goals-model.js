/**
 * Local goals and project tasks, deliberately separate from the ATS database.
 * Nothing here connects a provider, calls AI, seeds demo work, or sends mail.
 */
export const WORK_STORAGE_KEY = 'recruiting-goals-v1';
export const GOAL_STATUSES = ['active', 'on_hold', 'completed', 'archived'];
export const GOAL_CATEGORIES = ['recruiting', 'operations', 'other'];
export const GOAL_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
export const WORK_PRIORITIES = ['low', 'normal', 'high'];

const clone = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const labels = {title:'Tên',description:'Mô tả',success_criteria:'Điều kiện hoàn thành',owner:'Người phụ trách',target_date:'Ngày mục tiêu',due_date:'Hạn hoàn thành'};

function text(value, key, {required = false} = {}) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new Error(`${labels[key] || key} phải là văn bản.`);
  const result = (value ?? '').trim();
  if (required && !result) throw new Error(`Điền ${String(labels[key] || key).toLowerCase()}.`);
  return result;
}
function choice(value, choices, message) {
  if (!choices.includes(value)) throw new Error(message);
  return value;
}
function date(value, key) {
  const result = text(value, key);
  if (!result) return '';
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`${labels[key]} phải là ngày hợp lệ theo dạng YYYY-MM-DD.`);
  }
  return result;
}
function timestamp(value, key, {blank = false} = {}) {
  const result = text(value, key);
  if (blank && !result) return '';
  if (!result || !/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(`Mốc thời gian ${key} không hợp lệ.`);
  const parsedDay = new Date(`${result.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== result.slice(0, 10)) throw new Error(`Mốc thời gian ${key} không hợp lệ.`);
  return result;
}
function order(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Thứ tự task phải là số nguyên không âm.');
  return value;
}
function record(work, collection, recordId) {
  const key = collection === 'goals' ? 'goal_id' : 'task_id';
  const found = work[collection].find(item => item[key] === recordId);
  if (!found) throw new Error(collection === 'goals' ? 'Không tìm thấy goal.' : 'Không tìm thấy task.');
  return found;
}
function audit(work, entityType, entity, action, before) {
  const at = now();
  work.activity.push({
    activity_id:id('work_activity'), occurred_at:at, entity_type:entityType,
    entity_id:entity[entityType === 'goal' ? 'goal_id' : 'task_id'],
    goal_id:entity.goal_id, action, before:before ? clone(before) : null, after:clone(entity),
  });
  work.updated_at = at;
}
function goalFields(fields, current = null) {
  if (!isObject(fields)) throw new Error('Thông tin goal không hợp lệ.');
  const field = (key, fallback) => has(fields, key) ? fields[key] : current?.[key] ?? fallback;
  return {
    title:text(field('title', ''), 'title', {required:true}),
    description:text(field('description', ''), 'description'),
    success_criteria:text(field('success_criteria', ''), 'success_criteria'),
    category:choice(field('category', 'other'), GOAL_CATEGORIES, 'Nhóm goal không hợp lệ.'),
    owner:text(field('owner', ''), 'owner'),
    target_date:date(field('target_date', ''), 'target_date'),
    priority:choice(field('priority', 'normal'), WORK_PRIORITIES, 'Mức ưu tiên không hợp lệ.'),
  };
}
function taskFields(fields, current = null) {
  if (typeof fields === 'string') fields = {title:fields};
  if (!isObject(fields)) throw new Error('Thông tin task không hợp lệ.');
  const field = (key, fallback) => has(fields, key) ? fields[key] : current?.[key] ?? fallback;
  const result = {
    title:text(field('title', ''), 'title', {required:true}),
    description:text(field('description', ''), 'description'),
    owner:text(field('owner', ''), 'owner'),
    due_date:date(field('due_date', ''), 'due_date'),
    priority:choice(field('priority', 'normal'), WORK_PRIORITIES, 'Mức ưu tiên không hợp lệ.'),
    status:choice(field('status', 'todo'), GOAL_TASK_STATUSES, 'Trạng thái task không hợp lệ.'),
  };
  if (has(fields, 'order')) result.order = order(fields.order);
  return result;
}
function canComplete(work, goal, confirmed) {
  if (confirmed !== true) throw new Error('Cần xác nhận điều kiện hoàn thành trước khi đánh dấu goal hoàn thành.');
  if (!goal.success_criteria.trim()) throw new Error('Điền điều kiện hoàn thành của goal trước khi chốt kết quả.');
  const progress = goalProgress(work, goal.goal_id);
  if (!progress.total || progress.done !== progress.total) throw new Error('Hoàn thành các task còn lại trước khi chốt goal. Goal cần ít nhất một task chưa bị hủy.');
}
function canEditTasks(goal) {
  if (goal.status === 'archived') throw new Error('Mở lại goal đã lưu trữ trước khi chỉnh task.');
}
function todayInVietnam() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
  const part = key => parts.find(item => item.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function createWorkState() {
  return {schema_version:'1.0', goals:[], tasks:[], activity:[], updated_at:now()};
}

export function validateWorkState(value) {
  if (!isObject(value) || value.schema_version !== '1.0') throw new Error('File goals không đúng định dạng hoặc phiên bản được hỗ trợ.');
  if (!Array.isArray(value.goals) || !Array.isArray(value.tasks) || !Array.isArray(value.activity)) throw new Error('File goals cần có danh sách goals, tasks và activity.');
  const result = {schema_version:'1.0', goals:[], tasks:[], activity:[], updated_at:timestamp(value.updated_at, 'updated_at')};
  const goalIds = new Set(), taskIds = new Set(), activityIds = new Set();
  for (const original of value.goals) {
    if (!isObject(original)) throw new Error('Có goal không hợp lệ trong file.');
    const goalId = text(original.goal_id, 'goal_id', {required:true});
    if (goalIds.has(goalId)) throw new Error('File có goal_id bị trùng.');
    goalIds.add(goalId);
    const goal = {
      goal_id:goalId, ...goalFields(original),
      status:choice(original.status, GOAL_STATUSES, 'Trạng thái goal không hợp lệ.'),
      created_at:timestamp(original.created_at, 'created_at'), updated_at:timestamp(original.updated_at, 'updated_at'),
      completed_at:timestamp(original.completed_at, 'completed_at', {blank:true}),
    };
    if (goal.status === 'completed' && (!goal.success_criteria || !goal.completed_at)) throw new Error('Goal hoàn thành cần có điều kiện hoàn thành và mốc xác nhận.');
    if (['active','on_hold'].includes(goal.status) && goal.completed_at) throw new Error('Goal đang làm không được có mốc hoàn thành.');
    result.goals.push(goal);
  }
  for (const original of value.tasks) {
    if (!isObject(original)) throw new Error('Có task không hợp lệ trong file.');
    const taskId = text(original.task_id, 'task_id', {required:true});
    const goalId = text(original.goal_id, 'goal_id', {required:true});
    if (taskIds.has(taskId)) throw new Error('File có task_id bị trùng.');
    if (!goalIds.has(goalId)) throw new Error('Có task tham chiếu tới goal không tồn tại.');
    taskIds.add(taskId);
    const task = {
      task_id:taskId, goal_id:goalId, ...taskFields(original), order:order(original.order),
      created_at:timestamp(original.created_at, 'created_at'), updated_at:timestamp(original.updated_at, 'updated_at'),
      completed_at:timestamp(original.completed_at, 'completed_at', {blank:true}),
    };
    if (task.status === 'done' && !task.completed_at) throw new Error('Task hoàn thành cần có mốc hoàn thành.');
    if (task.status !== 'done' && task.completed_at) throw new Error('Task chưa hoàn thành không được có mốc hoàn thành.');
    result.tasks.push(task);
  }
  for (const goal of result.goals) {
    if (goal.status === 'completed' || goal.completed_at) {
      const tasks = result.tasks.filter(task => task.goal_id === goal.goal_id && task.status !== 'cancelled');
      if (!tasks.length || tasks.some(task => task.status !== 'done')) throw new Error('Goal đã hoàn thành nhưng còn task chưa xong hoặc không có task.');
    }
  }
  for (const original of value.activity) {
    if (!isObject(original)) throw new Error('Có lịch sử hoạt động không hợp lệ.');
    const activityId = text(original.activity_id, 'activity_id', {required:true});
    if (activityIds.has(activityId)) throw new Error('File có activity_id bị trùng.');
    activityIds.add(activityId);
    const entityType = choice(original.entity_type, ['goal','task'], 'Loại lịch sử hoạt động không hợp lệ.');
    const entityId = text(original.entity_id, 'entity_id', {required:true});
    const goalId = text(original.goal_id, 'goal_id', {required:true});
    if (!goalIds.has(goalId) || !(entityType === 'goal' ? goalIds : taskIds).has(entityId)) throw new Error('Lịch sử hoạt động tham chiếu tới dữ liệu không tồn tại.');
    if (entityType === 'goal' && entityId !== goalId) throw new Error('Lịch sử goal tham chiếu sai goal.');
    if (entityType === 'task' && result.tasks.find(task => task.task_id === entityId)?.goal_id !== goalId) throw new Error('Lịch sử task tham chiếu sai goal.');
    result.activity.push({
      activity_id:activityId, occurred_at:timestamp(original.occurred_at, 'occurred_at'), entity_type:entityType, entity_id:entityId, goal_id:goalId,
      action:choice(original.action, ['create','update','status_change'], 'Hành động trong lịch sử không hợp lệ.'),
      before:original.before == null ? null : clone(original.before), after:original.after == null ? null : clone(original.after),
    });
  }
  return result;
}

export function loadWorkState() {
  try {
    const raw = globalThis.localStorage?.getItem(WORK_STORAGE_KEY);
    return raw ? validateWorkState(JSON.parse(raw)) : null;
  } catch { return null; }
}
export function saveWorkState(work) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(validateWorkState(work)));
    return true;
  } catch { return false; }
}
export function exportWorkState(work) {
  return validateWorkState(work);
}

export function createGoal(work, fields) {
  const normalized = goalFields(fields), at = now();
  const status = fields.status ?? 'active';
  choice(status, ['active','on_hold'], 'Goal mới chỉ có thể đang làm hoặc tạm dừng.');
  const goal = {goal_id:id('goal'), ...normalized, status, created_at:at, updated_at:at, completed_at:''};
  work.goals.push(goal);
  audit(work, 'goal', goal, 'create', null);
  return goal;
}
export function updateGoal(work, goalId, fields) {
  const goal = record(work, 'goals', goalId), normalized = goalFields(fields, goal);
  if (has(fields, 'status') && fields.status !== goal.status) throw new Error('Dùng thao tác đổi trạng thái goal để lưu hoặc xác nhận hoàn thành.');
  if ((goal.status === 'completed' || goal.completed_at) && !normalized.success_criteria) throw new Error('Goal hoàn thành cần giữ điều kiện hoàn thành.');
  const before = clone(goal);
  Object.assign(goal, normalized, {updated_at:now()});
  audit(work, 'goal', goal, 'update', before);
  return goal;
}
export function addGoalTasks(work, goalId, tasks) {
  const goal = record(work, 'goals', goalId);
  canEditTasks(goal);
  if (goal.status === 'completed') throw new Error('Mở lại goal đã hoàn thành trước khi thêm task.');
  if (!Array.isArray(tasks) || !tasks.length) throw new Error('Thêm ít nhất một task.');
  const normalized = tasks.map(task => taskFields(task));
  let nextOrder = work.tasks.filter(task => task.goal_id === goalId).reduce((max, task) => Math.max(max, task.order + 1), 0);
  const records = normalized.map(fields => {
    const at = now();
    return {task_id:id('goal_task'), goal_id:goalId, ...fields, order:order(fields.order ?? nextOrder++), created_at:at, updated_at:at, completed_at:fields.status === 'done' ? at : ''};
  });
  for (const task of records) {
    work.tasks.push(task);
    audit(work, 'task', task, 'create', null);
  }
  goal.updated_at = work.updated_at;
  return records;
}
export function updateGoalTask(work, taskId, fields) {
  const task = record(work, 'tasks', taskId), goal = record(work, 'goals', task.goal_id);
  canEditTasks(goal);
  const normalized = taskFields(fields, task);
  if (goal.status === 'completed' && normalized.status !== task.status) throw new Error('Mở lại goal đã hoàn thành trước khi đổi trạng thái task.');
  const before = clone(task), at = now();
  Object.assign(task, normalized, {
    updated_at:at,
    completed_at:normalized.status === 'done' ? task.completed_at || at : '',
  });
  goal.updated_at = at;
  audit(work, 'task', task, before.status === task.status ? 'update' : 'status_change', before);
  return task;
}
export function toggleGoalTask(work, taskId) {
  const task = record(work, 'tasks', taskId);
  if (task.status === 'cancelled') throw new Error('Task đã hủy. Đổi trạng thái task trước khi đánh dấu hoàn thành.');
  return updateGoalTask(work, taskId, {status:task.status === 'done' ? 'todo' : 'done'});
}
export function setGoalStatus(work, goalId, status, {confirmed = false} = {}) {
  choice(status, GOAL_STATUSES, 'Trạng thái goal không hợp lệ.');
  const goal = record(work, 'goals', goalId);
  if (status === goal.status) return goal;
  if (status === 'completed') canComplete(work, goal, confirmed);
  const before = clone(goal), at = now();
  goal.status = status;
  goal.updated_at = at;
  if (status === 'completed') goal.completed_at = at;
  else if (status !== 'archived') goal.completed_at = '';
  audit(work, 'goal', goal, 'status_change', before);
  return goal;
}

export function getGoalTasks(work, goalId) {
  return work.tasks.filter(task => task.goal_id === goalId).sort((a,b) => a.order - b.order || a.created_at.localeCompare(b.created_at) || a.task_id.localeCompare(b.task_id));
}
export function goalProgress(work, goalId) {
  const tasks = work.tasks.filter(task => task.goal_id === goalId && task.status !== 'cancelled');
  const done = tasks.filter(task => task.status === 'done').length;
  return {total:tasks.length, done, percent:tasks.length ? Math.round(done / tasks.length * 100) : 0, blocked:tasks.filter(task => task.status === 'blocked').length};
}
export function getTodayGoalTasks(work, forDate = todayInVietnam()) {
  const day = date(forDate, 'due_date');
  if (!day) throw new Error('Cần một ngày để xem task đến hạn.');
  const active = new Set(work.goals.filter(goal => goal.status === 'active').map(goal => goal.goal_id));
  const priorities = {high:0, normal:1, low:2};
  return work.tasks.filter(task => active.has(task.goal_id) && task.due_date && task.due_date <= day && !['done','cancelled'].includes(task.status))
    .sort((a,b) => a.due_date.localeCompare(b.due_date) || priorities[a.priority] - priorities[b.priority] || a.order - b.order);
}

export function recruitingGoalTemplate() {
  return {
    title:'Xây quy trình tuyển dụng và ATS',
    description:'Xây quy trình tuyển dụng gồm ATS UI và database ứng viên: giữ thông tin lâu dài, có một trang quản lý tương tác để recruiter vận hành hằng ngày.',
    success_criteria:'Chạy thử trọn quy trình với một job; thông tin ứng viên, feedback và lịch sử được lưu lâu dài; các thao tác trên ATS đọc và ghi đúng database; recruiter duyệt quyết định và email trước khi gửi.',
    category:'recruiting', owner:'', target_date:'', priority:'normal',
    tasks:[
      {title:'Chốt workflow tuyển dụng',description:'Chốt screening, các interview round, Test 1–2, quyết định, nhắc việc và các tình huống ngoại lệ. Đối chiếu workflow đã thảo luận trước khi xác nhận xong.',status:'todo'},
      {title:'Hoàn thiện database lưu thông tin lâu dài',description:'Đã có Google Sheet Recruiting Database. Review các trường, hồ sơ ứng viên, feedback, lịch sử và cách sao lưu/migrate; xác nhận phù hợp trước khi đánh dấu xong.',status:'todo'},
      {title:'Chốt trải nghiệm UI ATS',description:'Đã có prototype ATS dùng thử. Review pipeline, hồ sơ, daily brief, email và thao tác recruiter; hoàn tất các chỉnh sửa cần thiết.',status:'todo'},
      {title:'Kết nối UI với Google Sheet hai chiều',description:'UI đọc và ghi dữ liệu thật vào Sheet; thêm hồ sơ, sửa status và feedback vẫn còn đúng sau khi tải lại; kiểm tra thao tác nhiều người.',status:'todo'},
      {title:'Kết nối Drive và tiếp nhận CV',description:'CV mới được nhận diện, gắn đúng ứng viên/job và lưu link tài liệu; xử lý trùng hồ sơ, bản CV mới và lỗi đọc file.',status:'todo'},
      {title:'Kết nối email, Calendar/Calendly và form HM',description:'Recruiter bấm gửi email và chọn attachments; lịch interview, buffer 15 phút có CV/câu hỏi và feedback HM cập nhật đúng. Kiểm tra quyền truy cập thực tế.',status:'todo'},
      {title:'Thêm AI và nhắc việc theo workflow',description:'AI đề xuất screening, câu hỏi cần đào sâu và next step; tạo brief và cảnh báo funnel sau 5 ngày làm việc. Recruiter giữ quyết định cuối cùng.',status:'todo'},
      {title:'Chạy thử một job trước khi dùng rộng hơn',description:'Chạy từ CV đến quyết định/offer, gồm reject, no-show, dời lịch, test và feedback chậm; sửa lỗi và xác nhận dữ liệu được lưu đúng.',status:'todo'},
    ],
  };
}
