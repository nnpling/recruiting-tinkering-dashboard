const KEY = 'recruiting-profile-v1';

export function loadProfileName() {
  try {
    const name=JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}').display_name;
    return typeof name==='string' && name.trim() && name.length<=80 ? name.trim() : 'Linh';
  }
  catch { return 'Linh'; }
}

export function saveProfileName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 80) throw new Error('Điền tên hiển thị từ 1 đến 80 ký tự.');
  if (!globalThis.localStorage) throw new Error('Trình duyệt chưa cho phép lưu tên hiển thị.');
  globalThis.localStorage.setItem(KEY, JSON.stringify({display_name: name}));
  return name;
}
