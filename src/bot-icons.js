// ไอคอนเส้นของแต่ละ bot (ใช้บนหน้าเว็บแทนอีโมจิ · ข้อความ LINE ยังใช้อีโมจิเดิม)
const PATHS = {
  // ลูกเต๋า
  random: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
  // เปลวไฟ
  hot: '<path d="M12 3c.6 3-1.8 4.6-1.8 7.3A2.2 2.2 0 0 0 14 11c0-1 .2-1.7.6-2.4 2 1.6 3.4 3.9 3.4 6.4a6 6 0 0 1-12 0c0-4.2 3.4-6.5 6-12z"/>',
  // เกล็ดหิมะ
  cold: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/>',
  // นาฬิกาทราย
  overdue: '<path d="M7 3h10M7 21h10M8 3c0 4 4 5 4 9s-4 5-4 9M16 3c0 4-4 5-4 9s4 5 4 9"/>',
  // ตาราง / หลักตัวเลข
  positional: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17"/>',
  // ห่วงโซ่
  markov: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  // มงกุฎ
  ensemble: '<path d="M3.5 8.5 8 12l4-6 4 6 4.5-3.5L18.5 18h-13z"/><path d="M5.5 21h13"/>',
  // กราฟเส้นขาขึ้น
  bayes: '<path d="M3.5 20.5h17"/><path d="M5 16l4.5-5 3.5 3 6-7"/><path d="M15 7h4v4"/>',
  // ประกาย (เลือกอัตโนมัติ)
  adaptive: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};

export function botIcon(id, color, size = 'md') {
  return `<span class="bot-ico bot-ico-${size}" style="--c:${color}" aria-hidden="true">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[id] ?? PATHS.random}</svg></span>`;
}
