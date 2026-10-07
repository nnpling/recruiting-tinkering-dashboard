/**
 * Browser-local ATS model. IDs and field names match Recruiting Database.
 * Demo/local data stays in this browser. It is never a Sheet synchronization
 * or an email-delivery provider, and must not be presented as either.
 */
export const TABLES = ['Jobs','Candidates','Applications','Documents','Rounds','Feedback','Tasks','Emails','Offers','ActivityLog'];
export const STAGES = [
  {key:'sourced',label:'Nguồn ứng viên',color:'#8896a4'},
  {key:'screening',label:'Sàng lọc',color:'#658dff'},
  {key:'interview',label:'Phỏng vấn',color:'#a886f0'},
  {key:'test',label:'Bài test',color:'#efad52'},
  {key:'offer',label:'Offer',color:'#4dbba9'},
  {key:'onboarding',label:'Onboarding',color:'#369776'},
  {key:'closed',label:'Đã đóng',color:'#ad8491'},
];
export const STATUSES = {
  active:'Đang tuyển',on_hold:'Tạm dừng',rejected:'Không tiếp tục',withdrawn:'Ứng viên rút lui',offer_declined:'Từ chối offer',hired:'Đã tuyển',
  draft:'Bản nháp',ready:'Sẵn sàng',sending:'Đang gửi',sent:'Đã gửi',failed:'Lỗi',cancelled:'Đã hủy',
  open:'Đang mở',closed:'Đã đóng',pending:'Chờ xử lý',submitted:'Đã nhận',completed:'Hoàn thành',done:'Hoàn thành',in_progress:'Đang làm',snoozed:'Để sau',
  planned:'Chưa lên lịch',scheduled:'Đã lên lịch',no_show:'Vắng mặt',
  review_more:'Cần đào sâu',proceed:'Tiếp tục',reject:'Không tiếp tục',hold:'Tạm dừng',reconsider:'Cân nhắc thêm',not_applicable:'Không áp dụng',
  high:'Ưu tiên cao',normal:'Bình thường',low:'Ưu tiên thấp',
  recruiter_screen:'Trao đổi recruiter',hm_interview:'Phỏng vấn HM',test:'Bài test',
  interviewer:'Interviewer',recruiter:'Recruiter',candidate:'Ứng viên',ai_screening:'AI sàng lọc',ai_interview:'AI phỏng vấn',ai_test:'AI review test',
  direct_application:'Ứng tuyển trực tiếp',drive_upload:'CV từ Drive',linkedin:'LinkedIn',referral:'Giới thiệu',job_board:'Trang tuyển dụng',sourcing:'Tìm kiếm',other:'Khác',
  onsite:'Tại văn phòng',hybrid:'Hybrid',remote:'Remote',unknown:'Chưa xác minh',verified:'Đã xác minh',not_open:'Chưa tìm việc',
  monthly:'Tháng',annual:'Năm',hourly:'Giờ',gross:'Gross',net:'Net',
  not_started:'Chưa bắt đầu',agreed:'Đã thống nhất',declined:'Đã từ chối',prepared:'Đã chuẩn bị',accepted:'Đã đồng ý',expired:'Hết hạn',pending_start:'Chờ bắt đầu',
  approach:'Approach',interview_invitation:'Mời phỏng vấn',thank_you:'Thank you',progress_update:'Cập nhật tiến độ',next_round:'Mời vòng tiếp theo',offer:'Offer',
};
export const STORAGE_KEY = 'recruiting-ats-v1';
const ACTOR = 'recruiter-local';
const terminal = new Set(['rejected','withdrawn','offer_declined','hired']);
const blank = value => value === null || value === undefined || (typeof value==='string' && value.trim()==='');
const text = value => String(value ?? '').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validDate = value => {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
};
export const nowISO = () => new Date().toISOString();
export function newId(prefix='id') {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,11)}`;
  return `${prefix}_${random}`;
}
export function pct(value) {
  if (blank(value) || !Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>1) return '—';
  return `${Math.round(Number(value)*100)}%`;
}
export function dateLabel(value,{time=false}={}) {
  if (blank(value)) return 'Chưa có';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(date);
}
export function createEmpty() {
  return {schema_version:'1.0',mode:'local',tables:Object.fromEntries(TABLES.map(name=>[name,[]])),updated_at:nowISO()};
}
export function loadState(key=STORAGE_KEY) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? validateImport(JSON.parse(raw)) : null;
  } catch { return null; }
}
export function saveState(state,key=STORAGE_KEY) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(key,JSON.stringify(state));
    return true;
  } catch { return false; }
}
export function displayCandidate(state,application) {
  const app = typeof application === 'string' ? state.tables.Applications.find(row=>row.application_id===application) : application;
  return state.tables.Candidates.find(row=>row.candidate_id===app?.candidate_id) ?? null;
}
export function jobFor(state,application) {
  const app = typeof application === 'string' ? state.tables.Applications.find(row=>row.application_id===application) : application;
  return state.tables.Jobs.find(row=>row.job_id===app?.job_id) ?? null;
}
function row(state,table,id) {
  const pk = META[table].primaryKey;
  const record = state.tables[table].find(record=>record[pk]===id);
  if (!record) throw new Error(`Không tìm thấy bản ghi ${table}. Vui lòng tải lại dữ liệu.`);
  return record;
}
function timestamps() { const at=nowISO(); return {created_at:at,updated_at:at,updated_by:ACTOR}; }
function stamp(state,record) { record.updated_at=nowISO(); record.updated_by=ACTOR; state.updated_at=record.updated_at; }
function log(state,table,record,action,before,after,reason='',field='') {
  const app = table==='Applications' ? record : state.tables.Applications.find(a=>a.application_id===record.application_id);
  state.tables.ActivityLog.push({
    activity_id:newId('act'),occurred_at:nowISO(),actor:ACTOR,source:'ats_ui',entity_type:table,entity_id:record[META[table].primaryKey],
    job_id:record.job_id || app?.job_id || '',application_id:record.application_id || '',action,field_name:field,
    old_value_json:JSON.stringify(before ?? null),new_value_json:JSON.stringify(after ?? null),reason:text(reason),correlation_id:newId('op'),
  });
  state.updated_at=nowISO();
}
function requireReason(value,message='Cần ghi lý do để lưu quyết định không tiếp tục.') {
  if (!text(value)) throw new Error(message);
  return text(value);
}
function enumValue(table,key,value) {
  const options=META[table].columns.find(c=>c.key===key)?.options;
  if (!options?.includes(value)) throw new Error(`Giá trị ${key} không hợp lệ.`);
  return value;
}
function cancelClosedApplicationWork(state,app,reason) {
  const cancellationReason=`Hồ sơ đã đóng: ${text(reason) || STATUSES[app.application_status] || 'Đã kết thúc quy trình'}`;
  for (const task of state.tables.Tasks.filter(task=>task.application_id===app.application_id && ['open','in_progress','snoozed'].includes(task.task_status) && task.task_type!=='send_thank_you')) {
    const before=clone(task);
    task.task_status='cancelled'; task.cancellation_reason=cancellationReason; task.snoozed_until='';
    stamp(state,task); log(state,'Tasks',task,'cancel',before,task,cancellationReason);
  }
  const currentTime=Date.now();
  for (const round of state.tables.Rounds.filter(round=>round.application_id===app.application_id && ['planned','scheduled'].includes(round.round_status) && (!round.scheduled_start_at || Date.parse(round.scheduled_start_at)>=currentTime))) {
    const before=clone(round);
    round.round_status='cancelled'; round.cancellation_reason=cancellationReason; round.prep_status='cancelled';
    if (round.round_type==='test') round.test_status='cancelled';
    stamp(state,round); log(state,'Rounds',round,'cancel',before,round,cancellationReason);
  }
  for (const feedback of state.tables.Feedback.filter(feedback=>feedback.application_id===app.application_id && feedback.feedback_status==='pending')) {
    const before=clone(feedback);
    feedback.feedback_status='cancelled';
    stamp(state,feedback); log(state,'Feedback',feedback,'cancel',before,feedback,cancellationReason);
  }
}
export function moveApplication(state,applicationId,stage,{reason='',status='active'}={}) {
  enumValue('Applications','stage',stage);
  enumValue('Applications','application_status',status);
  if (stage==='closed' && !terminal.has(status)) status='rejected';
  if (terminal.has(status)) stage='closed';
  if (terminal.has(status) && status!=='hired') requireReason(reason);
  const app=row(state,'Applications',applicationId),before=clone(app),at=nowISO();
  app.stage=stage; app.application_status=status;
  if (before.stage!==stage) app.stage_entered_at=at;
  app.closed_at=stage==='closed'?at:'';
  app.closure_reason=stage==='closed'?text(reason):'';
  if (status==='active' && terminal.has(before.application_status)) {
    app.recruiter_decision='pending'; app.decision_reason=''; app.decided_at=''; app.decided_by='';
  }
  if (status==='rejected') {
    app.recruiter_decision='reject'; app.decision_reason=text(reason); app.decided_at=at; app.decided_by=ACTOR;
  }
  stamp(state,app); log(state,'Applications',app,'status_change',before,app,reason);
  if (terminal.has(status)) cancelClosedApplicationWork(state,app,reason);
  return app;
}
export function recordDecision(state,applicationId,decision,reason='') {
  enumValue('Applications','recruiter_decision',decision);
  if (decision==='reject') return moveApplication(state,applicationId,'closed',{status:'rejected',reason});
  const app=row(state,'Applications',applicationId),before=clone(app);
  if (terminal.has(app.application_status) || app.stage==='closed') throw new Error('Hồ sơ đã đóng. Mở lại hồ sơ trong pipeline trước khi ghi quyết định tiếp tục.');
  app.recruiter_decision=decision; app.decision_reason=text(reason); app.decided_at=nowISO(); app.decided_by=ACTOR;
  stamp(state,app); log(state,'Applications',app,'update',before,app,reason,'recruiter_decision');
  return app;
}
export function addFeedback(state,applicationId,fields) {
  const app=row(state,'Applications',applicationId),job=jobFor(state,app);
  if (!text(fields.author_name)) throw new Error('Điền tên người đánh giá.');
  if (!text(fields.summary)) throw new Error('Điền nội dung feedback.');
  if (fields.author_email && !validEmail(fields.author_email)) throw new Error('Email người đánh giá không hợp lệ.');
  const type=enumValue('Feedback','feedback_type',fields.feedback_type || 'interviewer');
  const recommendation=enumValue('Feedback','recommendation',fields.recommendation || 'review_more');
  const scope=enumValue('Feedback','change_scope',fields.change_scope || 'application_only');
  if (fields.round_id && row(state,'Rounds',fields.round_id).application_id!==applicationId) throw new Error('Vòng phỏng vấn thuộc ứng viên khác.');
  for (const key of ['fit_score','coverage_score']) if (!blank(fields[key]) && (!Number.isFinite(Number(fields[key])) || Number(fields[key])<0 || Number(fields[key])>1)) throw new Error('Điểm đánh giá phải từ 0 đến 1.');
  const pending=state.tables.Feedback.find(f=>f.application_id===applicationId && f.feedback_status==='pending' && f.round_id===(fields.round_id||'') && f.author_email && f.author_email===fields.author_email);
  const before=pending?clone(pending):null;
  const record=pending || {feedback_id:newId('fb'),application_id:applicationId,round_id:fields.round_id||'',requested_at:'',due_at:'',...timestamps()};
  Object.assign(record,{
    feedback_type:type,author_name:text(fields.author_name),author_email:text(fields.author_email),submitted_at:nowISO(),feedback_status:'submitted',
    criteria_url_used:pending?.criteria_url_used ?? job?.criteria_url ?? '',criteria_version_used:pending?.criteria_version_used ?? job?.criteria_version ?? '',cv_document_id:app.cv_document_id || '',source_document_ids_json:'[]',
    recommendation,fit_score:blank(fields.fit_score)?null:Number(fields.fit_score),coverage_score:blank(fields.coverage_score)?null:Number(fields.coverage_score),
    summary:text(fields.summary),strengths:text(fields.strengths),concerns:text(fields.concerns),answers_json:JSON.stringify(fields.answers || []),evidence_json:JSON.stringify(fields.evidence || []),followup_questions_json:JSON.stringify(fields.followup_questions || []),
    change_scope:scope,portrait_change_proposal:text(fields.portrait_change_proposal),form_url:record.form_url || '',
  });
  if (!pending) state.tables.Feedback.push(record);
  stamp(state,record); log(state,'Feedback',record,'feedback_submitted',before,record);
  return record;
}
export function completeTask(state,taskId) {
  const task=row(state,'Tasks',taskId);
  if (task.task_status==='cancelled') throw new Error('Tác vụ đã hủy không thể hoàn thành.');
  if (task.task_status==='done') return task;
  const before=clone(task); task.task_status='done'; task.completed_at=nowISO(); task.snoozed_until='';
  stamp(state,task); log(state,'Tasks',task,'task_completed',before,task);
  return task;
}
export function getTaskUndoBlockReason(state,taskId) {
  const task=state.tables.Tasks.find(task=>task.task_id===taskId);
  if (!task) return 'Không tìm thấy công việc để hoàn tác.';
  if (task.task_status!=='done') return 'Chỉ có thể hoàn tác công việc đã hoàn thành.';
  const application=task.application_id?state.tables.Applications.find(app=>app.application_id===task.application_id):null;
  if (task.task_type!=='send_thank_you' && application && (application.stage==='closed' || terminal.has(application.application_status))) {
    return 'Hồ sơ đã đóng. Mở lại hồ sơ ứng viên trước khi Undo công việc này.';
  }
  if (['prepare_interview','attend_interview'].includes(task.task_type) && task.round_id) {
    const round=state.tables.Rounds.find(round=>round.round_id===task.round_id);
    if (round && ['completed','cancelled','no_show'].includes(round.round_status)) {
      const statusText={completed:'đã hoàn thành',cancelled:'đã bị hủy',no_show:'ghi nhận vắng mặt'}[round.round_status];
      return `Vòng tuyển dụng ${statusText}. Không thể mở lại nhắc chuẩn bị hoặc tham gia lịch này.`;
    }
  }
  return '';
}
export function undoTaskCompletion(state,taskId) {
  const blockReason=getTaskUndoBlockReason(state,taskId);
  if (blockReason) throw new Error(blockReason);
  const task=row(state,'Tasks',taskId);
  const before=clone(task);
  task.task_status='open'; task.completed_at=''; task.snoozed_until='';
  stamp(state,task); log(state,'Tasks',task,'status_change',before,task,'Hoàn tác đánh dấu hoàn thành','task_status');
  return task;
}
export function createCandidate(state,fields) {
  const job=row(state,'Jobs',fields.job_id);
  if (!text(fields.full_name)) throw new Error('Điền tên ứng viên.');
  const email=text(fields.email).toLowerCase();
  if (email && !validEmail(email)) throw new Error('Email ứng viên không hợp lệ.');
  if (fields.github_url) safeUrl(fields.github_url,'Link GitHub');
  const source=enumValue('Candidates','source',fields.source || 'direct_application');
  let candidate=email?state.tables.Candidates.find(c=>text(c.email).toLowerCase()===email):null;
  if (candidate && state.tables.Applications.some(a=>a.candidate_id===candidate.candidate_id && a.job_id===job.job_id && ['active','on_hold'].includes(a.application_status))) throw new Error('Ứng viên đã có hồ sơ đang mở cho vị trí này.');
  if (!candidate) {
    candidate={candidate_id:newId('cand'),full_name:text(fields.full_name),email,phone:text(fields.phone),location:text(fields.location),timezone:'Asia/Ho_Chi_Minh',linkedin_url:'',github_url:text(fields.github_url),portfolio_url:'',current_cv_document_id:'',source,source_url:'',open_to_work_status:'unknown',open_to_work_evidence_url:'',open_to_work_checked_at:'',notes:text(fields.notes),...timestamps()};
    state.tables.Candidates.push(candidate); log(state,'Candidates',candidate,'create',null,candidate);
  }
  const at=nowISO();
  const app={application_id:newId('app'),candidate_id:candidate.candidate_id,job_id:job.job_id,recruiter_email:job.recruiter_email || '',source,applied_at:at,stage:'screening',application_status:'active',stage_entered_at:at,current_round_id:'',cv_document_id:candidate.current_cv_document_id || '',latest_screening_feedback_id:'',recruiter_decision:'pending',decision_reason:'',decided_at:'',decided_by:'',salary_expectation:null,salary_currency:'VND',salary_period:'monthly',salary_basis:'gross',notice_period_days:null,available_start_date:'',closed_at:'',closure_reason:'',...timestamps()};
  state.tables.Applications.push(app); log(state,'Applications',app,'create',null,app);
  return app;
}
function businessDate(value,days) {
  const date=new Date(`${value}T12:00:00+07:00`); let remaining=days;
  while (remaining>0) { date.setUTCDate(date.getUTCDate()+1); const weekday=date.getUTCDay(); if (weekday!==0 && weekday!==6) remaining--; }
  return date.toISOString().slice(0,10);
}
export function createJob(state,fields) {
  if (!text(fields.job_title)) throw new Error('Điền tên vị trí.');
  if (fields.job_status!=='draft' && !text(fields.hiring_manager_name)) throw new Error('Điền tên hiring manager để mở tuyển, hoặc lưu vị trí dưới dạng bản nháp.');
  for (const key of ['hiring_manager_email','recruiter_email']) if (fields[key] && !validEmail(fields[key])) throw new Error('Email không hợp lệ.');
  const headcount=Number(fields.headcount || 1);
  if (!Number.isInteger(headcount)||headcount<1) throw new Error('Số người cần tuyển phải là số nguyên từ 1.');
  const status=enumValue('Jobs','job_status',fields.job_status || 'open');
  const mode=enumValue('Jobs','work_mode',fields.work_mode || 'hybrid');
  for (const key of ['hm_brief_url','criteria_url','drive_inbox_url','calendly_url']) if(fields[key]) safeUrl(fields[key],key);
  const started=text(fields.sourcing_started_date);
  if (started && !validDate(started)) throw new Error('Ngày bắt đầu tuyển không hợp lệ.');
  const job={job_id:newId('job'),job_title:text(fields.job_title),job_status:status,hiring_manager_name:text(fields.hiring_manager_name),hiring_manager_email:text(fields.hiring_manager_email),recruiter_email:text(fields.recruiter_email),headcount,jd_document_id:'',hm_brief_url:text(fields.hm_brief_url),criteria_url:text(fields.criteria_url),criteria_version:text(fields.criteria_version),drive_inbox_url:text(fields.drive_inbox_url),calendly_url:text(fields.calendly_url),work_location:text(fields.work_location),work_mode:mode,salary_min:blank(fields.salary_min)?null:Number(fields.salary_min),salary_max:blank(fields.salary_max)?null:Number(fields.salary_max),salary_currency:fields.salary_currency || 'VND',salary_period:fields.salary_period || 'monthly',salary_basis:fields.salary_basis || 'gross',sourcing_started_date:started,target_hire_date:text(fields.target_hire_date),funnel_checkpoint_date:started?businessDate(started,5):'',funnel_targets_json:'{}',...timestamps()};
  for (const key of ['salary_min','salary_max']) if(job[key]!==null && (!Number.isFinite(job[key]) || job[key]<0)) throw new Error('Mức lương không hợp lệ.');
  if (job.salary_min!==null && job.salary_max!==null && job.salary_min>job.salary_max) throw new Error('Lương tối thiểu không thể cao hơn lương tối đa.');
  enumValue('Jobs','salary_period',job.salary_period); enumValue('Jobs','salary_basis',job.salary_basis);
  state.tables.Jobs.push(job); log(state,'Jobs',job,'create',null,job);
  return job;
}
export function createEmailDraft(state,applicationId,type='approach') {
  enumValue('Emails','email_type',type);
  const app=row(state,'Applications',applicationId),candidate=displayCandidate(state,app),job=jobFor(state,app);
  if (!candidate?.email || !validEmail(candidate.email)) throw new Error('Cần bổ sung email hợp lệ của ứng viên trước khi tạo bản nháp.');
  const round=app.current_round_id?state.tables.Rounds.find(r=>r.round_id===app.current_round_id):null;
  const labels={approach:'Trao đổi về cơ hội',interview_invitation:'Mời phỏng vấn',test:'Thông tin bài test',thank_you:'Cảm ơn bạn đã dành thời gian',next_round:'Trao đổi về vòng tiếp theo',offer:'Thông tin offer',progress_update:'Cập nhật tiến độ'};
  const bodies={
    approach:`Chào ${candidate.full_name},\n\nMình muốn trao đổi với bạn về vị trí ${job.job_title}. Bạn có sẵn sàng trao đổi ngắn về cơ hội này không?\n\nCảm ơn bạn!`,
    interview_invitation:`Chào ${candidate.full_name},\n\nMời bạn tham gia phỏng vấn cho vị trí ${job.job_title}.${job.calendly_url?` Bạn có thể chọn lịch tại: ${job.calendly_url}`:' Mình sẽ gửi thông tin lịch sau khi thống nhất thời gian với bạn.'}\n\nCảm ơn bạn!`,
    test:`Chào ${candidate.full_name},\n\nMình gửi thông tin bài test cho vị trí ${job.job_title}.\n\n${round?.test_instructions || '[Bổ sung hướng dẫn, hạn nộp và kiểm tra file đính kèm trước khi gửi.]'}\n\nNếu có câu hỏi, bạn cứ phản hồi email này nhé.`,
    thank_you:`Chào ${candidate.full_name},\n\nCảm ơn bạn đã dành thời gian tìm hiểu và tham gia quy trình tuyển dụng của chúng mình. Sau khi cân nhắc, đội ngũ quyết định chưa tiếp tục với hồ sơ của bạn cho vị trí ${job.job_title} ở thời điểm này.\n\nChúc bạn tìm được cơ hội phù hợp. Cảm ơn bạn một lần nữa.`,
    next_round:`Chào ${candidate.full_name},\n\nĐội ngũ muốn mời bạn tham gia vòng tiếp theo cho vị trí ${job.job_title}. Bạn cho mình biết các khung giờ phù hợp trong vài ngày tới nhé.\n\nCảm ơn bạn!`,
  };
  const email={email_id:newId('email'),application_id:applicationId,round_id:round?.round_id || '',task_id:'',email_type:type,to_email:candidate.email,cc_emails_json:'[]',subject:`${labels[type] || 'Thông tin tuyển dụng'} — ${job.job_title}`,body:bodies[type] || `Chào ${candidate.full_name},\n\n[Bổ sung nội dung trước khi gửi.]`,template_id:'local-draft',template_version:'1',attachment_document_ids_json:type==='test'?(round?.test_package_document_ids_json || '[]'):'[]',email_status:'draft',prepared_at:nowISO(),send_requested_by:'',send_requested_at:'',sent_at:'',provider_message_id:'',provider_thread_id:'',last_error:'',dedupe_key:'',...timestamps()};
  state.tables.Emails.push(email); log(state,'Emails',email,'create',null,email);
  return email;
}
export function updateEmailDraft(state,emailId,fields) {
  const email=row(state,'Emails',emailId);
  if (!['draft','ready','failed'].includes(email.email_status)) throw new Error('Chỉ có thể chỉnh email chưa gửi.');
  if (Object.keys(fields).some(key=>!['to_email','subject','body','cc_emails_json','attachment_document_ids_json','email_status'].includes(key))) throw new Error('Không thể cập nhật trường gửi email bằng UI local.');
  if (fields.email_status && !['draft','ready'].includes(fields.email_status)) throw new Error('UI chưa kết nối dịch vụ gửi email; không thể đánh dấu đã gửi.');
  const next={...email,...fields};
  if (!validEmail(text(next.to_email))) throw new Error('Email người nhận không hợp lệ.');
  for (const key of ['cc_emails_json','attachment_document_ids_json']) {
    let values;try{values=Array.isArray(next[key])?next[key]:JSON.parse(next[key] || '[]');}catch{throw new Error('Danh sách email hoặc file đính kèm không hợp lệ.');}
    if (!Array.isArray(values) || values.some(v=>typeof v!=='string')) throw new Error('Danh sách phải chứa các giá trị text.');
    if(key==='cc_emails_json' && values.some(v=>!validEmail(v))) throw new Error('Email CC không hợp lệ.');
    if(key==='attachment_document_ids_json' && values.some(v=>!state.tables.Documents.some(d=>d.document_id===v))) throw new Error('Không tìm thấy file đính kèm.');
    next[key]=JSON.stringify(values);
  }
  const before=clone(email); Object.assign(email,next); stamp(state,email); log(state,'Emails',email,'update',before,email);
  return email;
}
export function rescheduleRound(state,roundId,start,end,reason) {
  requireReason(reason,'Cần ghi lý do đổi lịch.');
  const begin=new Date(start),finish=new Date(end);
  if (Number.isNaN(begin.getTime())||Number.isNaN(finish.getTime())||finish<=begin) throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
  const round=row(state,'Rounds',roundId),before=clone(round);
  if (round.round_type==='test') throw new Error('Bài test dùng mốc gửi và hạn nộp riêng.');
  if (round.round_status==='completed') throw new Error('Vòng đã hoàn thành không thể đổi lịch.');
  round.scheduled_start_at=begin.toISOString(); round.scheduled_end_at=finish.toISOString(); round.round_status='scheduled'; round.reschedule_count=Number(round.reschedule_count || 0)+1; round.prep_status='pending';
  stamp(state,round); log(state,'Rounds',round,'reschedule',before,round,reason);
  for (const task of state.tables.Tasks.filter(t=>t.round_id===roundId && ['open','in_progress','snoozed'].includes(t.task_status) && ['prepare_interview','attend_interview'].includes(t.task_type))) {
    const old=clone(task); task.due_at=task.task_type==='prepare_interview'?new Date(begin.getTime()-15*60000).toISOString():begin.toISOString(); stamp(state,task); log(state,'Tasks',task,'update',old,task,reason,'due_at');
  }
  return round;
}
function safeUrl(value,label) {
  try { const parsed=new URL(value); if (!['http:','https:'].includes(parsed.protocol)) throw new Error(); }
  catch { throw new Error(`${label} phải là đường dẫn HTTP hoặc HTTPS hợp lệ.`); }
}
const ESSENTIAL_FIELDS = {
  Jobs:['job_title','job_status'],
  Candidates:['full_name'],
  Applications:['candidate_id','job_id','stage','application_status'],
  Documents:['document_type'],
  Rounds:['application_id','round_type','round_status'],
  Feedback:['application_id','feedback_type','author_name','feedback_status'],
  Tasks:['task_type','title','task_status'],
  Emails:['application_id','email_type','email_status'],
  Offers:['application_id','offer_status'],
  ActivityLog:['occurred_at','actor','source','entity_type','entity_id','action'],
};
export function validateImport(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('File dữ liệu phải là một đối tượng JSON.');
  if (value.schema_version && value.schema_version!=='1.0') throw new Error('Phiên bản database chưa được hỗ trợ.');
  const tables=value.tables || value;
  if (!tables || typeof tables!=='object' || !TABLES.some(table=>Array.isArray(tables[table]))) throw new Error('Không tìm thấy các bảng của Recruiting Database.');
  for (const key of Object.keys(tables)) if (!TABLES.includes(key) && !['schema_version','mode','updated_at','exported_at'].includes(key)) throw new Error(`Bảng ${key} không nằm trong database.`);
  const result=createEmpty(); result.mode=value.mode==='demo'?'demo':'local';
  for (const table of TABLES) {
    if (tables[table]!==undefined && !Array.isArray(tables[table])) throw new Error(`Bảng ${table} phải là một danh sách.`);
    const ids=new Set();
    result.tables[table]=(tables[table] || []).map((input,index)=>{
      if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error(`${table}, dòng ${index+1}: bản ghi không hợp lệ.`);
      const record={...input},meta=META[table],known=new Set(meta.columns.map(c=>c.key));
      for (const key of Object.keys(record)) if(!known.has(key)) throw new Error(`${table}: trường ${key} không có trong schema.`);
      const id=record[meta.primaryKey];
      if (!text(id) || typeof id!=='string') throw new Error(`${table}: cần mã ${meta.primaryKey} dạng text.`);
      if(ids.has(id)) throw new Error(`${table}: trùng mã ${id}.`); ids.add(id);
      for (const key of ESSENTIAL_FIELDS[table]) {
        if (blank(record[key])) throw new Error(`${table}, dòng ${index+1}: thiếu trường bắt buộc ${key}.`);
      }
      for (const column of meta.columns) {
        let field=record[column.key];
        if (blank(field)) { if (['number','integer','percent'].includes(column.type) && Object.hasOwn(record,column.key)) record[column.key]=null; continue; }
        if(column.options && !column.options.includes(field)) throw new Error(`${table}: ${column.key} có giá trị không hợp lệ.`);
        if(['number','integer','percent'].includes(column.type)) {
          const number=Number(field);
          if(typeof field==='boolean' || !Number.isFinite(number) || (column.type==='integer' && !Number.isInteger(number)) || (column.type==='percent' && (number<0 || number>1))) throw new Error(`${table}: ${column.key} không phải số hợp lệ${column.type==='percent'?' từ 0 đến 1':''}.`);
          record[column.key]=number;
        } else if(column.type==='json') {
          try { record[column.key]=typeof field==='string'?(JSON.parse(field),field):JSON.stringify(field); } catch { throw new Error(`${table}: ${column.key} chứa JSON không hợp lệ.`); }
        } else if(column.type==='url') safeUrl(field,`${table}.${column.key}`);
        else if(column.type==='email' && !validEmail(field)) throw new Error(`${table}: ${column.key} không phải email hợp lệ.`);
        else if(column.type==='datetime' && Number.isNaN(Date.parse(field))) throw new Error(`${table}: ${column.key} không phải timestamp hợp lệ.`);
        else if(column.type==='date' && !validDate(field)) throw new Error(`${table}: ${column.key} không phải ngày hợp lệ.`);
        else if(typeof field!=='string') throw new Error(`${table}: ${column.key} phải là text.`);
      }
      return record;
    });
  }
  const sets=Object.fromEntries(TABLES.map(table=>[table,new Set(result.tables[table].map(r=>r[META[table].primaryKey]))]));
  const refs={job_id:'Jobs',candidate_id:'Candidates',application_id:'Applications',round_id:'Rounds',current_round_id:'Rounds',document_id:'Documents',jd_document_id:'Documents',cv_document_id:'Documents',current_cv_document_id:'Documents',offer_document_id:'Documents',latest_screening_feedback_id:'Feedback',related_feedback_id:'Feedback',task_id:'Tasks',related_email_id:'Emails'};
  for (const table of TABLES) for (const record of result.tables[table]) {
    if(table==='ActivityLog') continue; // A retained history can refer to records removed by a future migration.
    for(const [key,target] of Object.entries(refs)) if(key!==META[table].primaryKey && !blank(record[key]) && !sets[target].has(record[key])) throw new Error(`${table}: ${key} tham chiếu mã không tồn tại trong ${target}.`);
    if(table==='Applications' && (!record.candidate_id || !record.job_id)) throw new Error('Applications: cần candidate_id và job_id.');
    if(['Rounds','Feedback','Emails','Offers'].includes(table) && !record.application_id) throw new Error(`${table}: cần application_id.`);
    if(table==='Jobs' && !blank(record.headcount) && record.headcount<1) throw new Error('Jobs: số người cần tuyển phải từ 1.');
    if(table==='Rounds' && ['hm_interview','test'].includes(record.round_type) && (!Number.isInteger(record.round_number) || record.round_number<1)) throw new Error('Rounds: vòng phỏng vấn / test cần số thứ tự từ 1.');
    if(record.round_id && record.application_id) {
      const related=result.tables.Rounds.find(r=>r.round_id===record.round_id);
      if(related && related.application_id!==record.application_id) throw new Error(`${table}: round_id thuộc application khác.`);
    }
    if(table==='Applications' && record.current_round_id && result.tables.Rounds.find(r=>r.round_id===record.current_round_id)?.application_id!==record.application_id) throw new Error('Applications: current_round_id thuộc application khác.');
    if(table==='Applications' && record.latest_screening_feedback_id && result.tables.Feedback.find(r=>r.feedback_id===record.latest_screening_feedback_id)?.application_id!==record.application_id) throw new Error('Applications: latest_screening_feedback_id thuộc application khác.');
    if(['Candidates','Applications'].includes(table)) {
      const documentId=record.current_cv_document_id || record.cv_document_id;
      const cv=documentId?result.tables.Documents.find(d=>d.document_id===documentId):null;
      if(cv?.candidate_id && cv.candidate_id!==record.candidate_id) throw new Error(`${table}: CV thuộc ứng viên khác.`);
    }
    if(table==='Emails' && record.task_id) {
      const task=result.tables.Tasks.find(t=>t.task_id===record.task_id);
      if(task?.application_id && task.application_id!==record.application_id) throw new Error('Emails: task_id thuộc application khác.');
    }
    for(const key of ['test_package_document_ids_json','test_submission_document_ids_json','source_document_ids_json','attachment_document_ids_json']) if(record[key]) {
      const ids=JSON.parse(record[key]);
      if(!Array.isArray(ids) || ids.some(id=>typeof id!=='string' || !sets.Documents.has(id))) throw new Error(`${table}: ${key} phải chứa các document_id tồn tại.`);
    }
  }
  result.updated_at=typeof value.updated_at==='string' && !Number.isNaN(Date.parse(value.updated_at))?value.updated_at:nowISO();
  return result;
}
export function exportDatabase(state) {
  const normalized=validateImport(state);
  return {schema_version:'1.0',mode:normalized.mode,updated_at:normalized.updated_at,exported_at:nowISO(),tables:clone(normalized.tables)};
}

// Schema metadata is generated verbatim from schema.json by the source build.
const META = {"Jobs":{"primaryKey":"job_id","columns":[{"key":"job_id","type":"text"},{"key":"job_title","type":"text"},{"key":"job_status","type":"text","options":["draft","open","on_hold","closed"]},{"key":"hiring_manager_name","type":"text"},{"key":"hiring_manager_email","type":"email"},{"key":"recruiter_email","type":"email"},{"key":"headcount","type":"integer"},{"key":"jd_document_id","type":"text"},{"key":"hm_brief_url","type":"url"},{"key":"criteria_url","type":"url"},{"key":"criteria_version","type":"text"},{"key":"drive_inbox_url","type":"url"},{"key":"calendly_url","type":"url"},{"key":"work_location","type":"text"},{"key":"work_mode","type":"text","options":["onsite","hybrid","remote"]},{"key":"salary_min","type":"number"},{"key":"salary_max","type":"number"},{"key":"salary_currency","type":"text"},{"key":"salary_period","type":"text","options":["monthly","annual","hourly"]},{"key":"salary_basis","type":"text","options":["gross","net"]},{"key":"sourcing_started_date","type":"date"},{"key":"target_hire_date","type":"date"},{"key":"funnel_checkpoint_date","type":"date"},{"key":"funnel_targets_json","type":"json"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Candidates":{"primaryKey":"candidate_id","columns":[{"key":"candidate_id","type":"text"},{"key":"full_name","type":"text"},{"key":"email","type":"email"},{"key":"phone","type":"text"},{"key":"location","type":"text"},{"key":"timezone","type":"text"},{"key":"linkedin_url","type":"url"},{"key":"github_url","type":"url"},{"key":"portfolio_url","type":"url"},{"key":"current_cv_document_id","type":"text"},{"key":"source","type":"text","options":["drive_upload","direct_application","linkedin","referral","job_board","sourcing","other"]},{"key":"source_url","type":"url"},{"key":"open_to_work_status","type":"text","options":["unknown","verified","not_open"]},{"key":"open_to_work_evidence_url","type":"url"},{"key":"open_to_work_checked_at","type":"datetime"},{"key":"notes","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Applications":{"primaryKey":"application_id","columns":[{"key":"application_id","type":"text"},{"key":"candidate_id","type":"text"},{"key":"job_id","type":"text"},{"key":"recruiter_email","type":"email"},{"key":"source","type":"text","options":["drive_upload","direct_application","linkedin","referral","job_board","sourcing","other"]},{"key":"applied_at","type":"datetime"},{"key":"stage","type":"text","options":["sourced","screening","interview","test","offer","onboarding","closed"]},{"key":"application_status","type":"text","options":["active","on_hold","rejected","withdrawn","offer_declined","hired"]},{"key":"stage_entered_at","type":"datetime"},{"key":"current_round_id","type":"text"},{"key":"cv_document_id","type":"text"},{"key":"latest_screening_feedback_id","type":"text"},{"key":"recruiter_decision","type":"text","options":["pending","review_more","proceed","reject","hold"]},{"key":"decision_reason","type":"text"},{"key":"decided_at","type":"datetime"},{"key":"decided_by","type":"text"},{"key":"salary_expectation","type":"number"},{"key":"salary_currency","type":"text"},{"key":"salary_period","type":"text","options":["monthly","annual","hourly"]},{"key":"salary_basis","type":"text","options":["gross","net"]},{"key":"notice_period_days","type":"integer"},{"key":"available_start_date","type":"date"},{"key":"closed_at","type":"datetime"},{"key":"closure_reason","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Documents":{"primaryKey":"document_id","columns":[{"key":"document_id","type":"text"},{"key":"document_type","type":"text","options":["cv","jd","test_package","test_submission","transcript","offer","other"]},{"key":"candidate_id","type":"text"},{"key":"job_id","type":"text"},{"key":"application_id","type":"text"},{"key":"round_id","type":"text"},{"key":"drive_file_id","type":"text"},{"key":"file_url","type":"url"},{"key":"file_name","type":"text"},{"key":"file_version","type":"text"},{"key":"version_status","type":"text","options":["current","superseded"]},{"key":"received_at","type":"datetime"},{"key":"source_folder_url","type":"url"},{"key":"processing_status","type":"text","options":["queued","processing","completed","needs_review","failed"]},{"key":"processed_at","type":"datetime"},{"key":"extracted_data_json","type":"json"},{"key":"processing_error","type":"text"},{"key":"content_fingerprint","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Rounds":{"primaryKey":"round_id","columns":[{"key":"round_id","type":"text"},{"key":"application_id","type":"text"},{"key":"round_type","type":"text","options":["recruiter_screen","hm_interview","test"]},{"key":"round_number","type":"integer"},{"key":"round_status","type":"text","options":["planned","scheduled","in_progress","completed","cancelled","no_show"]},{"key":"interviewers_json","type":"json"},{"key":"scheduled_start_at","type":"datetime"},{"key":"scheduled_end_at","type":"datetime"},{"key":"timezone","type":"text"},{"key":"completed_at","type":"datetime"},{"key":"meeting_url","type":"url"},{"key":"calendly_booking_id","type":"text"},{"key":"calendar_event_id","type":"text"},{"key":"prep_event_id","type":"text"},{"key":"prep_status","type":"text","options":["pending","ready","failed","cancelled"]},{"key":"cv_document_id","type":"text"},{"key":"personalized_questions_json","type":"json"},{"key":"test_package_document_ids_json","type":"json"},{"key":"test_instructions","type":"text"},{"key":"test_sent_at","type":"datetime"},{"key":"test_planned_date","type":"date"},{"key":"test_due_at","type":"datetime"},{"key":"test_submitted_at","type":"datetime"},{"key":"test_submission_document_ids_json","type":"json"},{"key":"test_status","type":"text","options":["not_sent","sent","submitted","overdue","cancelled"]},{"key":"final_decision","type":"text","options":["pending","proceed","reject","reconsider"]},{"key":"decision_reason","type":"text"},{"key":"decided_at","type":"datetime"},{"key":"decided_by","type":"text"},{"key":"reschedule_count","type":"integer"},{"key":"cancellation_reason","type":"text"},{"key":"no_show_party","type":"text","options":["candidate","interviewer","both","unknown"]},{"key":"no_show_reason","type":"text"},{"key":"no_show_reason_source","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Feedback":{"primaryKey":"feedback_id","columns":[{"key":"feedback_id","type":"text"},{"key":"application_id","type":"text"},{"key":"round_id","type":"text"},{"key":"feedback_type","type":"text","options":["interviewer","recruiter","candidate","ai_screening","ai_interview","ai_test"]},{"key":"author_name","type":"text"},{"key":"author_email","type":"email"},{"key":"requested_at","type":"datetime"},{"key":"due_at","type":"datetime"},{"key":"submitted_at","type":"datetime"},{"key":"feedback_status","type":"text","options":["pending","submitted","cancelled"]},{"key":"criteria_url_used","type":"url"},{"key":"criteria_version_used","type":"text"},{"key":"cv_document_id","type":"text"},{"key":"source_document_ids_json","type":"json"},{"key":"recommendation","type":"text","options":["review_more","proceed","reject","reconsider","not_applicable"]},{"key":"fit_score","type":"percent"},{"key":"coverage_score","type":"percent"},{"key":"summary","type":"text"},{"key":"strengths","type":"text"},{"key":"concerns","type":"text"},{"key":"answers_json","type":"json"},{"key":"evidence_json","type":"json"},{"key":"followup_questions_json","type":"json"},{"key":"change_scope","type":"text","options":["not_applicable","application_only","role_portrait"]},{"key":"portrait_change_proposal","type":"text"},{"key":"form_url","type":"url"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Tasks":{"primaryKey":"task_id","columns":[{"key":"task_id","type":"text"},{"key":"job_id","type":"text"},{"key":"application_id","type":"text"},{"key":"round_id","type":"text"},{"key":"task_type","type":"text","options":["review_cv","send_approach","send_test","send_thank_you","prepare_interview","attend_interview","request_feedback","followup_feedback","ask_next_availability","followup_test","discuss_salary","funnel_checkpoint","review_portrait","start_onboarding","other"]},{"key":"title","type":"text"},{"key":"description","type":"text"},{"key":"assignee_email","type":"email"},{"key":"due_at","type":"datetime"},{"key":"priority","type":"text","options":["low","normal","high"]},{"key":"task_status","type":"text","options":["open","in_progress","snoozed","done","cancelled"]},{"key":"trigger_type","type":"text","options":["manual","cv_received","round_scheduled","round_completed","feedback_received","decision_recorded","email_sent","offer_changed","job_checkpoint"]},{"key":"trigger_id","type":"text"},{"key":"related_feedback_id","type":"text"},{"key":"related_email_id","type":"text"},{"key":"dedupe_key","type":"text"},{"key":"snoozed_until","type":"datetime"},{"key":"completed_at","type":"datetime"},{"key":"cancellation_reason","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Emails":{"primaryKey":"email_id","columns":[{"key":"email_id","type":"text"},{"key":"application_id","type":"text"},{"key":"round_id","type":"text"},{"key":"task_id","type":"text"},{"key":"email_type","type":"text","options":["approach","interview_invitation","test","thank_you","progress_update","next_round","offer","other"]},{"key":"to_email","type":"email"},{"key":"cc_emails_json","type":"json"},{"key":"subject","type":"text"},{"key":"body","type":"text"},{"key":"template_id","type":"text"},{"key":"template_version","type":"text"},{"key":"attachment_document_ids_json","type":"json"},{"key":"email_status","type":"text","options":["draft","ready","sending","sent","failed","cancelled"]},{"key":"prepared_at","type":"datetime"},{"key":"send_requested_by","type":"text"},{"key":"send_requested_at","type":"datetime"},{"key":"sent_at","type":"datetime"},{"key":"provider_message_id","type":"text"},{"key":"provider_thread_id","type":"text"},{"key":"last_error","type":"text"},{"key":"dedupe_key","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"Offers":{"primaryKey":"offer_id","columns":[{"key":"offer_id","type":"text"},{"key":"application_id","type":"text"},{"key":"offer_version","type":"integer"},{"key":"negotiation_status","type":"text","options":["not_started","in_progress","agreed","declined"]},{"key":"offer_status","type":"text","options":["draft","prepared","sent","accepted","declined","expired","cancelled"]},{"key":"base_salary","type":"number"},{"key":"salary_currency","type":"text"},{"key":"salary_period","type":"text","options":["monthly","annual","hourly"]},{"key":"salary_basis","type":"text","options":["gross","net"]},{"key":"compensation_details_json","type":"json"},{"key":"offer_document_id","type":"text"},{"key":"issued_at","type":"datetime"},{"key":"response_due_at","type":"datetime"},{"key":"candidate_responded_at","type":"datetime"},{"key":"candidate_response_reason","type":"text"},{"key":"accepted_at","type":"datetime"},{"key":"agreed_start_date","type":"date"},{"key":"onboarding_status","type":"text","options":["not_started","pending_start","in_progress","completed","cancelled"]},{"key":"onboarding_owner_email","type":"email"},{"key":"onboarding_notes","type":"text"},{"key":"created_at","type":"datetime"},{"key":"updated_at","type":"datetime"},{"key":"updated_by","type":"text"}]},"ActivityLog":{"primaryKey":"activity_id","columns":[{"key":"activity_id","type":"text"},{"key":"occurred_at","type":"datetime"},{"key":"actor","type":"text"},{"key":"source","type":"text","options":["drive","ats_ui","feedback_form","automation","ai","calendar","email"]},{"key":"entity_type","type":"text","options":["Jobs","Candidates","Applications","Documents","Rounds","Feedback","Tasks","Emails","Offers"]},{"key":"entity_id","type":"text"},{"key":"job_id","type":"text"},{"key":"application_id","type":"text"},{"key":"action","type":"text","options":["create","update","status_change","reschedule","send_requested","email_sent","email_failed","feedback_submitted","ai_assessment","task_completed","cancel"]},{"key":"field_name","type":"text"},{"key":"old_value_json","type":"json"},{"key":"new_value_json","type":"json"},{"key":"reason","type":"text"},{"key":"correlation_id","type":"text"}]}};

export function createDemo() {
  const state=createEmpty();state.mode='demo';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const at=(day=0,hour=9,minute=0)=>new Date(new Date(`${today}T00:00:00+07:00`).getTime()+day*86400000+hour*3600000+minute*60000).toISOString();
  const date=offset=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at(offset)));
  const base={created_at:at(-7),updated_at:at(-1),updated_by:'demo'};
  const jobs=[
    {job_id:'job_demo_fe',job_title:'Senior Frontend Engineer',job_status:'open',hiring_manager_name:'Minh — HM demo',hiring_manager_email:'minh.hm@example.invalid',recruiter_email:'recruiter@example.invalid',headcount:2,work_location:'TP. Hồ Chí Minh',work_mode:'hybrid',salary_min:45000000,salary_max:65000000,salary_currency:'VND',salary_period:'monthly',salary_basis:'gross',criteria_version:'v1',sourcing_started_date:date(-7),funnel_checkpoint_date:date(0),target_hire_date:date(30),funnel_targets_json:JSON.stringify({screening:8,interview:4}),...base},
    {job_id:'job_demo_pd',job_title:'Product Designer',job_status:'open',hiring_manager_name:'Hà — HM demo',hiring_manager_email:'ha.hm@example.invalid',recruiter_email:'recruiter@example.invalid',headcount:1,work_location:'TP. Hồ Chí Minh',work_mode:'remote',salary_min:30000000,salary_max:45000000,salary_currency:'VND',salary_period:'monthly',salary_basis:'gross',criteria_version:'v1',sourcing_started_date:date(-4),funnel_checkpoint_date:date(3),target_hire_date:date(35),funnel_targets_json:JSON.stringify({screening:6,interview:3}),...base},
  ];
  state.tables.Jobs.push(...jobs);
  const people=[
    ['An Trần','Frontend Engineer · 5 năm','screening','job_demo_fe',.82,.76,'React, TypeScript, Design system','Cần hỏi sâu về ownership khi xây design system.'],
    ['Bình Lê','Frontend Engineer · 4 năm','interview','job_demo_fe',.88,.82,'React, Accessibility, Testing','Có ví dụ rõ về accessibility; đào sâu trade-off hiệu năng.'],
    ['Chi Nguyễn','Frontend Engineer · 6 năm','test','job_demo_fe',.91,.86,'TypeScript, Architecture, Mentoring','Theo dõi bài test T1; chưa có kết quả để quyết định.'],
    ['Duy Phạm','Frontend Engineer · 3 năm','sourced','job_demo_fe',null,null,'React, Next.js','CV chưa được đánh giá.'],
    ['Giang Võ','Product Designer · 5 năm','interview','job_demo_pd',.84,.71,'Product design, Research, Figma','Portfolio có case study; cần kiểm chứng tác động và vai trò cá nhân.'],
    ['Hải Đỗ','Product Designer · 4 năm','offer','job_demo_pd',.9,.9,'UX research, Systems, B2B SaaS','Đang thảo luận mức lương và ngày bắt đầu.'],
    ['Khánh Bùi','Frontend Engineer · 5 năm','closed','job_demo_fe',.35,.81,'Vue, JavaScript','Chưa đáp ứng yêu cầu React cho vai trò hiện tại.'],
    ['Lan Huỳnh','Product Designer · 3 năm','screening','job_demo_pd',.75,.48,'Visual design, Prototyping','Thiếu bằng chứng về research; chưa xem đây là mismatch.'],
    ['Nam Vũ','Frontend Engineer · 7 năm','onboarding','job_demo_fe',.92,.94,'React, TypeScript, Team leadership','Đã đồng ý offer, chờ xác nhận ngày bắt đầu.'],
  ];
  people.forEach((p,index)=>{
    const [name,experience,stage,job,fit,coverage,skills,note]=p,id=`cand_demo_${index+1}`,appId=`app_demo_${index+1}`,documentId=`doc_demo_cv_${index+1}`;
    const candidate={candidate_id:id,full_name:name,email:`candidate${index+1}@example.invalid`,phone:'',location:'TP. Hồ Chí Minh',timezone:'Asia/Ho_Chi_Minh',linkedin_url:'',github_url:'',portfolio_url:'',current_cv_document_id:documentId,source:index%3===0?'referral':'direct_application',source_url:'',open_to_work_status:'unknown',open_to_work_evidence_url:'',open_to_work_checked_at:'',notes:`${experience}\n${skills}\n${note}`, ...base};
    const app={application_id:appId,candidate_id:id,job_id:job,recruiter_email:'recruiter@example.invalid',source:candidate.source,applied_at:at(-6+index%4),stage,application_status:stage==='closed'?'rejected':'active',stage_entered_at:at(-2),current_round_id:'',cv_document_id:documentId,latest_screening_feedback_id:fit===null?'':`fb_demo_ai_${index+1}`,recruiter_decision:stage==='closed'?'reject':stage==='sourced'?'pending':['screening','test'].includes(stage)?'review_more':'proceed',decision_reason:stage==='closed'?note:'',decided_at:stage==='closed'?at(-1):'',decided_by:stage==='closed'?'recruiter-demo':'',salary_expectation:job==='job_demo_pd'?38000000:55000000,salary_currency:'VND',salary_period:'monthly',salary_basis:'gross',notice_period_days:30,available_start_date:date(30),closed_at:stage==='closed'?at(-1):'',closure_reason:stage==='closed'?note:'',...base};
    const doc={document_id:documentId,document_type:'cv',candidate_id:id,job_id:job,application_id:appId,round_id:'',drive_file_id:'',file_url:'',file_name:`CV_${name.replace(/ /g,'_')}_DEMO.pdf`,file_version:'demo-1',version_status:'current',received_at:app.applied_at,source_folder_url:'',processing_status:'completed',processed_at:app.applied_at,extracted_data_json:JSON.stringify({experience,skills:skills.split(', '),note:'Dữ liệu ví dụ giả lập; chưa đọc CV thật.'}),processing_error:'',content_fingerprint:'',...base};
    state.tables.Candidates.push(candidate);state.tables.Applications.push(app);state.tables.Documents.push(doc);
    if(fit!==null) state.tables.Feedback.push({feedback_id:`fb_demo_ai_${index+1}`,application_id:appId,round_id:'',feedback_type:'ai_screening',author_name:'AI demo',author_email:'',requested_at:'',due_at:'',submitted_at:at(-2),feedback_status:'submitted',criteria_url_used:'',criteria_version_used:'v1',cv_document_id:documentId,source_document_ids_json:JSON.stringify([documentId]),recommendation:stage==='closed'?'reject':'review_more',fit_score:fit,coverage_score:coverage,summary:note,strengths:skills,concerns:stage==='closed'?note:'Điểm còn thiếu cần hỏi trong buổi trao đổi.',answers_json:'[]',evidence_json:JSON.stringify([{criterion:'Kinh nghiệm phù hợp',status:'evidence_found',evidence:experience},{criterion:'Craftsmanship',status:'interview_required',evidence:'Đánh giá bằng câu hỏi behavioural, chưa kết luận từ CV.'}]),followup_questions_json:JSON.stringify(['Kể về một quyết định bạn đã cải thiện chất lượng sản phẩm dù thời gian có hạn.','Bạn chịu trách nhiệm phần nào, và đo kết quả ra sao?']),change_scope:'application_only',portrait_change_proposal:'',form_url:'',...base});
  });
  const rounds=[
    {round_id:'round_demo_2',application_id:'app_demo_2',round_type:'hm_interview',round_number:1,round_status:'scheduled',interviewers_json:JSON.stringify([{name:'Minh — HM demo',email:'minh.hm@example.invalid'}]),scheduled_start_at:at(0,10),scheduled_end_at:at(0,11),timezone:'Asia/Ho_Chi_Minh',completed_at:'',meeting_url:'',calendly_booking_id:'',calendar_event_id:'',prep_event_id:'',prep_status:'ready',cv_document_id:'doc_demo_cv_2',personalized_questions_json:JSON.stringify(['Bạn xử lý xung đột giữa accessibility và deadline như thế nào?','Trong design system gần nhất, bạn tự quyết phần nào?','Kể một lỗi performance: cách tìm root cause, sửa và đo lại.']),final_decision:'pending',decision_reason:'',reschedule_count:0,...base},
    {round_id:'round_demo_5',application_id:'app_demo_5',round_type:'hm_interview',round_number:1,round_status:'scheduled',interviewers_json:JSON.stringify([{name:'Hà — HM demo',email:'ha.hm@example.invalid'}]),scheduled_start_at:at(0,14,30),scheduled_end_at:at(0,15,30),timezone:'Asia/Ho_Chi_Minh',completed_at:'',meeting_url:'',calendly_booking_id:'',calendar_event_id:'',prep_event_id:'',prep_status:'ready',cv_document_id:'doc_demo_cv_5',personalized_questions_json:JSON.stringify(['Research nào khiến bạn đổi hướng thiết kế?','Bạn đóng góp trực tiếp phần nào trong case study B2B?','Kể về lần phải chọn giữa craft và tốc độ ra mắt.']),final_decision:'pending',decision_reason:'',reschedule_count:0,...base},
    {round_id:'round_demo_3',application_id:'app_demo_3',round_type:'test',round_number:1,round_status:'in_progress',interviewers_json:'[]',timezone:'Asia/Ho_Chi_Minh',cv_document_id:'doc_demo_cv_3',personalized_questions_json:'[]',test_package_document_ids_json:JSON.stringify(['doc_demo_test']),test_instructions:'Thiết kế một component có loading / empty / error states. Giải thích trade-off và cách kiểm thử. Demo chưa có attachment thật.',test_sent_at:at(-1),test_planned_date:date(-1),test_due_at:at(1,17),test_submitted_at:'',test_submission_document_ids_json:'[]',test_status:'sent',final_decision:'pending',decision_reason:'',reschedule_count:0,...base},
    {round_id:'round_demo_6',application_id:'app_demo_6',round_type:'hm_interview',round_number:2,round_status:'completed',interviewers_json:JSON.stringify([{name:'Hà — HM demo',email:'ha.hm@example.invalid'},{name:'Vân — interviewer demo',email:'van.hm@example.invalid'}]),scheduled_start_at:at(-2,10),scheduled_end_at:at(-2,11),timezone:'Asia/Ho_Chi_Minh',completed_at:at(-2,11),cv_document_id:'doc_demo_cv_6',personalized_questions_json:JSON.stringify(['Bạn ưu tiên discovery và delivery ra sao?']),final_decision:'proceed',decision_reason:'Đã thống nhất tiếp tục thảo luận offer.',reschedule_count:0,...base},
  ];
  state.tables.Rounds.push(...rounds);
  for(const round of rounds) state.tables.Applications.find(app=>app.application_id===round.application_id).current_round_id=round.round_id;
  state.tables.Documents.push({document_id:'doc_demo_test',document_type:'test_package',candidate_id:'',job_id:'job_demo_fe',application_id:'',round_id:'',drive_file_id:'',file_url:'',file_name:'Frontend_T1_DEMO.pdf',file_version:'demo-1',version_status:'current',received_at:at(-7),processing_status:'completed',extracted_data_json:'{}',...base});
  state.tables.Feedback.push(
    {feedback_id:'fb_demo_hm_6',application_id:'app_demo_6',round_id:'round_demo_6',feedback_type:'interviewer',author_name:'Hà — HM demo',author_email:'ha.hm@example.invalid',requested_at:at(-2,11),due_at:at(0,9),submitted_at:at(-1,15),feedback_status:'submitted',criteria_version_used:'v1',cv_document_id:'doc_demo_cv_6',source_document_ids_json:'[]',recommendation:'proceed',fit_score:null,coverage_score:null,summary:'Có cách cấu trúc research và giải thích quyết định rõ. Muốn tiếp tục thảo luận offer.',strengths:'Phối hợp tốt với product và engineering.',concerns:'Cần thống nhất phạm vi ownership.',answers_json:'[]',evidence_json:'[]',followup_questions_json:'[]',change_scope:'application_only',...base},
    {feedback_id:'fb_demo_pending_6',application_id:'app_demo_6',round_id:'round_demo_6',feedback_type:'interviewer',author_name:'Vân — interviewer demo',author_email:'van.hm@example.invalid',requested_at:at(-2,11),due_at:at(0,9),submitted_at:'',feedback_status:'pending',criteria_version_used:'v1',cv_document_id:'doc_demo_cv_6',source_document_ids_json:'[]',recommendation:'not_applicable',fit_score:null,coverage_score:null,summary:'',answers_json:'[]',evidence_json:'[]',followup_questions_json:'[]',change_scope:'not_applicable',...base}
  );
  const tasks=[
    ['task_demo_1','app_demo_1','job_demo_fe','','review_cv','Review hồ sơ An Trần',at(0,9),'high','Cần đọc lại bằng chứng về design system trước khi quyết định.'],
    ['task_demo_2','app_demo_2','job_demo_fe','round_demo_2','prepare_interview','Chuẩn bị D1 · Bình Lê',at(0,9,45),'high','CV và 3 câu hỏi đào sâu đã sẵn trong hồ sơ demo.'],
    ['task_demo_3','app_demo_5','job_demo_pd','round_demo_5','prepare_interview','Chuẩn bị D1 · Giang Võ',at(0,14,15),'normal','Đọc case study và câu hỏi về research trước buổi trao đổi.'],
    ['task_demo_4','app_demo_6','job_demo_pd','round_demo_6','followup_feedback','Nhắc Vân gửi feedback D2',at(0,9),'high','Đã nhận feedback Hà; Vân chưa phản hồi.'],
    ['task_demo_5','app_demo_7','job_demo_fe','','send_thank_you','Review email thank you · Khánh Bùi',at(0,16),'normal','Kiểm tra nội dung rồi chủ động gửi sau khi kết nối email.'],
    ['task_demo_6','','job_demo_fe','','funnel_checkpoint','Kiểm tra funnel sau 5 ngày',at(0,9),'normal','Đối chiếu số hồ sơ mới, tỷ lệ phản hồi và số lịch đã chốt. Không tự sourcing.'],
    ['task_demo_7','app_demo_6','job_demo_pd','','discuss_salary','Trao đổi mức lương · Hải Đỗ',at(1,10),'normal','Xác nhận kỳ lương, gross/net và ngày có thể bắt đầu.'],
    ['task_demo_8','app_demo_3','job_demo_fe','round_demo_3','followup_test','Theo dõi hạn T1 · Chi Nguyễn',at(1,17),'normal','Bài test đang chờ nộp.'],
    ['task_demo_9','app_demo_9','job_demo_fe','','start_onboarding','Chuẩn bị onboarding · Nam Vũ',at(2,9),'normal','Chuyển checklist và owner onboarding.'],
  ];
  tasks.forEach(([id,app,job,round,type,title,due,priority,description])=>state.tables.Tasks.push({task_id:id,application_id:app,job_id:job,round_id:round,task_type:type,title,description,assignee_email:'recruiter@example.invalid',due_at:due,priority,task_status:'open',trigger_type:'manual',trigger_id:'',related_feedback_id:type==='followup_feedback'?'fb_demo_pending_6':'',related_email_id:'',dedupe_key:id,snoozed_until:'',completed_at:'',cancellation_reason:'',...base}));
  const email1=createEmailDraft(state,'app_demo_7','thank_you');email1.email_id='email_demo_1';
  const email2=createEmailDraft(state,'app_demo_4','approach');email2.email_id='email_demo_2';
  state.tables.Tasks.find(t=>t.task_id==='task_demo_5').related_email_id='email_demo_1';email1.task_id='task_demo_5';
  state.tables.Offers.push({offer_id:'offer_demo_6',application_id:'app_demo_6',offer_version:1,negotiation_status:'in_progress',offer_status:'draft',base_salary:38000000,salary_currency:'VND',salary_period:'monthly',salary_basis:'gross',compensation_details_json:JSON.stringify({note:'Mức lương ví dụ để review UX.'}),offer_document_id:'',issued_at:'',response_due_at:at(4,17),candidate_responded_at:'',candidate_response_reason:'',accepted_at:'',agreed_start_date:date(30),onboarding_status:'not_started',onboarding_owner_email:'',onboarding_notes:'',...base});
  state.tables.ActivityLog=[];
  for(const app of state.tables.Applications) state.tables.ActivityLog.push({activity_id:`act_demo_${app.application_id}`,occurred_at:app.applied_at,actor:'recruiter-demo',source:'ats_ui',entity_type:'Applications',entity_id:app.application_id,job_id:app.job_id,application_id:app.application_id,action:'create',field_name:'',old_value_json:'null',new_value_json:JSON.stringify({stage:app.stage,application_status:app.application_status}),reason:'Dữ liệu demo giả lập',correlation_id:`op_demo_${app.application_id}`});
  state.updated_at=nowISO();
  return state;
}
