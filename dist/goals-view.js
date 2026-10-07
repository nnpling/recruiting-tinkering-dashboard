import {
  createGoal, updateGoal, addGoalTasks, updateGoalTask, toggleGoalTask,
  setGoalStatus, goalProgress, getGoalTasks, recruitingGoalTemplate,
  validateWorkState, exportWorkState,
} from './goals-model.js';

export function createGoalsFeature(h) {
  const { e, icon, header, button, field, select, dateLabel, showModal, toast, download } = h;
  const categories = { recruiting: 'Tuyển dụng', operations: 'Operation', other: 'Khác' };
  const statuses = { active: 'Đang thực hiện', on_hold: 'Tạm dừng', completed: 'Hoàn thành', archived: 'Đã lưu trữ' };
  const taskStatuses = { todo: 'Chưa làm', in_progress: 'Đang làm', blocked: 'Đang chờ', done: 'Hoàn tất', cancelled: 'Đã hủy' };
  const priorities = { low: 'Thấp', normal: 'Bình thường', high: 'Cao' };
  const work = () => h.getWork();
  const ui = () => h.getUi();
  const goal = (id) => work().goals.find(g => g.goal_id === id);
  const task = (id) => work().tasks.find(t => t.task_id === id);
  const badge = (status, text) => `<span class="chip ${['completed','done'].includes(status)?'green':['on_hold','blocked'].includes(status)?'amber':'gray'}">${e(text || statuses[status] || taskStatuses[status] || status)}</span>`;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Saigon', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
  const openGoal = (id) => { Object.assign(ui(), {page:'goals',goalId:id,menu:false}); h.render(); };
  const taskLines = (text) => text.split('\n').map(line => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '')).filter(Boolean);

  function renderPage() {
    if (ui().goalId && goal(ui().goalId)) return renderDetail(goal(ui().goalId));
    const query = (ui().goalSearch || '').toLocaleLowerCase('vi');
    const list = work().goals.filter(g => (ui().goalFilter==='all' || g.status===ui().goalFilter) && (ui().goalCategory==='all'||g.category===ui().goalCategory) && `${g.title} ${g.description} ${g.owner}`.toLocaleLowerCase('vi').includes(query));
    const totalActive = work().goals.filter(g => g.status==='active').length;
    const doneGoals = work().goals.filter(g => g.status==='completed').length;
    const remaining = work().tasks.filter(t => !['done','cancelled'].includes(t.status) && goal(t.goal_id)?.status==='active').length;
    const due = work().tasks.filter(t => t.due_date && t.due_date<=today() && !['done','cancelled'].includes(t.status) && goal(t.goal_id)?.status==='active').length;
    return header('Mục tiêu lớn. Từng bước nhỏ.', 'Giữ rõ kết quả cần đạt, chia việc và theo dõi tiến độ của từng goal.', button('Tạo goal','goal-create','primary','plus'), 'GOALS & PROJECTS') +
      `<div class="goals-stats-grid stats-grid"><div class="stat-card"><div class="row muted">${icon('target')} Goal đang làm</div><div class="stat-value">${totalActive}<span>mục tiêu</span></div></div><div class="stat-card"><div class="row muted">${icon('list')} Task cần làm</div><div class="stat-value">${remaining}<span>task</span></div></div><div class="stat-card"><div class="row muted">${icon('clock')} Task đến hạn</div><div class="stat-value">${due}<span>cần xử lý</span></div></div><div class="stat-card"><div class="row muted">${icon('check')} Goal hoàn thành</div><div class="stat-value">${doneGoals}<span>mục tiêu</span></div></div></div>
      <div class="goals-toolbar toolbar"><label class="search">${icon('search')}<input id="goal-search" aria-label="Tìm goal" placeholder="Tìm goal, mô tả, người phụ trách…" value="${e(ui().goalSearch)}" /></label><div class="filter-tabs">${[['active','Đang làm'],['all','Tất cả'],['completed','Hoàn thành'],['on_hold','Tạm dừng'],['archived','Lưu trữ']].map(([v,n])=>`<button data-action="goal-filter" data-value="${v}" class="${ui().goalFilter===v?'active':''}">${n}</button>`).join('')}</div><select data-change="goal-category" aria-label="Lọc lĩnh vực goal"><option value="all">Mọi lĩnh vực</option>${Object.entries(categories).map(([v,n])=>`<option value="${v}" ${ui().goalCategory===v?'selected':''}>${n}</option>`).join('')}</select></div>
      ${!work().goals.length?renderEmpty():list.length?`<div class="goals-grid">${list.map(renderCard).join('')}</div>`:`<div class="empty-state">${icon('target',32)}<h3>Không có goal trong bộ lọc này</h3><p>Thử tìm kiếm hoặc trạng thái khác.</p>${button('Xem tất cả','goal-clear-filters','secondary')}</div>`}
      <p class="footer-note">${icon('shield',14)} Goals và task con lưu riêng trong trình duyệt. Xuất JSON để giữ bản sao; chưa đồng bộ Google Sheet.</p>`;
  }
  function renderEmpty() {
    return `<section class="goal-empty-hero panel"><div class="goal-empty-icon">${icon('target',36)}</div><h2>Bắt đầu với một kết quả bà muốn đạt.</h2><p class="muted">Ví dụ: xây quy trình tuyển dụng, cải thiện onboarding hoặc hoàn thiện một quy trình operation.</p><div class="row wrap">${button('Tạo goal đầu tiên','goal-create','primary','plus')}${button('Dùng mẫu xây ATS','goal-template','secondary','spark')}</div><div class="goal-example-card"><div class="kicker">MẪU TỪ NỘI DUNG MÌNH ĐÃ BÀN</div><h3>Xây quy trình tuyển dụng</h3><p class="small muted">Database lưu thông tin lâu dài + trang quản lý tương tác. Mẫu có 8 task; bà xem và chỉnh trước khi tạo.</p></div></section>`;
  }
  function renderCard(g) {
    const p=goalProgress(work(),g.goal_id);
    return `<button class="goal-card" data-action="goal-open" data-id="${e(g.goal_id)}" aria-label="Mở goal ${e(g.title)}"><div class="goal-card-header"><span class="chip gray">${e(categories[g.category])}</span>${badge(g.status)}</div><h2 class="goal-card-title">${e(g.title)}</h2><p class="goal-card-desc">${e(g.description || g.success_criteria)}</p><div class="goal-card-progress"><div class="row between"><span class="small muted">${p.done}/${p.total} task hoàn tất</span><strong>${p.percent}%</strong></div><div class="progress-track"><span style="width:${p.percent}%"></span></div></div><div class="goal-card-footer"><span>${icon('users',14)} ${e(g.owner || 'Chưa gán người phụ trách')}</span><span class="${g.target_date&&g.target_date<today()&&g.status==='active'?'text-amber':''}">${icon('calendar',14)} ${g.target_date?dateLabel(g.target_date):'Chưa có deadline'}</span></div></button>`;
  }
  function renderDetail(g) {
    const p=goalProgress(work(),g.goal_id), tasks=getGoalTasks(work(),g.goal_id), editable=!['completed','archived'].includes(g.status);
    const statusActions = g.status==='completed'||g.status==='archived' ? button('Mở lại goal','goal-status','secondary','refresh',`data-id="${e(g.goal_id)}" data-value="active"`) : button('Chốt hoàn thành','goal-finish','primary','check',`data-id="${e(g.goal_id)}"`);
    return `<div class="goal-back">${button('Tất cả goals','goal-back','ghost','arrow')}</div>` + header(g.title, g.description || 'Theo dõi kết quả và việc cần làm của goal này.', `${button('Sửa goal','goal-edit','secondary','',`data-id="${e(g.goal_id)}"`)}${statusActions}`, categories[g.category]) +
      `<div class="goal-detail-layout"><section class="panel goal-task-panel"><div class="section-title"><div><h2>Kế hoạch thực hiện <span class="count-label">${tasks.length}</span></h2><p class="small muted">Mỗi task là một bước có thể hoàn tất.</p></div>${button('Thêm task','goal-task-create','secondary','plus',`data-id="${e(g.goal_id)}" ${editable?'':'disabled'}`)}</div>${!editable?'<div class="goal-readonly-alert"><p class="small muted">Mở lại goal để thêm hoặc điều chỉnh task.</p></div>':''}<div class="goal-task-list">${tasks.map(t=>renderTask(t,editable)).join('') || '<div class="empty-state"><h3>Chưa có task con</h3><p>Thêm việc nhỏ hoặc dán danh sách task để bắt đầu.</p></div>'}</div><div class="goal-section-divider"></div>${button('Thêm nhiều task','goal-task-batch','ghost','list',`data-id="${e(g.goal_id)}" ${editable?'':'disabled'}`)}</section><div class="stack"><section class="panel goal-summary-panel"><div class="section-title"><h2>Tiến độ</h2>${badge(g.status)}</div><div class="goal-progress-big">${p.percent}<span>%</span></div><div class="progress-track"><span style="width:${p.percent}%"></span></div><div class="goal-micro-stats"><span><strong>${p.done}</strong> hoàn tất</span><span><strong>${p.total-p.done}</strong> còn lại</span><span><strong>${p.blocked}</strong> đang chờ</span></div>${p.total>0&&p.done===p.total&&g.status!=='completed'?'<p class="small text-green goal-draft-note">Task đã xong hết. Kiểm tra kết quả cần đạt rồi chốt goal.</p>':''}<div class="goal-summary-list"><div><span>Lĩnh vực</span><strong>${e(categories[g.category])}</strong></div><div><span>Người phụ trách</span><strong>${e(g.owner || 'Chưa gán')}</strong></div><div><span>Deadline</span><strong>${g.target_date?dateLabel(g.target_date):'Chưa đặt'}</strong></div><div><span>Ưu tiên</span><strong>${e(priorities[g.priority])}</strong></div></div><div class="row wrap">${['active','on_hold'].includes(g.status)?button(g.status==='active'?'Tạm dừng':'Tiếp tục','goal-status','ghost','',`data-id="${e(g.goal_id)}" data-value="${g.status==='active'?'on_hold':'active'}"`):''}${g.status!=='archived'?button('Lưu trữ','goal-archive','ghost','',`data-id="${e(g.goal_id)}"`):''}</div></section><section class="panel"><div class="section-title"><h2>Kết quả cần đạt</h2>${icon('target')}</div><p class="goal-criteria">${e(g.success_criteria || 'Chưa ghi tiêu chí hoàn thành.')}</p><p class="small muted goal-draft-note">Hoàn tất task chưa tự chốt goal. Bà xác nhận kết quả cuối cùng khi đã đạt các tiêu chí này.</p></section></div></div><p class="footer-note">${icon('clock',14)} Task có deadline và thuộc goal đang làm sẽ hiện trong brief “Hôm nay”.</p>`;
  }
  function renderTask(t, editable) {
    return `<div class="goal-task-row ${e(t.status)}"><button class="task-check ${t.status==='done'?'checked':''}" data-action="goal-toggle-task" data-id="${e(t.task_id)}" ${!editable||t.status==='cancelled'?'disabled':''} aria-label="${t.status==='done'?'Mở lại':'Hoàn tất'} task ${e(t.title)}" aria-pressed="${t.status==='done'}">${t.status==='done'?icon('check',14):''}</button><div class="goal-task-content"><button class="goal-task-title text-button" data-action="goal-task-edit" data-id="${e(t.task_id)}" ${!editable?'disabled':''}>${e(t.title)}</button>${t.description?`<p class="small muted">${e(t.description)}</p>`:''}<div class="goal-task-subline">${badge(t.status)}${t.priority==='high'?'<span class="chip amber">Ưu tiên cao</span>':''}${t.owner?`<span>${icon('users',12)} ${e(t.owner)}</span>`:''}<span class="${t.due_date&&t.due_date<today()&&!['done','cancelled'].includes(t.status)?'text-amber':'muted'}">${icon('calendar',12)} ${t.due_date?dateLabel(t.due_date):'Chưa có deadline'}</span></div></div><div class="goal-task-actions">${button('','goal-task-edit','icon','dots',`data-id="${e(t.task_id)}" ${editable?'':'disabled'} aria-label="Sửa task ${e(t.title)}"`)}</div></div>`;
  }
  function renderTaskBrief(t) {
    const g=goal(t.goal_id);
    return `<div class="task-row"><button class="task-check" data-action="goal-toggle-task" data-id="${e(t.task_id)}" aria-label="Hoàn tất: ${e(t.title)}">${icon('check',14)}</button><div class="task-content"><button class="text-button task-title" data-action="goal-task-edit" data-id="${e(t.task_id)}">${e(t.title)}</button><button class="text-button small muted" data-action="goal-open" data-id="${e(g.goal_id)}">Goal · ${e(g.title)}</button></div><div class="task-meta">${t.status==='blocked'?badge('blocked'):t.priority==='high'?'<span class="chip amber">Ưu tiên cao</span>':''}<span class="small ${t.due_date<today()?'text-amber':'muted'}">${dateLabel(t.due_date)}</span></div></div>`;
  }
  function goalForm(id, template=false) {
    const original=id?goal(id):null;
    const preset=template?recruitingGoalTemplate():null;
    const g=original || preset || {category:'other',priority:'normal'};
    showModal({title:id?'Sửa goal':template?'Goal mẫu · Xây quy trình tuyển dụng':'Tạo goal mới',subtitle:template?'Danh sách gợi ý soạn sẵn từ workflow mình đã bàn. Bà chỉnh trước khi tạo.':'Bắt đầu từ kết quả bà muốn đạt.',body:`${field('title','Tên goal',g.title,'text','required maxlength="200"')}${field('description','Mô tả mục tiêu',g.description,'textarea')}${field('success_criteria','Kết quả cần đạt / tiêu chí hoàn thành',g.success_criteria,'textarea','required')}<div class="form-grid">${select('category','Lĩnh vực',Object.entries(categories),g.category||'other')}${field('owner','Người phụ trách',g.owner)}${field('target_date','Deadline goal',g.target_date,'date')}${select('priority','Ưu tiên',Object.entries(priorities),g.priority||'normal')}</div>${!id?field('initial_tasks','Task ban đầu · mỗi dòng một task',preset?.tasks.map(t=>t.title).join('\n') || '', 'textarea','class="goal-tasks-input"'):''}<p class="small muted">Deadline có thể để trống. Bà đặt deadline riêng cho từng task sau khi tạo.</p>`,submit:id?'Lưu goal':'Tạo goal',onSubmit(data){const values=Object.fromEntries(data);delete values.initial_tasks;let result;if(id)result=updateGoal(work(),id,values);else{result=createGoal(work(),values);const titles=taskLines(data.get('initial_tasks') || '');if(titles.length)addGoalTasks(work(),result.goal_id,titles.map(title=>{const match=preset?.tasks.find(t=>t.title===title);return {title,description:match?.description||'',status:'todo'};}));}Object.assign(ui(),{page:'goals',goalId:result.goal_id,goalFilter:'active'});h.persist('Đã lưu goal và kế hoạch thực hiện.');}});
  }
  function taskForm(goalId, taskId) {
    const t=taskId?task(taskId):{},g=goal(goalId || t.goal_id);
    if(!g)throw new Error('Không tìm thấy goal của task.');
    showModal({title:taskId?'Sửa task':'Thêm task vào goal',subtitle:g.title,body:`${field('title','Tên task',t.title,'text','required maxlength="300"')}${field('description','Nội dung / điều kiện hoàn thành',t.description,'textarea')}<div class="form-grid">${field('owner','Người phụ trách',t.owner || g.owner)}${field('due_date','Deadline task',t.due_date,'date')}${select('status','Trạng thái',Object.entries(taskStatuses),t.status||'todo')}${select('priority','Ưu tiên',Object.entries(priorities),t.priority||'normal')}</div><p class="small muted">Task đến hạn sẽ hiện trong “Hôm nay” nếu goal đang thực hiện.</p>`,submit:taskId?'Lưu task':'Thêm task',onSubmit(data){const values=Object.fromEntries(data);if(taskId)updateGoalTask(work(),taskId,values);else addGoalTasks(work(),g.goal_id,[values]);h.persist('Đã lưu task của goal.');}});
  }
  function batchForm(id) {
    showModal({title:'Thêm nhiều task',subtitle:goal(id)?.title,body:`${field('tasks','Danh sách task · mỗi dòng một việc','','textarea','required rows="8"')}<p class="small muted">Có thể dán danh sách tui đã breakdown trong chat. Các dòng gạch đầu dòng hoặc đánh số sẽ được tách thành task.</p>`,submit:'Thêm vào kế hoạch',onSubmit(data){const lines=taskLines(data.get('tasks'));if(!lines.length)throw new Error('Điền ít nhất một task.');addGoalTasks(work(),id,lines);h.persist(`Đã thêm ${lines.length} task.`);}});
  }
  function finishForm(id) {
    const g=goal(id),p=goalProgress(work(),id);
    if(!p.total||p.done!==p.total){toast('Hoàn tất các task trước khi chốt goal.');return;}
    showModal({title:'Chốt goal hoàn thành',subtitle:g.title,body:`<p class="goal-criteria">${e(g.success_criteria)}</p><div class="divider"></div><label class="checkbox-row"><input type="checkbox" name="confirmed" value="yes" required /><span>Tui xác nhận đã đạt các kết quả trên.</span></label><p class="small muted">Goal có thể được mở lại nếu cần làm thêm.</p>`,submit:'Chốt hoàn thành',onSubmit(data){setGoalStatus(work(),id,'completed',{confirmed:data.get('confirmed')==='yes'});h.persist('Đã chốt goal hoàn thành.');}});
  }
  function importGoals() {
    showModal({title:'Nhập Goals & Tasks',body:'<p>File JSON gồm goals, tasks và lịch sử thao tác. Nhập sẽ thay thế riêng dữ liệu Goals hiện tại.</p><label class="field">File JSON<input type="file" name="file" accept=".json,application/json" required /></label><p class="small muted">Xuất bản sao trước nếu cần giữ Goals hiện tại. Dữ liệu ứng viên không bị thay thế.</p>',submit:'Kiểm tra & nhập',async onSubmit(data){const file=data.get('file');if(!file?.size)throw new Error('Chọn file JSON.');if(file.size>10*1024*1024)throw new Error('File tối đa 10 MB.');let value;try{value=JSON.parse(await file.text());}catch{throw new Error('File JSON chưa hợp lệ.');}const next=validateWorkState(value);h.setWork(next);ui().goalId=null;ui().goalFilter='all';h.persist('Đã nhập Goals & Tasks vào trình duyệt.');}});
  }
  function handleAction(action, data) {
    const {id,value}=data;
    switch(action) {
      case 'goal-open':openGoal(id);break;
      case 'goal-back':ui().goalId=null;h.render();break;
      case 'goal-create':goalForm();break;
      case 'goal-template':goalForm(null,true);break;
      case 'goal-edit':goalForm(id);break;
      case 'goal-task-create':taskForm(id);break;
      case 'goal-task-edit':taskForm(null,id);break;
      case 'goal-task-batch':batchForm(id);break;
      case 'goal-toggle-task':toggleGoalTask(work(),id);h.persist('Đã cập nhật task và tiến độ goal.');break;
      case 'goal-filter':ui().goalFilter=value;h.render();break;
      case 'goal-clear-filters':Object.assign(ui(),{goalFilter:'all',goalCategory:'all',goalSearch:''});h.render();break;
      case 'goal-finish':finishForm(id);break;
      case 'goal-status':setGoalStatus(work(),id,value);h.persist('Đã cập nhật trạng thái goal.');break;
      case 'goal-archive':showModal({title:'Lưu trữ goal?',body:`<p>Goal và task vẫn được giữ lại trong mục Lưu trữ. Task sẽ không hiện trong brief “Hôm nay”.</p>`,submit:'Lưu trữ',onSubmit(){setGoalStatus(work(),id,'archived');h.persist('Đã lưu trữ goal.');}});break;
      case 'goal-export':download(JSON.stringify(exportWorkState(work()),null,2),`goals-and-tasks-${today()}.json`);toast('Đã xuất Goals, Tasks và lịch sử thao tác.');break;
      case 'goal-import':importGoals();break;
      default:return false;
    }
    return true;
  }
  return { renderPage, renderTaskBrief, handleAction };
}
