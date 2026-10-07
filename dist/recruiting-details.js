const SOURCES = [
  ['drive_upload', 'Drive'], ['direct_application', 'Ứng tuyển trực tiếp'],
  ['linkedin', 'LinkedIn'], ['referral', 'Giới thiệu'], ['job_board', 'Job board'],
  ['sourcing', 'Sourcing'], ['other', 'Khác'],
];
const OPEN_TO_WORK = [['unknown', 'Chưa rõ'], ['verified', 'Đã xác minh'], ['not_open', 'Không tìm việc']];
const FIELDS = [
  ['source', 'Nguồn'], ['location', 'Địa điểm'], ['salary', 'Mức lương kỳ vọng'],
  ['notice_period_days', 'Notice period'], ['available_start_date', 'Ngày có thể bắt đầu'],
  ['open_to_work_status', 'Open to work'], ['notes', 'Ghi chú'],
];

export function recruitingValues(field, application, candidate) {
  switch (field) {
    case 'source': return {source: application.source ?? candidate.source ?? ''};
    case 'location': return {location: candidate.location || ''};
    case 'salary': return {salary_expectation: application.salary_expectation ?? '', salary_currency: application.salary_currency || 'VND'};
    case 'notice_period_days': return {notice_period_days: application.notice_period_days ?? ''};
    case 'available_start_date': return {available_start_date: application.available_start_date || ''};
    case 'open_to_work_status': return {open_to_work_status: candidate.open_to_work_status || 'unknown'};
    case 'notes': return {notes: candidate.notes || ''};
    default: throw new Error('Trường thông tin không được hỗ trợ.');
  }
}

export function recruitingChanges(field, values) {
  const keys = {source:['source'], location:['location'], salary:['salary_expectation','salary_currency'], notice_period_days:['notice_period_days'], available_start_date:['available_start_date'], open_to_work_status:['open_to_work_status'], notes:['notes']}[field];
  if (!keys) throw new Error('Trường thông tin không được hỗ trợ.');
  if (Object.keys(values).some(key => !keys.includes(key))) throw new Error('Chỉ cập nhật thông tin của trường đang sửa.');
  const text = key => String(values[key] ?? '').trim();
  const number = (key, title, integer = false) => {
    const raw = text(key);
    if (!raw) return '';
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value)))
      throw new Error(`${title} phải là ${integer ? 'số ngày nguyên' : 'số'} từ 0 trở lên.`);
    return value;
  };
  switch (field) {
    case 'source': {
      const value = text('source');
      if (value && !SOURCES.some(([key]) => key === value)) throw new Error('Chọn nguồn ứng viên hợp lệ.');
      return {table: 'Applications', changes: {source: value}};
    }
    case 'location': return {table: 'Candidates', changes: {location: text('location')}};
    case 'salary': {
      const amount = number('salary_expectation', 'Mức lương'), currency = text('salary_currency').toUpperCase();
      if (amount !== '' && !currency) throw new Error('Điền đơn vị tiền tệ cho mức lương.');
      return {table: 'Applications', changes: {salary_expectation: amount, salary_currency: currency}};
    }
    case 'notice_period_days': return {table: 'Applications', changes: {notice_period_days: number('notice_period_days', 'Notice period', true)}};
    case 'available_start_date': {
      const value = text('available_start_date');
      if (value) {
        const date = new Date(`${value}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
          throw new Error('Ngày có thể bắt đầu chưa hợp lệ.');
      }
      return {table: 'Applications', changes: {available_start_date: value}};
    }
    case 'open_to_work_status': {
      const value = text('open_to_work_status');
      if (!OPEN_TO_WORK.some(([key]) => key === value)) throw new Error('Chọn trạng thái tìm việc hợp lệ.');
      return {table: 'Candidates', changes: {open_to_work_status: value}};
    }
    case 'notes': return {table: 'Candidates', changes: {notes: String(values.notes ?? '')}};
    default: throw new Error('Trường thông tin không được hỗ trợ.');
  }
}

export function renderRecruitingDetails(application, candidate, {e, icon, drafts = {}}) {
  const input = (name, value, type = 'text', extra = '') => `<input name="${name}" value="${e(value)}" type="${type}" ${extra}>`;
  const select = (name, value, options) => `<select name="${name}">${options.map(([key, title]) => `<option value="${e(key)}" ${String(value) === key ? 'selected' : ''}>${e(title)}</option>`).join('')}</select>`;
  return `<section class="recruiting-details" aria-labelledby="recruiting-details-title"><div class="recruiting-details-heading"><h3 id="recruiting-details-title">Thông tin tuyển dụng</h3><small>Rê chuột hoặc chạm vào từng trường để sửa</small></div><div class="recruiting-fields">${FIELDS.map(([key, title]) => {
    const draft = drafts[`${application.application_id}:${key}`];
    const values = draft || recruitingValues(key, application, candidate);
    const id = `recruiting-${application.application_id}-${key}`;
    let control;
    switch (key) {
      case 'source': control = select('source', values.source, [['', 'Chưa có thông tin'], ...SOURCES]); break;
      case 'open_to_work_status': control = select(key, values[key], OPEN_TO_WORK); break;
      case 'salary': control = input('salary_expectation', values.salary_expectation, 'number', 'min="0" step="any" placeholder="Chưa có thông tin" aria-label="Mức lương kỳ vọng"') + input('salary_currency', values.salary_currency, 'text', 'class="inline-currency" placeholder="VND" aria-label="Đơn vị tiền tệ"'); break;
      case 'notice_period_days': control = input(key, values[key], 'number', 'min="0" step="1" placeholder="Chưa có thông tin"') + '<span class="inline-unit">ngày</span>'; break;
      case 'available_start_date': control = input(key, values[key], 'date'); break;
      case 'notes': control = `<textarea name="notes" rows="2" placeholder="Chưa có ghi chú">${e(values.notes)}</textarea>`; break;
      default: control = input(key, values[key], 'text', 'placeholder="Chưa có thông tin"');
    }
    // Associate the primary control with its visible label; grouped salary controls have their own names.
    control = control.replace(/<(input|select|textarea) /, `<$1 id="${e(id)}" aria-describedby="${e(id)}-error" `);
    const salaryContext = key === 'salary' ? [({monthly:'Theo tháng',annual:'Theo năm',hourly:'Theo giờ'})[application.salary_period] || application.salary_period, application.salary_basis].filter(Boolean).join(' · ') : '';
    return `<form class="inline-recruiting-field ${key === 'notes' ? 'is-wide' : ''} ${draft ? 'is-dirty' : ''}" data-recruiting-field="${key}" data-application-id="${e(application.application_id)}"><label for="${e(id)}" class="inline-recruiting-label">${e(title)}${icon('edit', 13)}</label><div class="inline-recruiting-control">${control}</div>${salaryContext ? `<small class="inline-recruiting-caption">${e(salaryContext)}</small>` : ''}<p id="${e(id)}-error" class="inline-recruiting-error" role="alert" hidden></p><div class="inline-recruiting-actions"><button type="submit" class="button primary small" aria-label="Lưu ${e(title)}">Lưu</button><button type="button" class="button ghost small" data-inline-cancel aria-label="Hủy sửa ${e(title)}">Hủy</button></div></form>`;
  }).join('')}</div></section>`;
}
