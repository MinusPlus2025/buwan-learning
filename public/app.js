const $ = id => document.getElementById(id);

const publicConfig = {
  endpoint: 'https://buwan-learning.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_noAB446VY5wEZ2ouf0k5fB_UdkjHeFKF8X6BaVGd9M8phVgLxdMOKco'
};

const STORAGE_KEY = 'buwan_companion';
const STARTER_PROGRESS_KEY = 'buwan_starter_progress';
const LEARNING_HISTORY_KEY = 'buwan_learning_history';
const MAX_LEARNING_RECORDS = 200;
const SESSION_KEY = 'buwan_session';
const MODEL_KEY = 'buwan_model';
const MAX_SAVED_MESSAGES = 40;
const DEFAULT_COMPANION = { v: 1, name: '学伴', userTitle: '', call_me: '', avatar_id: 'paper', voice_id: '', style: 'gentle' };
const INTERESTS = ['钢琴', '绘画', '游泳', '摄影', '书法', '编程', '烘焙', '英语', '舞蹈', '园艺'];
const INTEREST_SCENES = {
  '钢琴': { note: '弹出一直喜欢的那段旋律', color: '#F1E5D5', art: '<circle cx="166" cy="44" r="34" fill="#E6CEAC"/><path d="m53 39 131 9 23 58-148-7z" fill="#596056"/><path d="m62 71 126 8 11 20-133-7z" fill="#FFFDF5"/><path d="m78 73 4 11m12-10 4 11m12-10 4 11m12-10 4 11m12-10 4 11m12-10 4 11" stroke="#596056" stroke-width="5"/><path d="m67 100-4 23m129-17 8 23" stroke="#596056" stroke-width="5"/><path d="M102 28v27m0-26 25-5v25" stroke="#B37852" stroke-width="2"/><ellipse cx="96" cy="56" rx="7" ry="4" fill="#B37852"/><ellipse cx="121" cy="50" rx="7" ry="4" fill="#B37852"/>' },
  '绘画': { note: '把眼里的日常，画下来', color: '#E6EADC', art: '<circle cx="74" cy="55" r="40" fill="#D6DFC6"/><path d="m111 25-27 103m59-103 29 103m-40-109v108" stroke="#A67D59" stroke-width="5" stroke-linecap="round"/><path d="m94 23 58-5 10 75-59 5z" fill="#FFFCF2" stroke="#C5AB85" stroke-width="3"/><circle cx="126" cy="45" r="10" fill="#E7B884"/><path d="m108 83 11-25 15 11 11-19 9 30" fill="#91A381"/><path d="M184 103c-19-15-21-5-17 4 7 13 39 10 39-1 0-9-11-10-22-3z" fill="#C69B77"/><circle cx="181" cy="107" r="3" fill="#D8664C"/><circle cx="193" cy="106" r="3" fill="#E7C982"/>' },
  '游泳': { note: '慢慢靠近水，也是一种勇敢', color: '#E0ECEC', art: '<path d="M34 86c18-13 32 12 51 0s32 12 51 0 32 12 51 0 26 7 31 2M28 108c18-13 32 12 51 0s32 12 51 0 32 12 51 0 26 7 31 2" stroke="#9ABFC1" stroke-width="4" stroke-linecap="round"/><path d="M77 85V32a12 12 0 0 1 24 0v54m13 0V32a12 12 0 0 1 24 0v54M100 47h15m-15 20h15" stroke="#708E8C" stroke-width="5"/><ellipse cx="172" cy="66" rx="23" ry="10" fill="#E7A582"/><ellipse cx="172" cy="64" rx="11" ry="5" fill="#E0ECEC"/><circle cx="194" cy="29" r="12" fill="#EEE0B8"/>' },
  '摄影': { note: '重新发现，身边的好风景', color: '#EDE4DE', art: '<circle cx="168" cy="51" r="41" fill="#DFCFC3"/><path d="m67 54 23-2 10-16 39 2 7 16 28 3-4 61-107-5z" fill="#677063"/><path d="m70 61 100 5-2 18-99-5z" fill="#7E8979"/><circle cx="119" cy="86" r="27" fill="#DCD8C7"/><circle cx="119" cy="86" r="20" fill="#454F49"/><circle cx="119" cy="86" r="11" fill="#87998E"/><circle cx="114" cy="81" r="4" fill="#D5DDD0"/><path d="M156 64h9" stroke="#F4E8D3" stroke-width="4"/><path d="m42 33 7-8m-9 26-12-2m26-5-1-12" stroke="#BB8766" stroke-width="2" stroke-linecap="round"/>' }
};
const NAME_SUGGESTIONS = ['阿晚', '小步', '知知', '慢慢', '豆豆', '老周'];
const STYLES = {
  gentle: { label: '温柔陪伴', detail: '慢一点也没关系', rate: 0.86, pitch: 1.08, prompt: '温柔、耐心，不催促，先接住感受' },
  humor: { label: '轻松幽默', detail: '把困难说得轻一点', rate: 1.02, pitch: 1.14, prompt: '轻松、有分寸地幽默，但不拿用户开玩笑' },
  direct: { label: '直接清晰', detail: '不绕弯，抓住下一步', rate: 1.06, pitch: 0.94, prompt: '直接、清晰、简短，帮用户聚焦' },
  coach: { label: '行动教练', detail: '把愿望拆成小动作', rate: 0.96, pitch: 1, prompt: '像行动教练，用具体问题推动下一小步' }
};
const DEMOS = [
  {
    id: 'piano', title: '29 岁 · 想学钢琴', note: '一直没买琴', interest: '钢琴',
    turns: ['我29岁，一直想学钢琴，但家里没有琴。', '我怕买了又坚持不下来，钱和空间也有限。', '如果能先试两周，每天二十分钟，我会更敢开始。']
  },
  {
    id: 'swim', title: '45 岁 · 想学游泳', note: '但很怕水', interest: '游泳',
    turns: ['我45岁，想学游泳，但小时候呛过水，现在还是怕。', '我最担心下水后慌张，也不想一个人练。', '我可以先找正规泳馆和教练，从熟悉浅水区开始。']
  },
  {
    id: 'painting', title: '62 岁 · 想学绘画', note: '眼睛容易累', interest: '绘画',
    turns: ['我62岁，退休后想学画画，但眼睛看久了容易累。', '我喜欢花草，不追求画得专业，只想安静地画。', '每次画十五分钟、用大一点的纸，我觉得比较可行。']
  }
];

let memoryCompanion = { ...DEFAULT_COMPANION };
const state = {
  sdk: null,
  model: null,
  modelStatus: 'loading',
  companion: { ...DEFAULT_COMPANION },
  messages: [],
  topicStart: 0,
  userTurns: 0,
  interests: new Set(),
  conversationId: makeUuid(),
  controller: null,
  serial: 0,
  busy: false,
  generating: false,
  demo: null,
  demoRunning: false,
  demoToken: 0,
  consented: false,
  pendingFirstMessage: '',
  pendingChatOptions: null,
  pendingDemo: null,
  ttsEnabled: false,
  speaking: false,
  utterance: null,
  recognition: null,
  recognitionToken: 0,
  guide: null,
  searchMeta: null,
  guideStatus: 'idle',
  activePlaceholder: null,
  activeChat: null,
  sessionActive: false,
  storageAvailable: true,
  restored: false
};

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0;
    return (char === 'x' ? random : (random & 3 | 8)).toString(16);
  });
}

function text(value) {
  return value == null ? '' : String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = text(content);
  return node;
}

function setStatus(message, isError = false) {
  const guideState = state.guideStatus === 'interrupted' ? '上次手册生成未完成，可重新生成。'
    : state.guideStatus === 'failed' ? '上次手册生成失败，可重试。' : '';
  const storage = state.storageAvailable
    ? `${state.restored ? `已从本浏览器恢复；${guideState}` : ''}会话与草稿仅保存在本浏览器（最近 40 条消息）。`
    : '本地保存不可用，刷新后可能丢失，请勿关闭页面。';
  $('chat-status').textContent = `${message} ${storage}`;
  $('chat-status').classList.toggle('error', isError || !state.storageAvailable);
}

function saveSession() {
  if (!state.sessionActive) return;
  const dropped = Math.max(0, state.messages.length - MAX_SAVED_MESSAGES);
  const snapshot = {
    v: 1,
    messages: state.messages.slice(dropped),
    topicStart: Math.max(0, state.topicStart - dropped),
    userTurns: state.userTurns,
    interests: [...state.interests],
    conversationId: state.conversationId,
    guide: state.guide,
    guideStatus: state.guideStatus,
    searchMeta: state.searchMeta,
    chatDraft: $('chat-input').value.slice(0, 500),
    interestDraft: $('interest-input').value.slice(0, 80)
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    state.storageAvailable = true;
  } catch {
    state.storageAvailable = false;
    setStatus('当前内容仍可在本页使用。', true);
  }
}

function saveDrafts() {
  state.sessionActive = true;
  saveSession();
}

function restoreSession() {
  let saved;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
    if (saved?.v !== 1 || !Array.isArray(saved.messages)
      || saved.messages.some(item => !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string')
      || !Number.isInteger(saved.topicStart) || saved.topicStart < 0 || saved.topicStart > saved.messages.length
      || !Number.isInteger(saved.userTurns) || saved.userTurns < 0
      || typeof saved.conversationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(saved.conversationId)
      || !Array.isArray(saved.interests) || saved.interests.some(item => typeof item !== 'string' || !item.trim() || item.length > 80)) {
      throw new Error('保存的会话格式无效');
    }
  } catch {
    state.storageAvailable = false;
    return false;
  }
  const dropped = Math.max(0, saved.messages.length - MAX_SAVED_MESSAGES);
  state.messages = saved.messages.slice(dropped).map(item => ({
    id: text(item.id) || makeUuid(), role: item.role, content: item.content,
    status: ['success', 'failed', 'interrupted'].includes(item.status) ? item.status : item.status === 'pending' ? 'interrupted' : 'success',
    error: item.status === 'pending' ? '上次回应未完成，请重试。' : text(item.error),
    partial: text(item.partial), demo: item.demo === true
  }));
  state.topicStart = Math.max(0, saved.topicStart - dropped);
  state.userTurns = saved.userTurns;
  state.interests = new Set(saved.interests.slice(0, 1));
  state.conversationId = saved.conversationId;
  state.guide = saved.guide && typeof saved.guide === 'object' && !Array.isArray(saved.guide) ? saved.guide : null;
  state.searchMeta = saved.searchMeta && typeof saved.searchMeta === 'object' && !Array.isArray(saved.searchMeta)
    ? { ...saved.searchMeta, results: asArray(saved.searchMeta.results).filter(item => item && typeof item === 'object') } : { results: [], configured: false, note: '' };
  state.guideStatus = saved.guideStatus === 'generating' ? 'interrupted'
    : ['complete', 'failed', 'interrupted'].includes(saved.guideStatus) ? saved.guideStatus : 'idle';
  state.sessionActive = true;
  state.restored = true;
  $('chat-input').value = text(saved.chatDraft).slice(0, 500);
  $('input-count').textContent = `${$('chat-input').value.length} / 500`;
  $('interest-input').value = text(saved.interestDraft ?? [...state.interests][0]).slice(0, 80);
  $('interest-feedback').textContent = state.interests.size ? `当前会话兴趣：「${[...state.interests][0]}」。输入框的修改需确认后生效。` : '兴趣草稿尚未确认。';
  $('conversation-id-short').textContent = state.conversationId.slice(0, 8);
  $('chat-log').replaceChildren();
  state.messages.forEach(renderSavedMessage);
  renderSeeds();
  document.querySelectorAll('[data-desk-interest]').forEach(button => {
    const selected = state.interests.has(button.dataset.deskInterest);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (state.interests.size) openStarter([...state.interests][0]);
  if (state.guide) renderGuide(state.guide, state.searchMeta, { restoring: true });
  updateUnlock();
  saveSession();
  setStatus(state.guideStatus === 'interrupted' ? '上次手册生成已中断，可重新生成；未恢复后台请求或计时。' : '已恢复会话、草稿和已完成手册；未恢复后台请求或计时。');
  return true;
}

function renderSavedMessage(item) {
  const rendered = appendMessage(item.role, item.content, { demo: item.demo });
  if (item.role === 'user' && ['failed', 'interrupted'].includes(item.status)) {
    const failure = appendMessage('assistant', `${item.partial ? `${item.partial}（未完成）\n` : ''}${item.error || '上次回应未完成，请重试。'}`, { demo: item.demo });
    addRetryButton(failure.message, item);
  }
  return rendered;
}

function setCompanionPresence(status) {
  const orb = document.querySelector('.sound-orb');
  if (!orb) return;
  const copy = {
    idle: ['在这里', '学伴正在这里等你', '先从一件想学的事开始'],
    listening: ['认真听', '我在认真听', '不用一次说清楚，慢慢来'],
    thinking: ['正在思考', '正在为你整理思路', '把愿望变成今天的一小步'],
    responding: ['正在回应', '正在为你整理思路', '把愿望变成今天的一小步'],
    complete: ['完成第一步', '今天的开始已留下', '你已经为兴趣迈出一步']
  }[status] || ['在这里', '学伴正在这里等你', '先从一件想学的事开始'];
  orb.dataset.state = status;
  $('companion-presence').textContent = copy[0];
  $('companion-state-title').textContent = copy[1];
  $('companion-state-detail').textContent = copy[2];
}

function safeUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function readCompanion() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { value: { ...memoryCompanion }, isFirst: true };
    const parsed = JSON.parse(raw);
    return { value: normalizeCompanion(parsed), isFirst: false };
  } catch {
    return { value: { ...memoryCompanion }, isFirst: true };
  }
}

function writeCompanion(value) {
  memoryCompanion = { ...value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // In-memory fallback is already updated.
  }
}

function normalizeCompanion(value) {
  const name = validName(value?.name, 6) ? text(value.name) : DEFAULT_COMPANION.name;
  const rawTitle = value?.userTitle ?? value?.call_me;
  const userTitle = validOptionalName(rawTitle, 8) ? text(rawTitle).trim() : '';
  const style = STYLES[value?.style] ? value.style : DEFAULT_COMPANION.style;
  return {
    v: 1,
    name,
    userTitle,
    call_me: userTitle,
    avatar_id: text(value?.avatar_id).trim() || DEFAULT_COMPANION.avatar_id,
    voice_id: text(value?.voice_id).trim(),
    style
  };
}

function validName(value, max) {
  return new RegExp(`^[\\p{L}\\p{N}]{1,${max}}$`, 'u').test(text(value).trim());
}

function validOptionalName(value, max) {
  const clean = text(value).trim();
  return clean === '' || validName(clean, max);
}

function updateCompanionUi() {
  const { name, style } = state.companion;
  $('header-companion-name').textContent = name;
  $('stage-companion-name').textContent = name;
  $('companion-style-label').textContent = STYLES[style].label;
  document.querySelectorAll('.message.assistant .avatar').forEach(node => { node.textContent = name.slice(0, 2); });
  document.querySelectorAll('.message.assistant .speaker-name').forEach(node => { node.textContent = name; });
}

function renderSeeds() {
  const root = $('interest-seeds');
  root.replaceChildren();
  INTERESTS.forEach(interest => {
    const button = el('button', 'seed-button');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.6');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('seed-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const paths = {
      '钢琴': 'M4 5h16v14H4z M8 5v14 M12 5v14 M16 5v14 M6 5v7 M10 5v7 M14 5v7 M18 5v7',
      '游泳': 'M3 18q3-3 6 0t6 0t6 0 M3 22q3-3 6 0t6 0t6 0 M6 13l5-5 6 5 M12 8l4-4 M18 5a2 2 0 1 0 0 .1',
      '绘画': 'M13 3l8 8-9 9H4v-8z M13 3l-2 6 4 4 6-2 M4 20l5-5',
      '摄影': 'M3 7h5l2-3h4l2 3h5v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
      '书法': 'M16 3l5 5-9 9-5 1 1-5z M3 21h18',
      '编程': 'M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
      '烘焙': 'M5 11a5 5 0 0 1 0-10 4 4 0 0 1 7 1 4 4 0 0 1 7-1 5 5 0 0 1 0 10v10H5z M8 16h8',
      '英语': 'M3 4h8v16H3z M13 4h8v16h-8z M6 8h2 M16 8h2 M6 12h2 M16 12h2',
      '舞蹈': 'M14 5a2 2 0 1 0 0 .1 M4 9l7 2 6-4 M11 11l3 5 6 3 M14 16l-6 6',
      '园艺': 'M12 21V10 M12 14C3 14 3 5 3 5s9 0 9 9z M12 10c0-7 9-7 9-7s0 9-9 9'
    };
    path.setAttribute('d', paths[interest] || paths['园艺']);
    icon.append(path);
    const scene = INTEREST_SCENES[interest];
    if (scene) {
      const illustration = el('span', 'interest-art');
      // These SVGs are fixed, authored illustrations; no user or model content is inserted.
      illustration.innerHTML = `<svg viewBox="0 0 250 140" fill="none" aria-hidden="true"><rect width="250" height="140" fill="${scene.color}"/>${scene.art}</svg>`;
      const copy = el('span', 'interest-copy');
      copy.append(el('strong', '', interest), el('small', '', scene.note));
      button.append(illustration, copy, el('span', 'interest-arrow', '↗'));
      button.setAttribute('aria-label', `选择${interest}：${scene.note}`);
    } else {
      button.classList.add('compact');
      button.append(icon, el('span', '', interest));
    }
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.interests.has(interest)));
    button.addEventListener('click', () => selectInterest(interest));
    root.append(button);
  });
}

function selectInterest(value) {
  const interest = text(value).replace(/\s+/g, ' ').trim();
  const feedback = $('interest-feedback');
  if (!interest || interest.length > 80) {
    feedback.textContent = interest ? '先用 80 字以内描述这件事。' : '先写下一件想学或想做到的事。';
    $('interest-input').setAttribute('aria-invalid', 'true');
    $('interest-input').focus();
    return false;
  }
  if (state.busy || state.generating || state.demoRunning) {
    feedback.textContent = '学伴正在回应，结束后就可以换一个想法。';
    return false;
  }
  const previous = [...state.interests][0];
  if (previous !== interest) {
    if (!prepareStarterSwitch(interest)) return false;
    stopRecognition();
    stopSpeech();
    state.userTurns = 0;
    state.guide = null;
    state.searchMeta = null;
    state.guideStatus = 'idle';
    $('chat-input').value = '';
    $('input-count').textContent = '0 / 500';
    state.pendingFirstMessage = '';
    state.pendingChatOptions = null;
    state.topicStart = state.messages.length;
    state.conversationId = makeUuid();
    $('conversation-id-short').textContent = state.conversationId.slice(0, 8);
    $('guide-section').hidden = true;
    $('guide-content').replaceChildren();
    state.demo = null;
    $('demo-banner').hidden = true;
    state.interests = new Set([interest]);
    addConversationMessage('assistant', `关于「${interest}」，你最想做到的一件小事是什么？`);
    setCompanionPresence('idle');
  }
  $('interest-input').value = interest;
  $('interest-input').removeAttribute('aria-invalid');
  feedback.textContent = `从「${interest}」开始。下面可以调整顾虑、时间和第一步。`;
  renderSeeds();
  document.querySelectorAll('[data-desk-interest]').forEach(button => {
    const selected = button.dataset.deskInterest === interest;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (previous !== interest || $('starter-workbench').hidden) openStarter(interest, { switchPrepared: previous !== interest });
  else $('starter-workbench').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  updateUnlock();
  saveDrafts();
  return true;
}

const starter = { id: '', day: '', source: null, interest: '', worry: '怕坚持不下来', minutes: 10, remaining: 600, deadline: 0, timer: null, running: false, started: false, completed: false, completedAt: null, fromGuide: false };
let learningRecords = null;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readLearningRecords() {
  if (learningRecords) return learningRecords;
  let records = [];
  let imported = false;
  try {
    const saved = JSON.parse(localStorage.getItem(LEARNING_HISTORY_KEY) || 'null');
    if (saved?.v === 1 && Array.isArray(saved.records)) {
      records = saved.records.filter(item => item && typeof item.id === 'string' && typeof item.interest === 'string' && typeof item.task === 'string');
      imported = saved.legacyImported === true;
    }
  } catch {
    // 新历史损坏时仍尝试读取原有任务。
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(STARTER_PROGRESS_KEY) || '{}');
    for (const [interest, item] of Object.entries(imported ? {} : legacy || {})) {
      if (!item || typeof item.day !== 'string' || typeof item.task !== 'string') continue;
      const id = `legacy:${JSON.stringify([interest, item.day])}`;
      if (records.some(record => record.id === id)) continue;
      const minutes = [5, 10, 20].includes(item.minutes) ? item.minutes : 10;
      const remaining = Number.isFinite(item.remaining) ? Math.max(0, Math.min(minutes * 60, item.remaining)) : minutes * 60;
      records.push({ ...item, id, interest, minutes, remaining,
        source: { kind: item.fromGuide ? 'legacyGuide' : 'custom' },
        elapsedSeconds: minutes * 60 - remaining, completedAt: item.completedAt || null });
    }
  } catch {
    // 旧存储原样保留；仍可使用已读取的新历史。
  }
  learningRecords = records.slice(-MAX_LEARNING_RECORDS);
  return learningRecords;
}

function persistLearningRecords() {
  learningRecords = readLearningRecords().slice(-MAX_LEARNING_RECORDS);
  try {
    localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify({ v: 1, legacyImported: true, records: learningRecords }));
    return true;
  } catch {
    state.storageAvailable = false;
    setStatus('任务记录未能保存，请不要关闭当前页面。', true);
    return false;
  }
}

function readStarterProgress(interest) {
  return readLearningRecords().findLast(item => item.interest === interest && item.day === todayKey()) || null;
}

function sourceLabel(source) {
  if (source?.kind === 'week') return `四周手册 · 第 ${source.weekIndex + 1} 周任务（仅本项练习）`;
  if (source?.kind === 'first') return '四周手册 · 第一课';
  if (source?.kind === 'legacyGuide') return '旧手册任务（未关联具体课次）';
  return '自主任务';
}

function sameSource(left, right) {
  return left?.kind === right?.kind && left?.guideId === right?.guideId && left?.weekIndex === right?.weekIndex;
}

function sourcePracticed(source) {
  return readLearningRecords().some(item => item.completed && sameSource(item.source, source));
}

function settleStarterClock() {
  if (starter.running) starter.remaining = Math.max(0, Math.min(starter.minutes * 60, (starter.deadline - Date.now()) / 1000));
}

function writeStarterProgress() {
  if (!starter.interest) return true;
  settleStarterClock();
  const records = readLearningRecords();
  const previous = records.find(item => item.id === starter.id);
  starter.id ||= makeUuid();
  starter.day ||= todayKey();
  starter.source ||= { kind: 'custom' };
  const record = { ...previous, id: starter.id, day: starter.day, interest: starter.interest,
    source: { ...starter.source }, task: $('starter-task').value.trim(), worry: starter.worry,
    minutes: starter.minutes, remaining: starter.remaining, started: starter.started,
    completed: starter.completed, completedAt: starter.completedAt,
    elapsedSeconds: starter.minutes * 60 - starter.remaining,
    fromGuide: starter.fromGuide, updatedAt: new Date().toISOString() };
  learningRecords = [...records.filter(item => item.id !== record.id), record];
  const saved = persistLearningRecords();
  renderLearningHistory();
  return saved;
}

function pauseStarter(message = '已暂停，按你的节奏来') {
  settleStarterClock();
  clearInterval(starter.timer);
  starter.timer = null;
  starter.running = false;
  starter.deadline = 0;
  const saved = writeStarterProgress();
  $('starter-start').disabled = starter.completed || starter.started && starter.remaining === 0;
  $('starter-start').textContent = starter.completed ? '本项已完成' : starter.started ? '继续这一小步' : '开始这一小步';
  $('starter-session-state').textContent = message;
  updateStarterClock();
  return saved;
}

function prepareStarterSwitch(target) {
  if (!starter.interest) return true;
  if (starter.completed) {
    setFocusMode(false);
    return true;
  }
  if (!starter.completed && (starter.started || $('starter-task').value.trim())) {
    const task = $('starter-task').value.trim();
    if (!window.confirm(`「${starter.interest}」的未完成任务「${task}」将保存为暂停进度，再切换到「${target}」。是否保存后切换？`)) return false;
  }
  if (!pauseStarter()) return false;
  setFocusMode(false);
  return true;
}

function renderLearningHistory() {
  const root = $('learning-history-list');
  root.replaceChildren();
  const day = $('learning-history-date').value;
  const interest = $('learning-history-interest').value.trim();
  const records = [...readLearningRecords()].reverse().filter(item => (!day || item.day === day) && (!interest || item.interest.includes(interest)));
  if (!records.length) root.append(el('p', 'source-note', '还没有符合条件的学习记录。'));
  records.forEach(item => {
    const row = el('article', 'guide-card history-card');
    const heading = el('div', 'history-card-heading');
    const identity = el('div', 'history-identity');
    const date = el('time', 'history-date', item.day);
    date.setAttribute('datetime', item.day);
    identity.append(date, el('h3', 'history-card-title', item.interest));
    const status = item.completed ? '已完成' : item.id === starter.id && starter.running ? '进行中' : item.started ? '已暂停' : '待开始';
    const badge = el('span', 'history-status', status);
    badge.dataset.completed = String(Boolean(item.completed));
    heading.append(identity, badge);
    row.append(heading, el('p', 'history-task', item.task));
    const meta = el('div', 'history-meta');
    meta.append(el('span', '', sourceLabel(item.source)),
      el('span', '', `实际用时 ${Math.round((item.elapsedSeconds || 0) * 10) / 10} 秒`));
    if (item.completedAt) meta.append(el('span', '', `完成于 ${new Date(item.completedAt).toLocaleString('zh-CN')}`));
    else if (item.completed) meta.append(el('span', '', '旧记录未保存完成时间'));
    row.append(meta);
    const action = el('button', 'quiet-button', item.completed ? '带入一次复盘草稿' : '恢复这项任务');
    action.type = 'button';
    action.disabled = item.id === starter.id && !item.completed;
    action.addEventListener('click', () => {
      if (!item.completed) {
        openStarter(item.interest, { recordId: item.id });
        return;
      }
      if ($('chat-input').disabled) { setStatus('学伴正在生成手册，结束后可带入复盘。'); return; }
      if ($('chat-input').value.trim() && !window.confirm('聊天输入框已有草稿，是否替换为这次练习的复盘草稿？')) return;
      if ([...state.interests][0] !== item.interest && !selectInterest(item.interest)) return;
      $('chat-input').value = `请陪我复盘 ${item.day} 的「${item.interest}」练习：${item.task}。来源：${sourceLabel(item.source)}，实际用时 ${Math.round((item.elapsedSeconds || 0) * 10) / 10} 秒。我完成了什么、哪里卡住、下一步如何调整？`.slice(0, 500);
      $('input-count').textContent = `${$('chat-input').value.length} / 500`;
      saveDrafts();
      $('chat-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('chat-input').focus({ preventScroll: true });
      setStatus('复盘草稿已带入输入框，确认后可发送。');
    });
    row.append(action);
    root.append(row);
  });
}
const STARTER_TASKS = {
  '钢琴': '听一段你喜欢的钢琴旋律，选出最想学会的十秒钟，写下曲名。',
  '游泳': '找到一家正规泳馆，查看教练资质和成人初学体验课，记下一个想问的问题。今天不独自下水。',
  '绘画': '找一片叶子或一个杯子，用手边的笔画出轮廓，留下第一张练习。',
  '摄影': '用手机拍同一个物品的三个角度，选出自己最喜欢的一张。',
  '书法': '用手边的笔写三遍自己的名字，圈出最喜欢的一个字。',
  '编程': '打开浏览器开发者工具的控制台，输入 1 + 1，按回车看看结果。',
  '烘焙': '选一道想做的简单点心，核对家里已有的工具和食材，列出缺少的两样。',
  '英语': '挑一句今天用得上的英语，听一遍，再用自己的声音读三遍。',
  '舞蹈': '在平整空旷的地方，选一段喜欢的音乐，舒适地跟着节拍走八拍。',
  '园艺': '观察身边一株植物，摸一摸表层土壤，记录它今天的光照和状态。'
};

function renderStarterOptions() {
  [['starter-worries', ['怕坚持不下来', '担心年龄太晚', '没装备和基础'], 'worry'], ['starter-times', [5, 10, 20], 'minutes']].forEach(([id, values, key]) => {
    const root = $(id);
    root.replaceChildren();
    values.forEach(value => {
      const button = el('button', 'starter-option', key === 'minutes' ? `${value} 分钟` : value);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(starter[key] === value));
      button.disabled = starter.started || starter.completed;
      button.addEventListener('click', () => {
        if (starter.started || starter.completed) return;
        starter[key] = value;
        if (key === 'minutes') starter.remaining = value * 60;
        writeStarterProgress();
        renderStarterOptions();
        updateStarterClock();
        updateStarterNote();
      });
      root.append(button);
    });
  });
}

function updateStarterNote() {
  const notes = {
    '怕坚持不下来': '今天只完成这一件小事，不需要承诺坚持四周。',
    '担心年龄太晚': '从自己的起点开始，今天只和开始前的自己比。',
    '没装备和基础': '这一步优先用手边已有的东西，不急着购买设备。'
  };
  const origin = starter.fromGuide ? `来源：${sourceLabel(starter.source)}。` : Object.hasOwn(STARTER_TASKS, starter.interest) ? '这是可修改的预设建议。' : '这是通用起步建议；和学伴聊聊，可以进一步细化。';
  $('starter-task-note').textContent = `${notes[starter.worry] || ''} ${origin}`;
}

function updateStarterClock() {
  const seconds = Math.max(0, Math.ceil(starter.remaining));
  $('starter-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const progress = Math.round((1 - seconds / (starter.minutes * 60)) * 100);
  $('starter-clock-ring').dataset.progress = String(progress);
  $('starter-clock-ring').setAttribute('aria-label', `已进行 ${progress}%`);
  $('starter-clock-ring').style.setProperty('--progress', `${progress}%`);
}

function openStarter(interest, options = {}) {
  const records = readLearningRecords();
  const saved = options.recordId ? records.find(item => item.id === options.recordId)
    : options.fresh ? null
      : options.source ? records.findLast(item => item.interest === interest && sameSource(item.source, options.source) && !item.completed)
        : readStarterProgress(interest);
  if (options.recordId && !saved) return false;
  if (saved?.id === starter.id && starter.interest) {
    $('starter-workbench').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  }
  if (!options.switchPrepared && !prepareStarterSwitch(options.task || interest)) return false;
  clearInterval(starter.timer);
  const minutes = [5, 10, 20].includes(saved?.minutes) ? saved.minutes : starter.minutes;
  const worry = saved?.worry || starter.worry;
  const source = saved?.source || options.source || { kind: 'custom' };
  const fromGuide = source.kind !== 'custom';
  const started = saved?.started === true && saved.completed !== true;
  const remaining = Number.isFinite(saved?.remaining) ? Math.max(0, Math.min(minutes * 60, saved.remaining)) : minutes * 60;
  Object.assign(starter, { id: saved?.id || makeUuid(), day: saved?.day || todayKey(), source, interest, minutes, worry, remaining,
    deadline: 0, timer: null, running: false, started, completed: saved?.completed === true, completedAt: saved?.completedAt || null, fromGuide });
  $('starter-workbench').hidden = false;
  $('starter-title').textContent = `想学${interest}，先从这一小步试试`;
  const suggested = Object.hasOwn(STARTER_TASKS, interest) ? STARTER_TASKS[interest] : `为「${interest}」写下一个最想做到的小目标，再列出手边已有的条件和一个想问的问题。`;
  $('starter-task').value = text(saved?.task || options.task || suggested).slice(0, 2000);
  $('starter-task').disabled = starter.completed || starter.started;
  $('starter-start').disabled = starter.completed || starter.started && starter.remaining === 0;
  $('starter-start').textContent = starter.completed ? '本项已完成' : starter.started ? '继续这一小步' : '开始这一小步';
  $('starter-complete').disabled = !starter.started || starter.completed;
  $('starter-next').hidden = !starter.completed;
  $('starter-achievement').textContent = starter.completed ? `今天已经为${interest}留下了一个真实的开始。` : '';
  $('starter-achievement').hidden = !starter.completed;
  $('starter-session-state').textContent = starter.completed ? '本项已完成，可以继续另一项任务' : starter.started ? (starter.remaining === 0 ? '时间到了，确认完成后留下记录' : '已恢复暂停进度，点击继续；离开页面期间未计时') : '由你决定何时开始';
  renderStarterOptions();
  updateStarterNote();
  updateStarterClock();
  writeStarterProgress();
  $('starter-workbench').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return true;
}

function setFocusMode(active) {
  document.body.classList.toggle('focus-mode', active);
  $('starter-exit-focus').hidden = !active;
  if (active) {
    $('starter-workbench').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setStatus('专注模式已开启，只做眼前这一小步。');
  }
}

function resetStarter() {
  clearInterval(starter.timer);
  Object.assign(starter, { remaining: starter.minutes * 60, running: false, started: false, completed: false, deadline: 0 });
  setFocusMode(false);
}

function setupStarter() {
  $('learning-history-date').addEventListener('input', renderLearningHistory);
  $('learning-history-interest').addEventListener('input', renderLearningHistory);
  $('starter-next').addEventListener('click', () => openStarter(starter.interest, { fresh: true }));
  renderLearningHistory();
  $('starter-exit-focus').addEventListener('click', () => setFocusMode(false));
  $('starter-start').addEventListener('click', () => {
    if (starter.completed || starter.started && starter.remaining === 0) return;
    if (!$('starter-task').value.trim()) { $('starter-task').focus(); return; }
    if (starter.running) {
      pauseStarter();
    } else {
      setFocusMode(true);
      starter.started = true;
      starter.running = true;
      starter.deadline = Date.now() + starter.remaining * 1000;
      $('starter-task').disabled = true;
      writeStarterProgress();
      $('starter-start').textContent = '暂停一下';
      $('starter-complete').disabled = false;
      $('starter-session-state').textContent = '正在进行，只专注眼前这一件事';
      renderStarterOptions();
      starter.timer = setInterval(() => {
        starter.remaining = Math.max(0, (starter.deadline - Date.now()) / 1000);
        updateStarterClock();
        if (starter.remaining === 0) {
          clearInterval(starter.timer);
          starter.running = false;
          writeStarterProgress();
          $('starter-start').disabled = true;
          $('starter-session-state').textContent = '时间到了，做到了多少都可以';
        }
      }, 250);
    }
    updateStarterClock();
  });
  $('starter-complete').addEventListener('click', () => {
    if (!starter.started || starter.completed) return;
    settleStarterClock();
    clearInterval(starter.timer);
    starter.running = false;
    starter.deadline = 0;
    starter.completed = true;
    starter.completedAt = new Date().toISOString();
    $('starter-start').disabled = true;
    $('starter-start').textContent = '本项已完成';
    $('starter-complete').disabled = true;
    $('starter-next').hidden = false;
    renderStarterOptions();
    $('starter-achievement').textContent = `本项任务已完成。你为${starter.interest}留下了一次真实练习。`;
    writeStarterProgress();
    updateStarterClock();
    $('starter-achievement').hidden = false;
    if (state.guide) renderGuide(state.guide, state.searchMeta || { results: [] }, { restoring: true });
    updateLearningSteps();
    setCompanionPresence('complete');
    setFocusMode(false);
    $('starter-session-state').textContent = '本项已完成，可以继续另一项任务';
  });
  $('starter-task').addEventListener('input', writeStarterProgress);
  $('starter-chat').addEventListener('click', () => {
    $('chat-input').value = `我想学${starter.interest}，但${starter.worry}。今天能留出${starter.minutes}分钟。我的第一步想做：${$('starter-task').value.trim()}`.slice(0, 500);
    $('input-count').textContent = `${$('chat-input').value.length} / 500`;
    saveDrafts();
    $('chat-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('chat-input').focus({ preventScroll: true });
    setStatus('已把你的选择带入对话，确认后发送给学伴。');
  });
}

function renderDemos() {
  const root = $('demo-list');
  root.replaceChildren();
  DEMOS.forEach(demo => {
    const button = el('button', 'demo-button');
    button.type = 'button';
    const title = el('strong', '', demo.title);
    const note = el('span', '', demo.note);
    button.append(title, note);
    button.addEventListener('click', () => runDemo(demo));
    root.append(button);
  });
}

function appendMessage(role, content, options = {}) {
  const message = el('article', `message ${role}${options.loading ? ' loading' : ''}`);
  message.dataset.role = role;
  const avatar = el('div', 'avatar', role === 'assistant' ? state.companion.name.slice(0, 2) : '我');
  avatar.setAttribute('aria-hidden', 'true');
  const body = el('div', 'message-body');
  const meta = el('div', 'message-meta');
  const speaker = el('strong', role === 'assistant' ? 'speaker-name' : '', role === 'assistant' ? state.companion.name : (state.companion.userTitle || '你'));
  const kind = el('span', '', options.demo ? '演示对话' : role === 'assistant' ? '学伴' : '你说');
  const copy = el('p', 'message-text', content);
  meta.append(speaker, kind);
  body.append(meta, copy);
  message.append(avatar, body);
  $('chat-log').append(message);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  return { message, copy };
}

function addConversationMessage(role, content, options = {}) {
  state.messages.push({ id: makeUuid(), role, content, status: 'success', demo: options.demo === true });
  const rendered = appendMessage(role, content, options);
  updateUnlock();
  saveSession();
  return rendered;
}

function addRetryButton(message, item) {
  if (message.querySelector('.retry-button')) return;
  const retry = el('button', 'retry-button', '重试这条回应');
  retry.type = 'button';
  retry.addEventListener('click', async () => {
    if (state.busy || state.generating || state.demoRunning) return;
    if (!state.messages.slice(state.topicStart).includes(item)) {
      setStatus('这条消息属于之前的兴趣，请在当前兴趣下重新发送。', true);
      return;
    }
    if (!state.consented) {
      state.pendingFirstMessage = item.content;
      state.pendingChatOptions = { retryMessage: item, failureMessage: message };
      $('consent-dialog').showModal();
      return;
    }
    await sendChatMessage(item.content, { retryMessage: item, failureMessage: message });
  });
  message.querySelector('.message-body')?.append(retry);
}

function updateLearningSteps() {
  const activeIndex = state.guide ? 3 : state.userTurns >= 2 ? 2 : state.userTurns >= 1 ? 1 : 0;
  [...$('learning-steps').children].forEach((item, index) => {
    item.classList.toggle('active', index === activeIndex);
    item.classList.toggle('completed', index < activeIndex || index === 3 && !!state.guide && sourcePracticed({ kind: 'first', guideId: ensureGuideId(state.guide) }));
    if (index === activeIndex) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}

function updateUnlock() {
  const count = Math.min(state.userTurns, 3);
  $('turn-count').textContent = `${count} / 3`;
  $('generate-guide').disabled = state.userTurns < 3 || state.busy || state.generating;
  $('generate-guide').textContent = state.generating ? '正在展开…' : '展开开始手册 →';
  updateLearningSteps();
}

function initialGreeting() {
  const style = STYLES[state.companion.style].label;
  const greeting = `我是${state.companion.name}，会用${style}的方式陪你。想学什么，或者是什么让你一直没开始？`;
  addConversationMessage('assistant', greeting);
}

function setBusy(busy, label = '') {
  state.busy = busy;
  $('send-message').disabled = busy || state.generating;
  $('model-select').disabled = busy || state.generating || !state.model;
  $('chat-input').disabled = state.generating;
  $('cancel-request').hidden = !busy && !state.generating && !state.demoRunning;
  if (label) setStatus(label);
  updateUnlock();
}

function abortActive(message = '') {
  stopRecognition();
  stopSpeech();
  if (state.activeChat) {
    const { item, placeholder } = state.activeChat;
    item.status = 'interrupted';
    item.error = '回应已取消，可以重试。';
    placeholder.message.classList.remove('loading');
    placeholder.copy.textContent = `${item.partial ? `${item.partial}（未完成）\n` : ''}${item.error}`;
    addRetryButton(placeholder.message, item);
    state.activeChat = null;
    state.activePlaceholder = null;
  }
  if (state.generating) state.guideStatus = 'interrupted';
  state.serial += 1;
  state.demoToken += 1;
  state.controller?.abort();
  state.controller = null;
  setCompanionPresence('idle');
  state.activePlaceholder?.remove();
  state.activePlaceholder = null;
  state.busy = false;
  state.generating = false;
  state.demoRunning = false;
  $('cancel-request').hidden = true;
  $('chat-input').disabled = false;
  $('send-message').disabled = false;
  $('model-select').disabled = !state.model;
  updateUnlock();
  saveSession();
  if (message) setStatus(message);
}

function newConversation(options = {}) {
  abortActive();
  if (starter.interest) pauseStarter();
  resetStarter();
  Object.assign(starter, { interest: '', id: '', day: '', source: null, completedAt: null });
  renderLearningHistory();
  state.sessionActive = false;
  state.restored = false;
  try {
    localStorage.removeItem(SESSION_KEY);
    state.storageAvailable = true;
  } catch {
    state.storageAvailable = false;
  }
  $('chat-input').value = '';
  $('input-count').textContent = '0 / 500';
  state.pendingFirstMessage = '';
  state.pendingChatOptions = null;
  state.pendingDemo = null;
  $('starter-workbench').hidden = true;
  state.messages = [];
  state.topicStart = 0;
  $('interest-input').value = options.interest || '';
  $('interest-input').removeAttribute('aria-invalid');
  $('interest-feedback').textContent = '';
  state.userTurns = 0;
  state.conversationId = makeUuid();
  const guideAction = document.querySelector('.first-lesson-action .primary-button');
  if (guideAction) { guideAction.disabled = false; guideAction.textContent = '带入今天的任务'; }
  $('learning-steps').lastElementChild?.classList.remove('completed');
  state.guide = null;
  state.searchMeta = null;
  state.guideStatus = 'idle';
  state.demo = options.demo || null;
  state.interests = new Set(options.interest ? [options.interest] : []);
  $('chat-log').replaceChildren();
  $('guide-section').hidden = true;
  $('guide-content').replaceChildren();
  $('conversation-id-short').textContent = state.conversationId.slice(0, 8);
  $('demo-banner').hidden = !state.demo;
  if (state.demo) $('demo-banner-text').textContent = `${state.demo.title}，内容将由真实模型回应。`;
  renderSeeds();
  if (!options.skipGreeting) initialGreeting();
  document.querySelectorAll('[data-desk-interest]').forEach(button => {
    const selected = state.interests.has(button.dataset.deskInterest);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (options.demo || options.interest) saveDrafts();
  updateUnlock();
  setStatus(state.demo ? '正在回放演示，模型回应和手册均为实时生成。' : '已清除保存的会话、手册和草稿；本地任务进度保留。');
}

function boundedMessages(through = null) {
  const end = through ? state.messages.indexOf(through) + 1 : state.messages.length;
  return state.messages.slice(state.topicStart, end)
    .filter(item => item.status === 'success' || item === through)
    .slice(-20).map(item => ({ role: item.role, content: item.content }));
}

function companionSystem(extra = '') {
  const title = state.companion.userTitle ? `称呼用户为“${state.companion.userTitle}”` : '自然称呼用户，不擅自取名';
  return `你是中文学习伙伴“${state.companion.name}”。你的风格是：${STYLES[state.companion.style].prompt}。${title}。你帮助成年人把想学的事变成可开始的小步。不得编造用户经历、案例、研究、课程或来源；不确定就明确说不确定。用日常口语和短句说话，标点自然停顿，不用播音腔、角色自述或每轮重复安慰；贴着用户刚说的具体事情回应。每次只问一个问题，回复不超过60个汉字，避免空泛鼓励。游泳相关绝不建议独自下水，也不建议任何憋气练习。${extra}`;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
}

async function streamCompletion({ system, messages, signal, json = false, timeout = 60000, onDelta }) {
  throwIfAborted(signal);
  if (!state.sdk || !state.model) throw new Error('模型尚未就绪');
  const local = new AbortController();
  const abort = () => local.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; local.abort(); }, timeout);
  const request = {
    model: state.model.id,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: true,
    signal: local.signal,
    conversationId: state.conversationId
  };
  if (json) request.response_format = { type: 'json_object' };
  let output = '';
  let finishReason = null;
  try {
    throwIfAborted(signal);
    const stream = await state.sdk.llm.chat.completions.create(request);
    for await (const chunk of stream) {
      throwIfAborted(local.signal);
      const choice = chunk?.choices?.[0];
      if (chunk?.error) throw new Error(text(chunk.error.message) || '模型流返回错误');
      if (choice?.delta?.refusal || choice?.message?.refusal || choice?.finish_reason === 'refusal') {
        throw new Error('模型拒绝了这次请求，请调整内容后重试');
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (finishReason === 'length') throw new Error('模型回应达到长度限制，未完成，请重试');
      if (finishReason === 'content_filter') throw new Error('模型回应被内容过滤，未完成，请调整内容后重试');
      const delta = choice?.delta?.content;
      if (typeof delta === 'string') {
        output += delta;
        onDelta?.(output, delta);
      }
    }
    throwIfAborted(local.signal);
    if (finishReason && finishReason !== 'stop') throw new Error(`模型回应未正常完成（${finishReason}）`);
    if (!output.trim()) throw new Error('模型返回了空回应，请重试');
    return output.trim();
  } catch (error) {
    if (timedOut) throw new Error(`请求超过 ${Math.ceil(timeout / 1000)} 秒，已超时`);
    throwIfAborted(signal);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    local.abort();
  }
}

function normalizeChatReply(value) {
  let clean = text(value).replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
  const firstQuestion = clean.search(/[？?]/);
  if (firstQuestion >= 0) clean = clean.slice(0, firstQuestion + 1);
  return clean;
}

async function sendChatMessage(value, options = {}) {
  const content = text(value).trim();
  if (!content || state.busy || state.generating) return false;
  if (!state.model) {
    setStatus('模型暂不可用，内容已保留，请稍后再试。', true);
    return false;
  }
  const controller = options.controller || new AbortController();
  if (controller.signal.aborted) return false;
  const item = options.retryMessage || { id: makeUuid(), role: 'user', content, demo: options.demo === true };
  if (options.retryMessage && (!state.messages.slice(state.topicStart).includes(item) || item.status === 'success')) return false;
  stopRecognition();
  const serial = ++state.serial;
  state.controller = controller;
  if (!options.retryMessage) {
    appendMessage('user', content, { demo: options.demo });
    state.messages.push(item);
  }
  Object.assign(item, { status: 'pending', error: '', partial: '' });
  if (!options.retryMessage && !options.demo) {
    $('chat-input').value = '';
    $('input-count').textContent = '0 / 500';
  }
  options.failureMessage?.remove();
  state.sessionActive = true;
  saveSession();
  setBusy(true, `${state.companion.name}正在想一个问题…`);
  setCompanionPresence('thinking');
  avatarController?.setPresence('thinking');
  const placeholder = appendMessage('assistant', '正在回应', { loading: true, demo: options.demo });
  state.activePlaceholder = placeholder.message;
  state.activeChat = { item, placeholder };
  let streamed = '';
  try {
    const history = boundedMessages(item);
    const raw = await streamCompletion({
      system: companionSystem('学习愿望在普通用户资料消息中提供。兴趣不限于预设类别，保留用户的具体表达；含糊时先澄清，不擅自归到其他兴趣。'),
      messages: [{ role: 'user', content: `用户资料：${JSON.stringify({ selected_interests: [...state.interests] })}` }, ...history],
      signal: controller.signal,
      timeout: 60000,
      onDelta: output => {
        if (serial !== state.serial) return;
        streamed = output;
        item.partial = normalizeChatReply(output);
        placeholder.copy.textContent = item.partial || '正在回应';
      }
    });
    if (serial !== state.serial) return false;
    throwIfAborted(controller.signal);
    const reply = normalizeChatReply(raw);
    if (!reply) throw new Error('模型未返回可显示的回应，请重试');
    setCompanionPresence('responding');
    placeholder.copy.textContent = reply;
    placeholder.message.classList.remove('loading');
    state.activePlaceholder = null;
    state.activeChat = null;
    Object.assign(item, { status: 'success', error: '', partial: '' });
    const index = state.messages.indexOf(item);
    state.messages.splice(index + 1, 0, { id: makeUuid(), role: 'assistant', content: reply, status: 'success', demo: item.demo });
    state.userTurns += 1;
    saveSession();
    if (options.retryMessage) {
      $('chat-log').replaceChildren();
      state.messages.forEach(renderSavedMessage);
    }
    updateUnlock();
    setCompanionPresence('idle');
    setStatus(state.userTurns >= 3 ? '已经聊了三轮，可以展开开始手册。' : `再聊 ${3 - state.userTurns} 轮，就能展开开始手册。`);
    speak(reply);
    return true;
  } catch (error) {
    if (serial !== state.serial) return false;
    placeholder.message.classList.remove('loading');
    state.activePlaceholder = null;
    setCompanionPresence('idle');
    state.activeChat = null;
    item.status = error.name === 'AbortError' ? 'interrupted' : 'failed';
    item.partial = normalizeChatReply(streamed);
    item.error = error.name === 'AbortError' ? '回应已取消，可以重试。' : `回应未完成：${modelErrorMessage(error)}`;
    placeholder.copy.textContent = `${item.partial ? `${item.partial}（未完成）\n` : ''}${item.error}`;
    addRetryButton(placeholder.message, item);
    saveSession();
    setStatus(`${item.error} 你发送的内容仍然保留，可以点击消息下方重试。`, error.name !== 'AbortError');
    return false;
  } finally {
    if (serial === state.serial) {
      if (!options.demo) state.controller = null;
      setBusy(false);
    }
  }
}

function parseModelJson(raw) {
  const clean = text(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error('模型没有返回有效 JSON');
  }
}

async function modelJson(system, payload, signal, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    throwIfAborted(signal);
    try {
      const raw = await streamCompletion({
        system,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        signal,
        json: true,
        timeout: 60000
      });
      throwIfAborted(signal);
      return parseModelJson(raw);
    } catch (error) {
      throwIfAborted(signal);
      lastError = error;
      if (error.name === 'AbortError' || !(error instanceof SyntaxError) || attempt >= retries) throw error;
    }
  }
  throw lastError;
}

async function postJson(url, body, signal) {
  throwIfAborted(signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    let data = {};
    try { data = await response.json(); } catch { /* Preserve caller content on malformed network responses. */ }
    throwIfAborted(controller.signal);
    if (!response.ok) {
      const error = new Error(text(data.error || data.note) || `请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (timedOut) throw new Error('请求超过 60 秒，已超时');
    throwIfAborted(signal);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function structuredSystem(task) {
  const title = state.companion.userTitle ? `称呼用户为“${state.companion.userTitle}”` : '自然称呼用户，不擅自取名';
  return `你是中文学习伙伴“${state.companion.name}”。你的风格是：${STYLES[state.companion.style].prompt}。${title}。你帮助成年人把想学的事变成可开始的小步。不得编造用户经历、真人案例、研究、课程、效果或来源；不确定就明确说不确定。游泳相关绝不建议独自下水或憋气练习。${task}`;
}

function extractionSystem() {
  return structuredSystem('这次只执行信息提取，不进行对话。只返回JSON对象，字段严格为interest、age、search_queries。interest是学习兴趣字符串；age是数字或null；search_queries是恰好3条适合公开网络搜索的中文查询。不得补写用户未提供的信息。');
}

function guideSystem() {
  return structuredSystem('这次只编写开始手册，不向用户提问。只返回JSON对象，字段严格为title、story、goal、worry、answer、examples、resources、plan、first_lesson、share_text。examples为字符串数组；resources为对象数组，每项只有name、desc、url，且URL只能选用输入search_results中存在的值；plan为恰好4项的对象数组，每项含week、goal、task。内容务实。若search_results为空，resources必须为空，并明确不声称联网查证。游泳计划只能在正规场所、有救生员或教练陪同下进行。');
}

async function generateGuide() {
  if (state.userTurns < 3 || state.generating || state.busy) return;
  if (!state.model) {
    setStatus('模型暂不可用，当前对话已保留。', true);
    return;
  }
  stopRecognition();
  const serial = ++state.serial;
  const controller = new AbortController();
  state.controller = controller;
  state.generating = true;
  state.guideStatus = 'generating';
  saveSession();
  setBusy(true, '正在读懂你的兴趣与顾虑…');
  updateUnlock();
  const conversation = boundedMessages();
  let extracted;
  let searchData = { results: [], configured: false, note: '未检索到可用搜索来源' };
  let generated;
  try {
    extracted = await modelJson(extractionSystem(), { selected_interests: [...state.interests], conversation }, controller.signal, 1);
    if (serial !== state.serial) return;
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) throw new Error('学习愿望提取不完整，请重试');
    extracted.interest = [...state.interests][0] || text(extracted.interest).trim().slice(0, 80);
    if (!extracted.interest) throw new Error('还没有明确想学的事，请先和学伴聊清楚');
    const queries = asArray(extracted.search_queries).filter(value => typeof value === 'string').map(value => value.trim().slice(0, 160)).filter(Boolean).slice(0, 3);
    while (queries.length < 3) queries.push(`${text(extracted.interest) || [...state.interests][0] || '成人学习'} 入门`);
    setStatus('正在检查公开搜索服务是否可用…');
    try {
      const searched = await postJson('/api/search', { queries, interest: extracted.interest }, controller.signal);
      searchData = {
        results: asArray(searched.results).slice(0, 12),
        configured: searched.configured === true,
        searchId: text(searched.searchId),
        provider: text(searched.provider),
        scope: text(searched.scope),
        note: text(searched.note)
      };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      searchData = { results: [], configured: false, note: `搜索失败：${error.message}` };
    }
    if (serial !== state.serial) return;
    setStatus(searchData.configured ? '正在把对话和搜索来源整理成四周手册…' : '搜索未接通，正在仅根据对话生成四周建议；不作联网查证…');
    generated = await modelJson(guideSystem(), {
      companion: state.companion,
      selected_interests: [...state.interests],
      extracted,
      conversation,
      search_results: searchData.results.map(item => ({ title: text(item.title), url: safeUrl(item.url), snippet: text(item.snippet) }))
    }, controller.signal, 1);
    if (serial !== state.serial) return;
    setStatus('正在检查手册结构与来源链接…');
    let finalResult;
    try {
      const validated = await postJson('/api/validate-result', { result: generated, interest: extracted.interest, searchId: searchData.searchId }, controller.signal);
      finalResult = validated.result;
      if (!finalResult || typeof finalResult !== 'object' || !Array.isArray(finalResult.plan4) || finalResult.plan4.length !== 4) throw new Error('服务器未返回完整四周手册');
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`来源校验未完成：${error.message}`);
    }
    if (serial !== state.serial) return;
    state.guide = { ...finalResult, id: makeUuid(), interest: text(extracted.interest || [...state.interests][0]) };
    state.searchMeta = searchData;
    state.guideStatus = 'complete';
    saveSession();
    renderGuide(state.guide, searchData);
    setStatus('开始手册已展开。它不是期限，只是一条可以调整的路。');
  } catch (error) {
    if (serial !== state.serial) return;
    state.guideStatus = error.name === 'AbortError' ? 'interrupted' : 'failed';
    saveSession();
    if (error.name === 'AbortError') setStatus('已取消生成，对话内容仍然保留。');
    else setStatus(`手册暂未生成：${error.message}。对话内容仍然保留，可再次尝试。`, true);
  } finally {
    if (serial === state.serial) {
      state.controller = null;
      state.generating = false;
      setBusy(false);
      updateUnlock();
    }
  }
}

function appendListCard(root, className, title, values) {
  const card = el('article', `guide-card ${className}`);
  card.append(el('h3', '', title));
  const items = asArray(values).map(text).filter(Boolean);
  if (items.length) {
    const list = el('ul');
    items.forEach(item => list.append(el('li', '', item)));
    card.append(list);
  } else {
    card.append(el('p', '', '暂时没有可展示的内容。'));
  }
  root.append(card);
}

function appendTextCard(root, className, title, value) {
  const card = el('article', `guide-card ${className}`);
  card.append(el('h3', '', title), el('p', '', text(value) || '还没有写下这一项。'));
  root.append(card);
}

function ensureGuideId(result) {
  if (typeof result.id !== 'string' || !result.id) result.id = makeUuid();
  return result.id;
}

function guideTaskButton(source, task, interest) {
  const completed = readLearningRecords().filter(item => item.interest === interest && item.completed && sameSource(item.source, source));
  const latest = completed.at(-1);
  const button = el('button', 'primary-button', latest
    ? `累计已练习 ${completed.length} 次 · 最近完成：${latest.completedAt ? new Date(latest.completedAt).toLocaleString('zh-CN') : latest.day} · 再次练习`
    : '带入今日任务');
  button.type = 'button';
  button.addEventListener('click', () => {
    const unfinished = readLearningRecords().some(item => item.interest === interest && !item.completed && sameSource(item.source, source));
    openStarter(interest, { fresh: !unfinished, source, task });
  });
  return button;
}

function renderGuide(result, searchData, options = {}) {
  const guideId = ensureGuideId(result);
  const interest = text(result.interest || [...state.interests][0] || '兴趣');
  const section = $('guide-section');
  const root = $('guide-content');
  root.replaceChildren();
  $('guide-heading').textContent = text(result.title) || '你的四周开始手册';
  $('guide-story').textContent = text(result.story) || '从你说过的话出发，把想学变成今天能开始的一小步。';

  const grid = el('div', 'guide-grid');
  appendTextCard(grid, 'goal', '你真正想抵达的地方', result.goal);
  appendTextCard(grid, 'worry', '最牵绊你的事', result.worry);
  appendTextCard(grid, 'answer', `${state.companion.name}的回应`, result.answer);
  if (asArray(result.examples).length) appendListCard(grid, 'examples', '可以借鉴的做法', result.examples);

  const resourceCard = el('article', 'guide-card resources');
  resourceCard.append(el('h3', '', '搜索来源'));
  const allowed = new Set(asArray(searchData.results).map(item => safeUrl(item.url)).filter(Boolean));
  const resources = asArray(result.resources).filter(item => allowed.has(safeUrl(item?.url)));
  const resourceList = el('div', 'resource-list');
  if (resources.length) {
    resources.forEach(item => {
      const link = el('a', 'resource-link');
      link.href = safeUrl(item.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(el('strong', '', text(item.name || item.title) || '查看来源'), el('span', '', text(item.snippet || item.desc || item.reason)));
      resourceList.append(link);
    });
    resourceCard.append(resourceList, el('p', 'source-note', searchData.scope || '公开知识页面参考'), el('p', 'source-note', '以上为检索到的阅读来源，不代表课程推荐或事实核验。'));
  } else {
    resourceCard.append(el('p', '', '未检索到可用搜索来源，本手册未作联网查证。'));
    if (searchData.note) resourceCard.append(el('p', 'source-note', searchData.note));
  }
  grid.append(resourceCard);
  root.append(grid);

  const manual = el('div', 'plan-manual');
  const weeks = asArray(result.plan).length ? asArray(result.plan).slice(0, 4) : asArray(result.plan4).slice(0, 4);
  for (let index = 0; index < 4; index += 1) {
    const week = weeks[index] || {};
    const details = el('details', 'week');
    if (index === 0) details.open = true;
    const summary = el('summary');
    summary.append(el('span', 'week-number', `WEEK ${String(index + 1).padStart(2, '0')}`), el('strong', '', text(week.goal || week.title) || `第 ${index + 1} 周`));
    const task = text(week.task || week.action) || '根据这一周的感受，调整下一小步。';
    const content = el('div', 'week-content');
    content.append(el('p', '', task), guideTaskButton({ kind: 'week', guideId, weekIndex: index }, task, interest));
    details.append(summary, content);
    manual.append(details);
  }
  root.append(manual);

  const first = el('div', 'first-lesson');
  const firstCopy = el('div', 'first-lesson-copy');
  firstCopy.append(el('span', '', '今天的第一课'), el('p', '', text(result.first_lesson) || '用十分钟，把第一步放进今天。'));
  const firstAction = el('div', 'first-lesson-action');
  const startToday = guideTaskButton({ kind: 'first', guideId }, text(result.first_lesson).trim() || '用十分钟，把第一步放进今天。', interest);
  firstAction.append(startToday);
  first.append(firstCopy, firstAction);
  root.append(first);
  if (result.share_text) root.append(el('div', 'share-copy', text(result.share_text)));
  section.hidden = false;
  updateLearningSteps();
  saveSession();
  if (!options.restoring) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sleep(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('演示已取消', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function runDemo(demo) {
  if (!state.consented) {
    state.pendingDemo = demo;
    $('consent-dialog').showModal();
    requestAnimationFrame(() => $('accept-consent').focus());
    return;
  }
  state.pendingDemo = null;
  newConversation({ demo, interest: demo.interest, skipGreeting: true });
  state.demoRunning = true;
  const demoToken = ++state.demoToken;
  const controller = new AbortController();
  state.controller = controller;
  $('cancel-request').hidden = false;
  appendMessage('assistant', `这是“${demo.title}”的演示对话。用户台词是预设回放，我的每次回应和最后手册都调用真实模型生成。`, { demo: true });
  try {
    for (const turn of demo.turns) {
      await sleep(700, controller.signal);
      if (demoToken !== state.demoToken) return;
      const succeeded = await sendChatMessage(turn, { demo: true, controller });
      if (demoToken !== state.demoToken) return;
      if (!succeeded) {
        state.demoRunning = false;
        setStatus('演示已停止：模型没有成功回应。连接恢复后可重新选择人物演示。', true);
        return;
      }
    }
    if (state.userTurns >= 3 && state.demoRunning && demoToken === state.demoToken) await generateGuide();
  } catch (error) {
    if (error.name !== 'AbortError') setStatus(`演示中断：${error.message}`, true);
  } finally {
    if (demoToken === state.demoToken) {
      state.demoRunning = false;
      $('cancel-request').hidden = !state.busy && !state.generating;
    }
  }
}

function setupCompanionDialog(isFirst) {
  $('companion-name').value = state.companion.name;
  $('user-title').value = state.companion.userTitle;
  const selected = document.querySelector(`input[name="style"][value="${state.companion.style}"]`);
  if (selected) selected.checked = true;
  // Let visitors try the workbench first; companion settings remain available in the header.
}

function openCompanionDialog() {
  $('companion-name').value = state.companion.name;
  $('user-title').value = state.companion.userTitle;
  const selected = document.querySelector(`input[name="style"][value="${state.companion.style}"]`);
  if (selected) selected.checked = true;
  $('name-error').textContent = '';
  $('title-error').textContent = '';
  refreshVoiceChoices(state.companion.voice_id);
  $('companion-dialog').showModal();
  requestAnimationFrame(() => $('companion-name').focus());
}

function renderCompanionChoices() {
  const names = $('name-suggestions');
  NAME_SUGGESTIONS.forEach(name => {
    const button = el('button', 'name-suggestion', name);
    button.type = 'button';
    button.addEventListener('click', () => {
      $('companion-name').value = name;
      $('name-error').textContent = '';
      $('companion-name').focus();
    });
    names.append(button);
  });
  const styles = $('style-options');
  Object.entries(STYLES).forEach(([value, item]) => {
    const label = el('label', 'style-option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'style';
    input.value = value;
    input.checked = value === DEFAULT_COMPANION.style;
    const panel = el('span');
    panel.append(el('strong', '', item.label), el('small', '', item.detail));
    label.append(input, panel);
    styles.append(label);
  });
}

function saveCompanion(event) {
  event.preventDefault();
  const name = $('companion-name').value.trim();
  const userTitle = $('user-title').value.trim();
  const style = document.querySelector('input[name="style"]:checked')?.value || 'gentle';
  const nameOk = validName(name, 6);
  const titleOk = validOptionalName(userTitle, 8);
  $('name-error').textContent = nameOk ? '' : '请输入 1–6 个中文、字母或数字，不含空格和符号。';
  $('title-error').textContent = titleOk ? '' : '称呼最多 8 个中文、字母或数字，不含空格和符号。';
  if (!nameOk || !titleOk) {
    (nameOk ? $('user-title') : $('companion-name')).focus();
    return;
  }
  state.companion = normalizeCompanion({
    ...state.companion,
    name,
    userTitle,
    call_me: userTitle,
    voice_id: $('companion-voice').value,
    style
  });
  writeCompanion(state.companion);
  updateCompanionUi();
  stopSpeech();
  $('companion-dialog').close();
  setStatus(`设置已更新，已有对话保留，${name}的名字立即生效。`);
}

function trapDialogFocus(dialog, event) {
  if (event.key !== 'Tab' || !dialog.open) return;
  const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

let avatarController = null;

function setupAvatar() {
  if (!window.BuwanAvatar?.createController) return;
  avatarController = window.BuwanAvatar.createController({
    onState({ status, detail, progress }) {
      const active = status === 'connecting' || status === 'ready' || status === 'offline';
      $('companion-stage').dataset.avatarState = status;
      $('avatar-connect').textContent = status === 'connecting' ? '正在连接' : status === 'ready' || status === 'offline' ? '数字人已连接' : '连接数字人';
      $('avatar-status').textContent = `${detail}${Number.isFinite(progress) ? ` ${Math.round(progress)}%` : ''}`;
      $('avatar-stage').hidden = status !== 'ready' && status !== 'offline';
      document.querySelector('.portrait-frame')?.setAttribute('aria-label', status === 'ready' ? '学伴对话状态' : '数字人尚未连接');
      $('avatar-connect').disabled = active;
      $('avatar-disconnect').disabled = !active;
      $('avatar-stop').disabled = status !== 'ready';
      $('avatar-offline').disabled = status !== 'ready' && status !== 'offline';
      $('avatar-offline').textContent = status === 'offline' ? '切换在线' : '切换离线';
      if (!active) { state.speaking = false; $('tts-toggle').disabled = false; }
    },
    onSpeaking(value) { state.speaking = value; setCompanionPresence(value ? 'responding' : state.busy ? 'thinking' : 'idle'); }
  });
  $('avatar-connect').addEventListener('click', () => { stopSpeech(); void avatarController.connect(); });
  $('avatar-stop').addEventListener('click', stopSpeech);
  $('avatar-offline').addEventListener('click', () => {
    const offline = avatarController.setOffline(avatarController.getState().status !== 'offline');
    if (!offline) setStatus('数字人模式切换失败，请重试。', true);
  });
  $('avatar-disconnect').addEventListener('click', () => { stopSpeech(); avatarController.disconnect(); });
  const disconnect = () => { stopRecognition(); stopSpeech(); avatarController.disconnect(); };
  window.addEventListener('pagehide', disconnect);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') disconnect(); });
}

function browserVoices() {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const seen = new Set();
    return voices.filter(voice => /^zh(?:[-_]|$)/i.test(voice.lang) && !seen.has(voiceKey(voice)) && seen.add(voiceKey(voice)));
  } catch { return []; }
}

function voiceKey(voice) { return voice.voiceURI || `${voice.lang}:${voice.name}`; }

function refreshVoiceChoices(preferred = $('companion-dialog').open ? $('companion-voice').value : state.companion.voice_id) {
  const voices = browserVoices();
  const select = $('companion-voice');
  select.replaceChildren();
  const automatic = el('option', '', '自动选择中文音色');
  automatic.value = '';
  select.append(automatic);
  voices.forEach(voice => {
    const option = el('option', '', `${voice.name} · ${voice.lang}${voice.localService ? ' · 本机' : ''}`);
    option.value = voiceKey(voice);
    select.append(option);
  });
  const missing = preferred && !voices.some(voice => voiceKey(voice) === preferred);
  if (missing) {
    const option = el('option', '', '已保存的音色在这台设备不可用');
    option.value = preferred;
    select.append(option);
  }
  select.value = preferred || '';
  select.disabled = !voices.length && !missing;
  $('preview-voice').disabled = state.speaking || !voices.length;
  $('voice-availability').textContent = !('speechSynthesis' in window) ? '当前浏览器不支持语音，请使用文字对话。'
    : missing ? '已保存的音色不可用，请重新选择；不会静默换成其他声音。'
    : voices.length === 0 ? '尚未读取到中文音色。可以稍后重开设置，或在系统语音设置中添加中文声音。'
    : voices.length === 1 ? `当前只有 1 个中文音色（${voices[0].name}）。切换交流风格不会变成另一种声音。`
    : `当前有 ${voices.length} 个中文音色，可逐个试听比较。`;
}

function setupVoices() {
  refreshVoiceChoices(state.companion.voice_id);
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => refreshVoiceChoices());
  $('companion-voice').addEventListener('change', () => {
    stopSpeech();
    refreshVoiceChoices($('companion-voice').value);
  });
  $('stop-preview').addEventListener('click', stopSpeech);
}

function applyVoice(utterance, id) {
  const voices = browserVoices();
  const voice = id ? voices.find(item => voiceKey(item) === id)
    : voices.find(item => /^zh[-_]CN$/i.test(item.lang) && item.default)
      || voices.find(item => /^zh[-_]CN$/i.test(item.lang)) || voices[0];
  if (!voice) {
    const message = id ? '所选音色当前不可用，请在学伴设置中重新选择。' : '当前没有可用的中文音色，请在系统中添加中文声音。';
    $('voice-availability').textContent = message;
    setStatus(message, true);
    return false;
  }
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'zh-CN';
  // Keep the actual voice intact; conversation style must not distort pitch.
  utterance.rate = 1;
  utterance.pitch = 1;
  return true;
}

function stopSpeech() {
  avatarController?.stop();
  state.utterance = null;
  state.speaking = false;
  $('tts-toggle').disabled = false;
  $('preview-voice').disabled = !browserVoices().length;
  $('stop-preview').disabled = true;
  window.speechSynthesis?.cancel?.();
  setCompanionPresence(state.busy ? 'thinking' : 'idle');
}

function previewVoice() {
  if (!('speechSynthesis' in window)) {
    setStatus('当前浏览器不支持语音试听。', true);
    return;
  }
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(`你好，我是${$('companion-name').value.trim() || '学伴'}。想学，什么时候都不晚。今天想试试什么？我们从一小步开始。`);
  if (!applyVoice(utterance, $('companion-voice').value)) return;
  state.utterance = utterance;
  state.speaking = true;
  $('preview-voice').disabled = true;
  $('stop-preview').disabled = false;
  utterance.onstart = () => { if (state.utterance === utterance) setCompanionPresence('responding'); };
  utterance.onend = utterance.onerror = () => {
    if (state.utterance !== utterance) return;
    state.utterance = null;
    state.speaking = false;
    $('preview-voice').disabled = !browserVoices().length;
    $('stop-preview').disabled = true;
    setCompanionPresence('idle');
  };
  speechSynthesis.speak(utterance);
}

function speak(content) {
  if (!state.ttsEnabled) return;
  stopSpeech();
  if (avatarController?.getState().status === 'ready') {
    if (!avatarController.speak(content)) setStatus('数字人播报失败，文字回复仍然保留。', true);
    return;
  }
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(content);
  if (!applyVoice(utterance, state.companion.voice_id)) return;
  state.utterance = utterance;
  state.speaking = true;
  const restore = () => {
    if (state.utterance !== utterance) return;
    state.utterance = null;
    state.speaking = false;
    $('tts-toggle').disabled = false;
  };
  utterance.onstart = () => { if (state.utterance === utterance) setCompanionPresence('responding'); };
  utterance.onend = () => { if (state.utterance === utterance) { restore(); setCompanionPresence('idle'); } };
  utterance.onerror = utterance.onend;
  speechSynthesis.speak(utterance);
}

function stopRecognition(abort = true) {
  const recognition = state.recognition;
  state.recognition = null;
  state.recognitionToken += 1;
  $('voice-input').classList.remove('listening');
  if (recognition) {
    avatarController?.setPresence('idle');
    setCompanionPresence(state.busy ? 'thinking' : 'idle');
    try { recognition[abort ? 'abort' : 'stop'](); } catch { /* 识别可能已由浏览器结束。 */ }
  }
}

function setupRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $('voice-input').addEventListener('click', () => setStatus('当前浏览器不支持语音输入，请使用键盘打字。', true));
    return;
  }
  $('voice-input').addEventListener('click', () => {
    if (state.recognition) {
      stopRecognition(false);
      setStatus('语音输入已停止，确认文字后发送。');
      return;
    }
    if (state.busy || state.generating || state.demoRunning || $('chat-input').disabled) return;
    const recognition = new Recognition();
    const token = ++state.recognitionToken;
    const conversationId = state.conversationId;
    const current = () => state.recognition === recognition && state.recognitionToken === token && state.conversationId === conversationId;
    const base = $('chat-input').value.trim();
    let failed = false;
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    state.recognition = recognition;
    recognition.onstart = () => {
      if (!current()) return;
      avatarController?.setPresence('listening');
      setCompanionPresence('listening');
      $('voice-input').classList.add('listening');
      setStatus('正在听，请说话…');
    };
    recognition.onresult = event => {
      if (!current() || failed) return;
      const spoken = [...event.results].map(result => result[0].transcript).join('');
      $('chat-input').value = `${base}${base && spoken ? ' ' : ''}${spoken}`.slice(0, 500);
      $('input-count').textContent = `${$('chat-input').value.length} / 500`;
      saveDrafts();
    };
    recognition.onerror = event => {
      if (!current()) return;
      failed = true;
      $('voice-input').classList.remove('listening');
      setStatus(`语音输入未完成（${event.error}），请改用键盘打字。`, true);
    };
    recognition.onend = () => {
      if (!current()) return;
      avatarController?.setPresence('idle');
      setCompanionPresence('idle');
      state.recognition = null;
      state.recognitionToken += 1;
      $('voice-input').classList.remove('listening');
      if (!failed) setStatus($('chat-input').value.trim() ? '语音已转成文字，确认后发送。' : '没有识别到内容，请使用键盘打字。');
    };
    try { recognition.start(); } catch {
      stopRecognition();
      setStatus('语音输入未能启动，请稍后重试或使用键盘打字。', true);
    }
  });
}

function modelErrorMessage(error) {
  const code = error?.error?.code || error?.code || '';
  if (String(code).startsWith('auth_')) return '连接被当前站点来源拒绝，请确认使用正式站点地址。';
  if (/Failed to fetch|Network error|NetworkError/i.test(error?.message || '')) return '网络连接未完成。请确认网络，并在正式站点重试；本地预览可能受站点来源限制。';
  if (String(code).startsWith('quota_')) return '今日模型额度暂时不足，请稍后再试。';
  if (String(code).startsWith('model_') || String(code).startsWith('gateway_')) return '模型服务暂时没有回应，请稍后重连。';
  return `模型连接失败：${error?.message || '网络暂时不可用'}。`;
}

async function initModel() {
  const badge = $('model-state');
  badge.disabled = true;
  badge.textContent = '连接中';
  try {
    if (!globalThis.WorkBuddyCloud?.createWorkBuddyCloud) throw new Error('官方 SDK 未加载');
    state.sdk = globalThis.WorkBuddyCloud.createWorkBuddyCloud({ ...publicConfig });
    const response = await state.sdk.llm.models.list();
    const models = Array.isArray(response) ? response : asArray(response?.data || response?.models);
    const available = models.filter(model => model?.disabled !== true && model?.enabled !== false);
    let preferred = '';
    try { preferred = localStorage.getItem(MODEL_KEY) || ''; } catch { /* Model selection remains usable without storage. */ }
    // Prefer the model verified in live integration, but only while the directory enables it.
    state.model = available.find(model => model.id === preferred) || available.find(model => model.id === 'glm-5.3-flash') || available[0] || null;
    const selector = $('model-select');
    selector.replaceChildren();
    available.forEach(model => {
      const option = el('option', '', model.name || model.id);
      option.value = model.id;
      selector.append(option);
    });
    selector.value = state.model?.id || '';
    selector.disabled = !state.model;
    selector.onchange = () => {
      if (state.busy || state.generating || state.demoRunning) { selector.value = state.model?.id || ''; return; }
      state.model = available.find(model => model.id === selector.value) || state.model;
      try { localStorage.setItem(MODEL_KEY, state.model.id); } catch { /* The choice still applies to this page. */ }
      setStatus(`已切换到 ${state.model.name || state.model.id}，已有对话保留。`);
    };
    state.modelStatus = state.model ? 'ready' : 'none';
    badge.textContent = state.model ? '学伴在线' : '暂无模型';
    badge.className = `model-state ${state.model ? 'ready' : 'error'}`;
    badge.disabled = false;
    badge.title = state.model ? '重新检查模型连接' : '点击重新连接学伴';
    setStatus(state.model ? '学伴已在线，可以开始聊了。' : '没有可用模型，你写下的内容仍会留在当前页面。', !state.model);
  } catch (error) {
    state.model = null;
    state.modelStatus = 'error';
    $('model-select').disabled = true;
    badge.textContent = '重新连接';
    badge.className = 'model-state error';
    badge.disabled = false;
    badge.title = '点击重新连接学伴';
    setStatus(`${modelErrorMessage(error)}你输入的内容不会丢失。`, true);
  }
}

function requestSend() {
  const value = $('chat-input').value.trim();
  if (!value) {
    setStatus('先写下一点想法，再发送。');
    $('chat-input').focus();
    return;
  }
  if (!state.consented) {
    state.pendingChatOptions = null;
    state.pendingFirstMessage = value;
    $('consent-dialog').showModal();
    requestAnimationFrame(() => $('accept-consent').focus());
    return;
  }
  void sendChatMessage(value);
}

function setupInterestDesk() {
  const desk = document.querySelector('.desk-experience');
  if (!desk) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let start = null;
  const tilt = (x, y) => {
    if (reduced.matches) return;
    desk.style.setProperty('--desk-rx', `${y}deg`);
    desk.style.setProperty('--desk-ry', `${x}deg`);
  };
  desk.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || event.pointerType === 'touch') return;
    start = { x: event.clientX, y: event.clientY };
    desk.setPointerCapture(event.pointerId);
    desk.classList.add('dragging');
  });
  desk.addEventListener('pointermove', event => {
    if (!start) return;
    tilt(Math.max(-16, Math.min(16, (event.clientX - start.x) / 10)), Math.max(-10, Math.min(10, (start.y - event.clientY) / 16)));
  });
  const release = () => { start = null; desk.classList.remove('dragging'); tilt(0, 0); };
  desk.addEventListener('pointerup', release);
  desk.addEventListener('pointercancel', release);
  desk.addEventListener('keydown', event => {
    if (event.target !== desk) return;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      tilt(event.key === 'ArrowLeft' ? -12 : 12, 0);
    }
    if (event.key === 'Escape') release();
  });
  let audio;
  const setDeskSelection = (title, detail, active = false) => {
    const titleNode = desk.querySelector('#desk-selection-title');
    const detailNode = desk.querySelector('#desk-selection-detail');
    const selection = desk.querySelector('.desk-selection');
    if (titleNode) titleNode.textContent = title;
    if (detailNode) detailNode.textContent = detail;
    selection?.classList.toggle('active', active);
  };
  const selectDeskObject = button => {
    desk.querySelectorAll('[data-desk-interest]').forEach(item => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
  };
  const sound = async button => {
    setDeskSelection('听见第一拍', '这一声只是试探，不需要先准备好', true);
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { desk.querySelector('.desk-hint').textContent = '当前浏览器暂不支持琴键试听'; return; }
    try {
      audio ||= new Audio();
      await audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = Number(button.dataset.note);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(.14, audio.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + 1.1);
      oscillator.start();
      oscillator.stop(audio.currentTime + 1.2);
      button.classList.add('playing');
      setTimeout(() => button.classList.remove('playing'), 200);
    } catch {
      desk.querySelector('.desk-hint').textContent = '声音未能播放，可以先选择一个兴趣';
    }
  };
  desk.querySelectorAll('[data-note]').forEach(button => button.addEventListener('click', () => void sound(button)));
  desk.querySelectorAll('[data-desk-interest]').forEach(button => button.addEventListener('click', () => {
    if (state.busy || state.generating || state.demoRunning) return;
    const interest = button.dataset.deskInterest;
    const details = {
      绘画: ['先留下第一张', '不用画得像，先把眼前的东西画下来'],
      园艺: ['先观察一株植物', '摸一摸土壤，记录它今天的状态']
    }[interest] || [`从${interest}开始`, '先做一件十分钟内能完成的小事'];
    if (selectInterest(interest)) {
      selectDeskObject(button);
      setDeskSelection(details[0], details[1], true);
    }
  }));
  document.querySelectorAll('a[href="#interest-inspiration"]').forEach(link => link.addEventListener('click', () => {
    $('interest-inspiration').open = true;
  }));
  const links = [...document.querySelectorAll('.rail-nav .nav-link'), ...document.querySelectorAll('.studio-tabs .studio-tab')];
  const updateNav = () => links.forEach(link => {
    const active = link.hash === (location.hash || '#app');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  window.addEventListener('hashchange', updateNav);
  updateNav();
}

function setupEvents() {
  setupInterestDesk();
  $('interest-form').addEventListener('submit', event => {
    event.preventDefault();
    selectInterest($('interest-input').value);
  });
  $('interest-input').addEventListener('input', () => {
    $('interest-input').removeAttribute('aria-invalid');
    $('interest-feedback').textContent = state.interests.size ? `当前兴趣仍是「${[...state.interests][0]}」，确认后才会切换。` : '这是兴趣草稿，确认后开始。';
    saveDrafts();
  });
  window.addEventListener('pagehide', () => {
    if (starter.interest) pauseStarter('页面离开时已暂停，回来后点击继续');
    saveSession();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !starter.running) return;
    pauseStarter('页面离开时已暂停，回来后点击继续');
  });
  $('use-default-companion').addEventListener('click', event => {
    event.preventDefault();
    state.companion = { ...DEFAULT_COMPANION };
    writeCompanion(state.companion);
    updateCompanionUi();
    stopSpeech();
    $('companion-dialog').close();
  });
  $('chat-input').addEventListener('input', event => {
    $('input-count').textContent = `${event.target.value.length} / 500`;
    saveDrafts();
  });
  $('chat-input').addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      requestSend();
    }
  });
  $('send-message').addEventListener('click', requestSend);
  $('model-state').addEventListener('click', () => { if (!state.busy && !state.generating) void initModel(); });
  $('generate-guide').addEventListener('click', () => void generateGuide());
  $('cancel-request').addEventListener('click', () => abortActive('已取消当前操作，已有内容仍然保留。'));
  $('clear-chat').addEventListener('click', () => newConversation());
  $('exit-demo').addEventListener('click', () => newConversation());
  $('open-companion').addEventListener('click', openCompanionDialog);
  $('close-dialog').addEventListener('click', () => {
    stopSpeech();
    $('companion-dialog').close();
  });
  $('companion-dialog').addEventListener('cancel', stopSpeech);
  $('companion-dialog').addEventListener('close', () => {
    if ($('preview-voice').disabled) stopSpeech();
  });
  $('companion-form').addEventListener('submit', saveCompanion);
  $('preview-voice').addEventListener('click', previewVoice);
  $('tts-toggle').addEventListener('click', () => {
    if (!('speechSynthesis' in window) && avatarController?.getState().status !== 'ready') {
      setStatus('当前浏览器不支持语音播报。', true);
      return;
    }
    state.ttsEnabled = !state.ttsEnabled;
    $('tts-toggle').setAttribute('aria-pressed', String(state.ttsEnabled));
    $('tts-toggle').title = state.ttsEnabled ? '关闭语音播报' : '开启语音播报';
    $('tts-toggle').querySelector('.sr-only').textContent = $('tts-toggle').title;
    if (!state.ttsEnabled) stopSpeech();
    setStatus(state.ttsEnabled ? '语音播报已开启，只会播报之后的新回应。' : '语音播报已关闭。');
  });
  $('accept-consent').addEventListener('click', () => {
    state.consented = true;
    $('consent-dialog').close();
    if (state.pendingDemo) {
      const demo = state.pendingDemo;
      state.pendingDemo = null;
      void runDemo(demo);
      return;
    }
    const pending = state.pendingFirstMessage;
    const options = state.pendingChatOptions || {};
    state.pendingFirstMessage = '';
    state.pendingChatOptions = null;
    void sendChatMessage(pending, options);
  });
  $('decline-consent').addEventListener('click', () => {
    state.pendingChatOptions = null;
    state.pendingFirstMessage = '';
    state.pendingDemo = null;
    $('consent-dialog').close();
    $('chat-input').focus();
  });
  [$('companion-dialog'), $('consent-dialog')].forEach(dialog => {
    dialog.addEventListener('keydown', event => trapDialogFocus(dialog, event));
  });
  setupRecognition();
  setupStarter();
}

function init() {
  renderSeeds();
  renderDemos();
  renderCompanionChoices();
  const stored = readCompanion();
  state.companion = stored.value;
  updateCompanionUi();
  setCompanionPresence('idle');
  setupEvents();
  if (!restoreSession()) {
    $('conversation-id-short').textContent = state.conversationId.slice(0, 8);
    initialGreeting();
    setStatus('可以从一个兴趣开始，内容会保存在本浏览器。');
  }
  setupCompanionDialog(stored.isFirst);
  setupVoices();
  setupAvatar();
  void initModel();
}

init();
