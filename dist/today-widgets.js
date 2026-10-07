const TIMEZONE = 'Asia/Ho_Chi_Minh';
const PROCESSING_STATUSES = new Set(['active', 'on_hold']);
const CURRENT_ROUND_STATUSES = new Set(['planned', 'scheduled', 'in_progress', 'completed']);
const STAGE_ORDER = ['sourced', 'screening', 'interview', 'test', 'offer', 'onboarding'];
const STAGE_LABELS = {
  sourced: 'Tiếp cận', screening: 'Screening', interview: 'Phỏng vấn',
  test: 'Bài test', offer: 'Offer', onboarding: 'Onboarding',
};

// These are original prompts for the day, without an attributed author.
const QUOTES = [
  'Một bước nhỏ có chủ đích vẫn đưa bà tiến lên.',
  'Chọn việc quan trọng trước, rồi cho nó đủ sự tập trung.',
  'Một ngày rõ ràng bắt đầu từ một việc rõ ràng.',
  'Làm ít hơn một chút, nhưng làm đến nơi đến chốn.',
  'Một lời nhắc đúng lúc giúp công việc nhẹ đi.',
  'Tiến độ tốt có thể bắt đầu bằng mười phút tập trung.',
  'Ghi lại điều đã biết để dành chỗ cho điều cần hỏi.',
  'Một cuộc trò chuyện rõ ràng có thể mở ra bước tiếp theo.',
  'Bà không cần xử lý mọi thứ trong cùng một buổi sáng.',
  'Đặt ưu tiên giúp bà biết việc nào có thể chờ.',
  'Một quyết định có bằng chứng giúp cả hai phía yên tâm.',
  'Đôi khi bước tiếp theo chỉ là hỏi một câu cụ thể hơn.',
  'Giữ một khoảng trống nhỏ để nhìn lại điều vừa làm.',
  'Một việc đã hoàn tất đáng được ghi nhận.',
  'Sự nhất quán được xây từ những lần quay lại với ưu tiên.',
  'Mỗi hồ sơ đều có một câu chuyện cần được đọc kỹ.',
  'Một ghi chú tốt có thể tiết kiệm cả một cuộc hỏi lại.',
  'Bắt đầu từ việc bà có thể làm rõ ngay hôm nay.',
  'Một lịch hẹn được chuẩn bị kỹ giúp cuộc trao đổi sâu hơn.',
  'Giữ lời hẹn nhỏ để quy trình đi xa hơn.',
  'Một phản hồi tử tế cũng là một phần của công việc tốt.',
  'Bà có thể đi đều mà không cần vội ở mọi bước.',
  'Làm rõ điều còn thiếu trước khi đưa ra kết luận.',
  'Một ngày hiệu quả vẫn cần có lúc nghỉ.',
  'Việc tiếp theo dễ bắt đầu hơn khi được viết thành một câu.',
  'Thay đổi kế hoạch cũng là tiến bộ khi bà có thêm thông tin.',
  'Dành sự chú ý cho người đang chờ phản hồi.',
  'Đóng một việc đúng lúc giúp mở chỗ cho việc mới.',
  'Chất lượng thường đến từ những chi tiết bà chịu khó hỏi thêm.',
  'Cuối ngày, ghi lại một điều đã xong và một điều cần tiếp tục.',
  'Một nhịp làm việc bền vững sẽ đưa bà qua nhiều ngày bận rộn.',
];

function dateParts(value, fields) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Ngày chưa hợp lệ.');
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, ...fields,
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function getGreeting(date = new Date(), name = 'Linh') {
  const hour = Number(dateParts(date, {hour: '2-digit', hourCycle: 'h23'}).hour);
  const greeting = hour >= 8 && hour < 12 ? 'Good morning'
    : hour >= 12 && hour < 16 ? 'Good afternoon'
    : hour >= 16 && hour < 18 ? 'Good evening'
    : hour >= 18 && hour < 23 ? "Let's wrap today up"
    : 'Have some rest';
  const person = String(name ?? '').trim();
  return person ? `${greeting}, ${person}!` : `${greeting}!`;
}

export function getDailyQuote(date = new Date()) {
  const {year, month, day} = dateParts(date, {year: 'numeric', month: '2-digit', day: '2-digit'});
  const ordinal = Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86400000);
  return QUOTES[((ordinal % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

function stageGroup(application, rounds) {
  const stage = application.stage;
  const round = rounds.get(application.current_round_id);
  const expectedType = stage === 'interview' ? 'hm_interview' : stage === 'test' ? 'test' : null;
  if (expectedType && round && round.application_id === application.application_id
    && round.round_type === expectedType && CURRENT_ROUND_STATUSES.has(round.round_status)
    && Number.isSafeInteger(Number(round.round_number)) && Number(round.round_number) > 0) {
    const number = Number(round.round_number);
    return {
      key: `${stage}:${number}`, stage, roundNumber: number,
      label: formatRoundName(round),
    };
  }
  return {key: stage || 'processing', stage: stage || 'processing', roundNumber: null, label: STAGE_LABELS[stage] || 'Đang xử lý'};
}

export function formatRoundName(round = {}) {
  const number = Number(round.round_number);
  const suffix = Number.isSafeInteger(number) && number > 0 ? ` ${number}` : '';
  if (round.round_type === 'hm_interview') return suffix ? `Interview Round${suffix}` : 'Interview';
  if (round.round_type === 'test') return `Test${suffix}`;
  if (round.round_type === 'recruiter_screen') return 'Recruiter screening';
  return 'Vòng tuyển dụng';
}

export function humanizeRoundText(value) {
  // Keep file/record identifiers and URL paths intact; humanize only separate prose tokens.
  return String(value ?? '').split(/(https?:\/\/[^\s<>"']+)/giu).map(part => /^https?:\/\//iu.test(part) ? part : part
    .replace(/(?<![\p{L}\p{N}_-])D(\d+)(?![\p{L}\p{N}_-]|\.\d)/gu, (_, number) => `Interview Round ${Number(number)}`)
    .replace(/(?<![\p{L}\p{N}_-])T([12])(?![\p{L}\p{N}_-]|\.\d)/gu, (_, number) => `Test ${number}`)
  ).join('');
}

export function summarizeOpenJobs(state, jobFilter = 'all') {
  const tables = state?.tables || state || {};
  const jobs = (tables.Jobs || []).filter(job => job.job_status === 'open' && (jobFilter === 'all' || job.job_id === jobFilter));
  const rounds = new Map((tables.Rounds || []).map(round => [round.round_id, round]));
  const seen = new Set();
  const applications = (tables.Applications || []).filter(application => {
    if (!application.application_id || seen.has(application.application_id)) return false;
    seen.add(application.application_id);
    return PROCESSING_STATUSES.has(application.application_status) && application.stage !== 'closed';
  });
  const summaries = jobs.map(job => {
    const matching = applications.filter(application => application.job_id === job.job_id);
    const groups = new Map();
    for (const application of matching) {
      const group = stageGroup(application, rounds);
      if (!groups.has(group.key)) groups.set(group.key, {...group, count: 0});
      groups.get(group.key).count++;
    }
    const order = stage => STAGE_ORDER.includes(stage) ? STAGE_ORDER.indexOf(stage) : STAGE_ORDER.length;
    return {
      jobId: job.job_id, jobTitle: job.job_title,
      processingCount: matching.length,
      offerCount: matching.filter(application => application.stage === 'offer').length,
      groups: [...groups.values()].sort((a, b) => order(a.stage) - order(b.stage) || (a.roundNumber || 0) - (b.roundNumber || 0)),
    };
  });
  return {
    openJobCount: summaries.length,
    processingCount: summaries.reduce((sum, job) => sum + job.processingCount, 0),
    offerCount: summaries.reduce((sum, job) => sum + job.offerCount, 0),
    jobs: summaries,
  };
}

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function renderOpenJobsSummary(state, {e = escapeHTML, icon = () => '', label, jobFilter = 'all', expanded = false} = {}) {
  const summary = summarizeOpenJobs(state, jobFilter);
  const groupLabel = group => group.roundNumber ? group.label : (label?.(group.stage) || group.label);
  return `<details class="open-jobs-summary panel"${expanded ? ' open' : ''}><summary><span class="open-jobs-title">Các vị trí đang tuyển</span><span class="open-jobs-counts">${summary.openJobCount} vị trí · ${summary.processingCount} hồ sơ đang xử lý · ${summary.offerCount} hồ sơ ở Offer</span>${icon('down', 16)}</summary><div class="open-jobs-body">${summary.jobs.length ? summary.jobs.map(job => `<article class="open-job-row"><div class="open-job-heading"><h3><button type="button" class="text-button" data-action="job-pipeline" data-id="${e(job.jobId)}">${e(job.jobTitle)}</button></h3><p>${job.processingCount} hồ sơ đang xử lý · ${job.offerCount} hồ sơ ở Offer</p></div>${job.groups.length ? `<ul class="open-job-groups" aria-label="Phân bố hồ sơ theo giai đoạn">${job.groups.map(group => `<li><span>${e(groupLabel(group))}</span><strong>${group.count}</strong></li>`).join('')}</ul>` : '<p class="small muted">Chưa có hồ sơ đang xử lý.</p>'}</article>`).join('') : '<p class="small muted">Chưa có vị trí đang mở.</p>'}</div></details>`;
}
