const $ = id => document.getElementById(id);

const publicConfig = {
  endpoint: 'https://buwan-learning.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_noAB446VY5wEZ2ouf0k5fB_UdkjHeFKF8X6BaVGd9M8phVgLxdMOKco'
};

const STORAGE_KEY = 'buwan_companion';
const DEFAULT_COMPANION = { v: 1, name: '学伴', userTitle: '', call_me: '', avatar_id: 'paper', voice_id: '', style: 'gentle' };
const INTERESTS = ['钢琴', '游泳', '绘画', '摄影', '书法', '编程', '烘焙', '英语', '舞蹈', '园艺'];
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
  pendingDemo: null,
  ttsEnabled: false,
  speaking: false,
  recognition: null,
  guide: null,
  searchMeta: null
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
  $('chat-status').textContent = message;
  $('chat-status').classList.toggle('error', isError);
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
    button.append(icon, el('span', '', interest));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.interests.has(interest)));
    button.addEventListener('click', () => {
      if (state.busy || state.generating || state.demoRunning) {
        setStatus('当前回应还没结束，稍后再选择兴趣。');
        return;
      }
      state.interests = new Set([interest]);
      renderSeeds();
      openStarter(interest);
    });
    root.append(button);
  });
}

const starter = { interest: '', worry: '怕坚持不下来', minutes: 10, remaining: 600, deadline: 0, timer: null, running: false, started: false };
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
      button.disabled = starter.started;
      button.addEventListener('click', () => {
        starter[key] = value;
        if (key === 'minutes') starter.remaining = value * 60;
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
  $('starter-task-note').textContent = `${notes[starter.worry]} 以上为可修改的预设建议。`;
}

function updateStarterClock() {
  const seconds = Math.max(0, Math.ceil(starter.remaining));
  $('starter-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const progress = Math.round((1 - seconds / (starter.minutes * 60)) * 100);
  $('starter-clock-ring').dataset.progress = String(progress);
  $('starter-clock-ring').setAttribute('aria-label', `已进行 ${progress}%`);
  $('starter-clock-ring').style.setProperty('--progress', `${progress}%`);
}

function openStarter(interest) {
  clearInterval(starter.timer);
  Object.assign(starter, { interest, remaining: starter.minutes * 60, running: false, started: false });
  $('starter-workbench').hidden = false;
  $('starter-title').textContent = `想学${interest}，先从这一小步试试`;
  $('starter-task').value = STARTER_TASKS[interest];
  $('starter-task').disabled = false;
  $('starter-start').disabled = false;
  $('starter-start').textContent = '开始这一小步';
  $('starter-complete').disabled = true;
  $('starter-achievement').hidden = true;
  $('starter-session-state').textContent = '由你决定何时开始';
  renderStarterOptions();
  updateStarterNote();
  updateStarterClock();
  $('starter-workbench').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  Object.assign(starter, { remaining: starter.minutes * 60, running: false, started: false, deadline: 0 });
  setFocusMode(false);
}

function setupStarter() {
  $('starter-exit-focus').addEventListener('click', () => setFocusMode(false));
  $('starter-start').addEventListener('click', () => {
    if (!$('starter-task').value.trim()) { $('starter-task').focus(); return; }
    if (starter.running) {
      starter.remaining = Math.max(0, (starter.deadline - Date.now()) / 1000);
      clearInterval(starter.timer);
      starter.running = false;
      $('starter-start').textContent = '继续这一小步';
      $('starter-session-state').textContent = '已暂停，按你的节奏来';
    } else {
      setFocusMode(true);
      starter.started = true;
      starter.running = true;
      starter.deadline = Date.now() + starter.remaining * 1000;
      $('starter-task').disabled = true;
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
          $('starter-start').disabled = true;
          $('starter-session-state').textContent = '时间到了，做到了多少都可以';
        }
      }, 250);
    }
    updateStarterClock();
  });
  $('starter-complete').addEventListener('click', () => {
    clearInterval(starter.timer);
    starter.running = false;
    $('starter-start').disabled = true;
    $('starter-complete').disabled = true;
    $('starter-achievement').textContent = `第一步，已完成。你今天为${starter.interest}留下了一个真实的开始。`;
    $('starter-achievement').hidden = false;
    setFocusMode(false);
    $('starter-session-state').textContent = '今天的开始，已由你亲手完成';
  });
  $('starter-chat').addEventListener('click', () => {
    $('chat-input').value = `我想学${starter.interest}，但${starter.worry}。今天能留出${starter.minutes}分钟。我的第一步想做：${$('starter-task').value.trim()}`.slice(0, 500);
    $('input-count').textContent = `${$('chat-input').value.length} / 500`;
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
  state.messages.push({ role, content });
  if (role === 'user') state.userTurns += 1;
  const rendered = appendMessage(role, content, options);
  updateUnlock();
  return rendered;
}

function updateLearningSteps() {
  const activeIndex = state.guide ? 3 : state.userTurns >= 2 ? 2 : state.userTurns >= 1 ? 1 : 0;
  [...$('learning-steps').children].forEach((item, index) => {
    item.classList.toggle('active', index === activeIndex);
    item.classList.toggle('completed', index < activeIndex);
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
  $('chat-input').disabled = state.generating;
  $('cancel-request').hidden = !busy && !state.generating && !state.demoRunning;
  if (label) setStatus(label);
  updateUnlock();
}

function abortActive(message = '') {
  state.serial += 1;
  state.demoToken += 1;
  state.controller?.abort();
  state.controller = null;
  state.busy = false;
  state.generating = false;
  state.demoRunning = false;
  window.speechSynthesis?.cancel?.();
  $('cancel-request').hidden = true;
  $('chat-input').disabled = false;
  $('send-message').disabled = false;
  updateUnlock();
  if (message) setStatus(message);
}

function newConversation(options = {}) {
  abortActive();
  resetStarter();
  $('starter-workbench').hidden = true;
  state.messages = [];
  state.userTurns = 0;
  state.conversationId = makeUuid();
  state.guide = null;
  state.searchMeta = null;
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
  setStatus(state.demo ? '正在回放演示，模型回应和手册均为实时生成。' : '新会话已开始。');
}

function boundedMessages() {
  return state.messages.slice(-20).map(item => ({ role: item.role, content: item.content }));
}

function companionSystem(extra = '') {
  const title = state.companion.userTitle ? `称呼用户为“${state.companion.userTitle}”` : '自然称呼用户，不擅自取名';
  return `你是中文学习伙伴“${state.companion.name}”。你的风格是：${STYLES[state.companion.style].prompt}。${title}。你帮助成年人把想学的事变成可开始的小步。不得编造用户经历、案例、研究、课程或来源；不确定就明确说不确定。每次只问一个问题，回复不超过60个汉字，避免空泛鼓励。游泳相关绝不建议独自下水，也不建议任何憋气练习。${extra}`;
}

async function streamCompletion({ system, messages, signal, json = false, timeout = 60000, onDelta }) {
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
  try {
    const stream = state.sdk.llm.chat.completions.create(request);
    try {
      for await (const chunk of stream) {
        if (local.signal.aborted) throw new DOMException(timedOut ? '请求超过 60 秒，已超时' : '请求已取消', 'AbortError');
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          output += delta;
          onDelta?.(output, delta);
        }
      }
    } catch (error) {
      if (timedOut) throw new Error('请求超过 60 秒，已超时');
      throw error;
    }
    return output.trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function normalizeChatReply(value) {
  let clean = text(value).replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
  const firstQuestion = clean.search(/[？?]/);
  if (firstQuestion >= 0) clean = clean.slice(0, firstQuestion + 1);
  return clean.slice(0, 60) || '你希望从哪一个最小的动作开始？';
}

async function sendChatMessage(value, options = {}) {
  const content = text(value).trim();
  if (!content || state.busy || state.generating) return false;
  if (!state.model) {
    setStatus('模型暂不可用，内容已保留，请稍后再试。', true);
    return false;
  }
  const serial = ++state.serial;
  const controller = options.controller || new AbortController();
  state.controller = controller;
  addConversationMessage('user', content, { demo: options.demo });
  $('chat-input').value = '';
  $('input-count').textContent = '0 / 500';
  setBusy(true, `${state.companion.name}正在想一个问题…`);
  const placeholder = appendMessage('assistant', '正在回应', { loading: true, demo: options.demo });
  let streamed = '';
  try {
    const history = boundedMessages();
    const raw = await streamCompletion({
      system: companionSystem(),
      messages: history,
      signal: controller.signal,
      timeout: 60000,
      onDelta: output => {
        streamed = output;
        placeholder.copy.textContent = normalizeChatReply(output);
      }
    });
    if (serial !== state.serial) return;
    const reply = normalizeChatReply(raw);
    placeholder.copy.textContent = reply;
    placeholder.message.classList.remove('loading');
    state.messages.push({ role: 'assistant', content: reply });
    setStatus(state.userTurns >= 3 ? '已经聊了三轮，可以展开开始手册。' : `再聊 ${3 - state.userTurns} 轮，就能展开开始手册。`);
    speak(reply);
    return true;
  } catch (error) {
    if (serial !== state.serial) return false;
    placeholder.message.classList.remove('loading');
    if (error.name === 'AbortError') {
      if (streamed) {
        const partial = normalizeChatReply(streamed);
        placeholder.copy.textContent = `${partial}（回应已中止）`;
        state.messages.push({ role: 'assistant', content: partial });
      } else {
        placeholder.message.remove();
      }
      setStatus('已取消回应，你发送的内容仍然保留。');
    } else {
      if (streamed) {
        const partial = normalizeChatReply(streamed);
        placeholder.copy.textContent = `${partial}（网络中断）`;
        state.messages.push({ role: 'assistant', content: partial });
      } else {
        placeholder.copy.textContent = '网络暂时没有回应。你刚才说的话已经保留，可以重试。';
      }
      setStatus(`网络错误：${error.message}。对话内容已保留。`, true);
    }
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
    try {
      const raw = await streamCompletion({
        system,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        signal,
        json: true,
        timeout: 60000
      });
      return parseModelJson(raw);
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError' || attempt >= retries) throw error;
    }
  }
  throw lastError;
}

async function postJson(url, body, signal) {
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
    if (!response.ok) throw new Error(text(data.error) || `请求失败（${response.status}）`);
    return data;
  } catch (error) {
    if (timedOut) throw new Error('请求超过 60 秒，已超时');
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

function enforceSwimmingSafety(result, interest) {
  if (!text(interest).includes('游泳')) return result;
  const replaceUnsafe = value => {
    if (typeof value === 'string') {
      return value
        .replace(/独自下水/g, '在正规泳馆由教练或救生员陪同下水')
        .replace(/一个人下水/g, '在正规泳馆由教练或救生员陪同下水')
        .replace(/憋气训练/g, '水上安全与正常呼吸练习')
        .replace(/练习憋气/g, '练习放松与正常呼吸');
    }
    if (Array.isArray(value)) return value.map(replaceUnsafe);
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(key => { value[key] = replaceUnsafe(value[key]); });
    }
    return value;
  };
  return replaceUnsafe(result);
}

async function generateGuide() {
  if (state.userTurns < 3 || state.generating || state.busy) return;
  if (!state.model) {
    setStatus('模型暂不可用，当前对话已保留。', true);
    return;
  }
  const serial = ++state.serial;
  const controller = new AbortController();
  state.controller = controller;
  state.generating = true;
  setBusy(true, '正在读懂你的兴趣与顾虑…');
  updateUnlock();
  const conversation = boundedMessages();
  let extracted;
  let searchData = { results: [], configured: false, note: '未检索到可用搜索来源' };
  let generated;
  try {
    extracted = await modelJson(extractionSystem(), { selected_interests: [...state.interests], conversation }, controller.signal, 1);
    if (serial !== state.serial) return;
    const queries = asArray(extracted.search_queries).map(text).filter(Boolean).slice(0, 3);
    while (queries.length < 3) queries.push(`${text(extracted.interest) || [...state.interests][0] || '成人学习'} 入门`);
    setStatus('正在寻找可参考的公开搜索来源…');
    try {
      const searched = await postJson('/api/search', { queries }, controller.signal);
      searchData = {
        results: asArray(searched.results).slice(0, 12),
        configured: searched.configured === true,
        note: text(searched.note)
      };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      searchData = { results: [], configured: false, note: `搜索失败：${error.message}` };
    }
    if (serial !== state.serial) return;
    setStatus('正在把对话和搜索结果整理成四周手册…');
    generated = await modelJson(guideSystem(), {
      companion: state.companion,
      selected_interests: [...state.interests],
      extracted,
      conversation,
      search_results: searchData.results.map(item => ({ title: text(item.title), url: safeUrl(item.url), snippet: text(item.snippet) }))
    }, controller.signal, 1);
    generated = enforceSwimmingSafety(generated, extracted.interest);
    if (serial !== state.serial) return;
    setStatus('正在检查手册结构与来源链接…');
    let finalResult = generated;
    try {
      const validated = await postJson('/api/validate-result', { result: generated, results: searchData.results }, controller.signal);
      finalResult = validated.result || validated;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      searchData.note = [searchData.note, `结果校验服务失败：${error.message}`].filter(Boolean).join('；');
    }
    if (serial !== state.serial) return;
    state.guide = enforceSwimmingSafety(finalResult, extracted.interest);
    state.searchMeta = searchData;
    renderGuide(state.guide, searchData);
    setStatus('开始手册已展开。它不是期限，只是一条可以调整的路。');
  } catch (error) {
    if (serial !== state.serial) return;
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

function renderGuide(result, searchData) {
  const section = $('guide-section');
  const root = $('guide-content');
  root.replaceChildren();
  $('guide-heading').textContent = text(result.title) || '你的四周开始手册';
  $('guide-story').textContent = text(result.story) || '从你说过的话出发，把想学变成今天能开始的一小步。';

  const grid = el('div', 'guide-grid');
  appendTextCard(grid, 'goal', '你真正想抵达的地方', result.goal);
  appendTextCard(grid, 'worry', '最牵绊你的事', result.worry);
  appendTextCard(grid, 'answer', `${state.companion.name}的回应`, result.answer);
  appendListCard(grid, 'examples', '可以借鉴的做法', result.examples);

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
      link.append(el('strong', '', text(item.name || item.title) || '查看来源'), el('span', '', text(item.desc || item.reason)));
      resourceList.append(link);
    });
    resourceCard.append(resourceList, el('p', 'source-note', '以上为搜索来源，不等于真实性核验；请自行判断内容与安全性。'));
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
    details.append(summary, el('div', 'week-content', task));
    manual.append(details);
  }
  root.append(manual);

  const first = el('div', 'first-lesson');
  first.append(el('span', '', '今天的第一课'), el('p', '', text(result.first_lesson) || '用十分钟，把第一步放进今天。'));
  root.append(first);
  if (result.share_text) root.append(el('div', 'share-copy', text(result.share_text)));
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('演示已取消', 'AbortError'));
    }, { once: true });
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
    style
  });
  writeCompanion(state.companion);
  updateCompanionUi();
  $('companion-dialog').close();
  setStatus(`设置已更新，已有对话保留，${name}的名字立即生效。`);
}

function trapDialogFocus(dialog, event) {
  if (event.key !== 'Tab' || !dialog.open) return;
  const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
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

function previewVoice() {
  if (!('speechSynthesis' in window)) {
    setStatus('当前浏览器不支持语音试听。', true);
    return;
  }
  const style = document.querySelector('input[name="style"]:checked')?.value || 'gentle';
  const settings = STYLES[style];
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`你好，我是${$('companion-name').value.trim() || '阿晚'}。想学的事，什么时候开始都不晚。`);
  utterance.lang = 'zh-CN';
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  $('preview-voice').disabled = true;
  utterance.onend = utterance.onerror = () => { $('preview-voice').disabled = false; };
  speechSynthesis.speak(utterance);
}

function speak(content) {
  if (!state.ttsEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const settings = STYLES[state.companion.style];
  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = 'zh-CN';
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  state.speaking = true;
  $('tts-toggle').disabled = true;
  const restore = () => {
    state.speaking = false;
    $('tts-toggle').disabled = false;
  };
  utterance.onend = restore;
  utterance.onerror = restore;
  speechSynthesis.speak(utterance);
}

function setupRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $('voice-input').addEventListener('click', () => setStatus('当前浏览器不支持语音输入，请使用键盘打字。', true));
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;
  state.recognition = recognition;
  let base = '';
  recognition.onstart = () => {
    base = $('chat-input').value.trim();
    $('voice-input').classList.add('listening');
    setStatus('正在听，请说话…');
  };
  recognition.onresult = event => {
    const spoken = [...event.results].map(result => result[0].transcript).join('');
    $('chat-input').value = `${base}${base && spoken ? ' ' : ''}${spoken}`.slice(0, 500);
    $('input-count').textContent = `${$('chat-input').value.length} / 500`;
  };
  recognition.onerror = event => setStatus(`语音输入未完成（${event.error}），请改用键盘打字。`, true);
  recognition.onend = () => {
    $('voice-input').classList.remove('listening');
    setStatus($('chat-input').value.trim() ? '语音已转成文字，确认后发送。' : '没有识别到内容，请使用键盘打字。');
  };
  $('voice-input').addEventListener('click', () => {
    try { recognition.start(); } catch { setStatus('语音输入正在运行，请说话或稍后再试。'); }
  });
}

function modelErrorMessage(error) {
  const code = error?.error?.code || error?.code || '';
  if (String(code).startsWith('auth_')) return '连接被当前站点来源拒绝，请确认使用正式站点地址。';
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
    state.model = models.find(model => model?.disabled !== true && model?.enabled !== false) || null;
    state.modelStatus = state.model ? 'ready' : 'none';
    badge.textContent = state.model ? '学伴在线' : '暂无模型';
    badge.className = `model-state ${state.model ? 'ready' : 'error'}`;
    badge.disabled = false;
    badge.title = state.model ? '重新检查模型连接' : '点击重新连接学伴';
    setStatus(state.model ? '学伴已在线，可以开始聊了。' : '没有可用模型，你写下的内容仍会留在当前页面。', !state.model);
  } catch (error) {
    state.model = null;
    state.modelStatus = 'error';
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
    state.pendingFirstMessage = value;
    $('consent-dialog').showModal();
    requestAnimationFrame(() => $('accept-consent').focus());
    return;
  }
  void sendChatMessage(value);
}

function setupEvents() {
  $('use-default-companion').addEventListener('click', event => {
    event.preventDefault();
    state.companion = { ...DEFAULT_COMPANION };
    writeCompanion(state.companion);
    updateCompanionUi();
    $('companion-dialog').close();
  });
  $('chat-input').addEventListener('input', event => { $('input-count').textContent = `${event.target.value.length} / 500`; });
  $('chat-input').addEventListener('keydown', event => {
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
  $('close-dialog').addEventListener('click', () => $('companion-dialog').close());
  $('companion-form').addEventListener('submit', saveCompanion);
  $('preview-voice').addEventListener('click', previewVoice);
  $('tts-toggle').addEventListener('click', () => {
    state.ttsEnabled = !state.ttsEnabled;
    $('tts-toggle').setAttribute('aria-pressed', String(state.ttsEnabled));
    $('tts-toggle').title = state.ttsEnabled ? '关闭语音播报' : '开启语音播报';
    $('tts-toggle').querySelector('.sr-only').textContent = $('tts-toggle').title;
    if (!state.ttsEnabled) speechSynthesis?.cancel?.();
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
    state.pendingFirstMessage = '';
    void sendChatMessage(pending);
  });
  $('decline-consent').addEventListener('click', () => {
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
  setupEvents();
  newConversation();
  setupCompanionDialog(stored.isFirst);
  void initModel();
}

init();
