import {STAGES, moveApplication} from './model.js';

export function renderCandidateStage(application, {e, label}) {
  return `<label class="candidate-stage-box"><span class="sr-only">Giai đoạn tuyển dụng</span><select class="candidate-stage-select" data-change="candidate-stage" data-application-id="${e(application.application_id)}" aria-label="Giai đoạn tuyển dụng">${STAGES.map(stage => `<option value="${stage.key}" ${application.stage === stage.key ? 'selected' : ''}>${e(label(stage.key))}</option>`).join('')}</select></label>`;
}

export function changeCandidateStage(state, applicationId, stage) {
  if (!STAGES.some(item => item.key === stage)) throw new Error('Chọn giai đoạn tuyển dụng hợp lệ.');
  const application = state.tables.Applications.find(item => item.application_id === applicationId);
  if (!application) throw new Error('Không tìm thấy hồ sơ ứng viên.');
  if (application.stage === stage) return {kind: 'unchanged'};
  // Closing needs an explicit outcome and reason before cancelling pending work.
  if (stage === 'closed') return {kind: 'close'};
  const reopening = application.stage === 'closed';
  moveApplication(state, applicationId, stage, {
    status: application.application_status === 'on_hold' ? 'on_hold' : 'active',
    reason: reopening ? 'Recruiter mở lại hồ sơ bằng dropdown giai đoạn.' : 'Recruiter đổi giai đoạn bằng dropdown trên hồ sơ.',
  });
  return {kind: 'updated', reopened: reopening};
}
