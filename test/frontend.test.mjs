import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 测试真实前端函数的控制流；SDK、DOM、时钟和语音 API 使用替身，不验证真实模型或麦克风设备。
const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
assert.match(appSource, /\binit\(\);\s*$/);
const script = new vm.Script(appSource.replace(/\binit\(\);\s*$/, ''), { filename: 'public/app.js' });

class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, details = {}) {
    const event = { target: this, preventDefault() {}, ...details };
    return Promise.all((this.listeners.get(type) || []).map(listener => listener(event)));
  }
}

class Element extends Events {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.dataset = {};
    this.attributes = new Map();
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.style = { setProperty() {} };
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => {
        this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ');
      },
      remove: (...names) => {
        this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ');
      },
      toggle: (name, force = !this.classList.contains(name)) => {
        if (force) this.classList.add(name);
        else this.classList.remove(name);
        return force;
      }
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get lastElementChild() { return this.children.at(-1) || null; }
  querySelectorAll(selector) {
    // 只实现本测试实际使用的单个类选择器；不支持的选择器直接报错。
    assert.match(selector, /^\.[\w-]+$/);
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (child.classList.contains(selector.slice(1))) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  scrollIntoView() {}
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function frontend({ storage = new Map() } = {}) {
  const elements = new Map([...htmlSource.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, new Element()]));
  const node = id => {
    assert.ok(elements.has(id), `页面应包含 #${id}`);
    return elements.get(id);
  };
  node('learning-steps').append(...Array.from({ length: 4 }, () => new Element('li')));
  const ttsLabel = new Element('span');
  ttsLabel.className = 'sr-only';
  node('tts-toggle').append(ttsLabel);
  const document = Object.assign(new Events(), {
    body: new Element('body'),
    visibilityState: 'visible',
    getElementById: node,
    createElement: tag => new Element(tag),
    createElementNS: (_namespace, tag) => new Element(tag),
    querySelector(selector) {
      assert.ok(['.sound-orb', '.desk-experience', '.first-lesson-action .primary-button', 'input[name="style"]:checked', '.portrait-frame'].includes(selector), selector);
      return null;
    },
    querySelectorAll(selector) {
      assert.ok(['[data-desk-interest]'].includes(selector), selector);
      return [];
    }
  });
  const window = new Events();
  const confirmations = [];
  let confirmResult = true;
  window.confirm = message => { confirmations.push(message); return typeof confirmResult === 'function' ? confirmResult(message) : confirmResult; };
  const timers = new Map();
  const requests = [];
  let now = new Date(2026, 9, 23, 12).getTime();
  let nextTimer = 1;
  let fetchImpl = () => { throw new Error('测试禁止真实网络请求'); };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const addTimer = (callback, delay, interval) => {
    const id = nextTimer++;
    timers.set(id, { callback, delay, interval, due: now + delay });
    return id;
  };
  const context = vm.createContext({
    document, window, localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    AbortController, DOMException, URL, Date: ClockDate,
    setTimeout: (callback, delay) => addTimer(callback, delay, false),
    clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => addTimer(callback, delay, true),
    clearInterval: id => timers.delete(id),
    requestAnimationFrame: callback => callback(),
    fetch: (...args) => fetchImpl(...args)
  });
  script.runInContext(context);
  const api = vm.runInContext(`({ state, starter, streamCompletion, modelJson, saveSession,
    restoreSession, newConversation, readStarterProgress, writeStarterProgress, openStarter,
    setupEvents, sendChatMessage, abortActive, generateGuide, postJson, todayKey, modelErrorMessage, initModel,
    renderGuide, readLearningRecords, renderLearningHistory, selectInterest, speak, previewVoice, setupAvatar })`, context);
  return {
    ...api, node, document, window, storage, timers, requests, confirmations,
    setConfirm: value => { confirmResult = value; },
    elapse: ms => { now += ms; },
    evaluate: code => vm.runInContext(code, context),
    setFetch: implementation => { fetchImpl = implementation; },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (!timers.has(id) || timer.due > now) continue;
        if (timer.interval) timer.due = now + timer.delay;
        else timers.delete(id);
        timer.callback();
      }
    },
    installVoice() {
      const recognitions = [];
      const utterances = [];
      const synthesis = {
        cancels: 0,
        cancel() { this.cancels += 1; },
        speak(utterance) { utterances.push(utterance); }
      };
      window.SpeechRecognition = class {
        constructor() { this.stops = 0; this.aborts = 0; recognitions.push(this); }
        start() { this.onstart(); }
        stop() { this.stops += 1; }
        abort() { this.aborts += 1; }
      };
      context.speechSynthesis = window.speechSynthesis = synthesis;
      context.SpeechSynthesisUtterance = class { constructor(content) { this.text = content; } };
      return { recognitions, utterances, synthesis };
    },
    installSdk(create) {
      api.state.model = { id: '测试模型替身' };
      api.state.sdk = { llm: { chat: { completions: { create(request) {
        requests.push(request);
        return create(request, requests.length);
      } } } } };
    }
  };
}

const chunk = (content, finish_reason) => ({ choices: [{ delta: { content }, finish_reason }] });
async function* stream(chunks) { yield* chunks; }
const completion = (app, options = {}) => app.streamCompletion({ system: '测试指令', messages: [], ...options });
const snapshot = app => JSON.parse(app.storage.get('buwan_session'));
const progress = (app, interest) => plain(app.readLearningRecords().findLast(item => item.interest === interest));
const plain = value => JSON.parse(JSON.stringify(value));

function savedTask(app, overrides = {}) {
  return { day: app.todayKey(), task: '保留我的第一步', worry: '怕坚持不下来', minutes: 10,
    remaining: 123.5, started: true, completed: false, fromGuide: true, ...overrides };
}

function saveTask(app, interest, overrides) {
  const data = Object.create(null);
  data[interest] = savedTask(app, overrides);
  app.storage.set('buwan_starter_progress', JSON.stringify(data));
}

test('VM 装载不执行 init，不连接 SDK、不注册事件或后台计时', () => {
  const app = frontend();
  assert.equal(app.state.sdk, null);
  assert.equal(app.requests.length, 0);
  assert.equal(app.timers.size, 0);
  assert.equal(app.window.listeners.size, 0);
  assert.equal(app.storage.size, 0);
});

test('streamCompletion 累积文本并清理超时与内部 signal', async () => {
  const app = frontend();
  app.installSdk(() => stream([{}, chunk('  第一'), chunk('步  ', 'stop')]));
  const deltas = [];
  assert.equal(await completion(app, { json: true, onDelta: (...args) => deltas.push(args) }), '第一步');
  assert.deepEqual(deltas, [['  第一', '  第一'], ['  第一步  ', '步  ']]);
  const request = app.requests[0];
  assert.equal(request.model, app.state.model.id);
  assert.deepEqual(plain(request.messages), [{ role: 'system', content: '测试指令' }]);
  assert.deepEqual(plain(request.response_format), { type: 'json_object' });
  assert.equal(request.conversationId, app.state.conversationId);
  assert.equal(request.signal.aborted, true);
  assert.equal(app.timers.size, 0);
});

for (const [name, chunks, message] of [
  ['无 chunk', [], /空回应/],
  ['空内容', [chunk('', 'stop')], /空回应/],
  ['纯空白', [chunk(' \n\t', 'stop')], /空回应/],
  ['length 截断', [chunk('部分文本'), chunk(undefined, 'length')], /长度限制/],
  ['content_filter', [chunk('部分文本'), chunk(undefined, 'content_filter')], /内容过滤/],
  ['delta.refusal', [{ choices: [{ delta: { refusal: '拒绝' } }] }], /拒绝/],
  ['message.refusal', [{ choices: [{ message: { refusal: '拒绝' } }] }], /拒绝/],
  ['refusal 终止原因', [chunk('部分文本'), chunk(undefined, 'refusal')], /拒绝/],
  ['未知终止原因', [chunk('部分文本', 'tool_calls')], /未正常完成.*tool_calls/],
  ['流内错误', [chunk('部分文本'), { error: { message: '模拟流故障' } }], /模拟流故障/]
]) {
  test(`streamCompletion 拒绝${name}，不把部分内容当成功`, async () => {
    const app = frontend();
    app.installSdk(() => stream(chunks));
    await assert.rejects(completion(app), message);
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].signal.aborted, true);
    assert.equal(app.timers.size, 0);
  });
}

for (const method of ['streamCompletion', 'modelJson', 'sendChatMessage', 'postJson']) {
  test(`${method} 在调用前已 abort 时不发请求`, async () => {
    const app = frontend();
    app.installSdk(() => { assert.fail('取消后不应请求 SDK'); });
    let fetches = 0;
    app.setFetch(() => { fetches += 1; assert.fail('取消后不应请求网络'); });
    const controller = new AbortController();
    controller.abort();
    if (method === 'sendChatMessage') {
      app.node('chat-input').value = '保留草稿';
      assert.equal(await app.sendChatMessage('保留草稿', { controller }), false);
      assert.equal(app.node('chat-input').value, '保留草稿');
      assert.equal(app.state.messages.length, 0);
      assert.equal(app.storage.size, 0);
    } else {
      const pending = method === 'streamCompletion' ? completion(app, { signal: controller.signal })
        : method === 'modelJson' ? app.modelJson('测试', {}, controller.signal)
          : app.postJson('/api/search', {}, controller.signal);
      await assert.rejects(pending, { name: 'AbortError' });
    }
    assert.equal(app.requests.length, 0);
    assert.equal(fetches, 0);
    assert.equal(app.timers.size, 0);
  });
}

test('streamCompletion 请求期间取消会中止内部 signal 并清理计时', async () => {
  const app = frontend();
  app.installSdk(request => new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new DOMException('模拟取消', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = completion(app, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(app.requests[0].signal.aborted, true);
  assert.equal(app.timers.size, 0);
});

test('streamCompletion 超时返回可读错误并中止 SDK 请求', async () => {
  const app = frontend();
  app.installSdk(request => new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new DOMException('模拟超时取消', 'AbortError')), { once: true });
  }));
  const pending = completion(app, { timeout: 1500 });
  app.advance(1500);
  await assert.rejects(pending, /超过 2 秒.*超时/);
  assert.equal(app.requests[0].signal.aborted, true);
  assert.equal(app.timers.size, 0);
});

for (const [name, createError] of [
  ['quota 顶层错误', () => Object.assign(new Error('模拟额度不足'), { code: 'quota_exceeded' })],
  ['quota 嵌套错误', () => Object.assign(new Error('模拟额度不足'), { error: { code: 'quota_exceeded' } })],
  ['网络错误', () => new TypeError('Failed to fetch')]
]) {
  test(`modelJson 不重试${name}，保留原始错误`, async () => {
    const app = frontend();
    const error = createError();
    app.installSdk(() => { throw error; });
    await assert.rejects(app.modelJson('测试', {}, undefined, 3), actual => actual === error);
    assert.equal(app.requests.length, 1);
    assert.equal(app.timers.size, 0);
  });
}

test('modelJson 对 VM 内 JSON SyntaxError 重试并返回第二次解析结果', async () => {
  const app = frontend();
  app.installSdk((_request, attempt) => stream([chunk(attempt === 1 ? '{错误}' : '{"ok":true}', 'stop')]));
  assert.deepEqual(plain(await app.modelJson('测试', { interest: '绘画' })), { ok: true });
  assert.equal(app.requests.length, 2);
  for (const request of app.requests) {
    assert.deepEqual(plain(request.response_format), { type: 'json_object' });
    assert.equal(request.messages[1].content, '{"interest":"绘画"}');
  }
  assert.equal(app.timers.size, 0);
});

for (const retries of [0, 1, 2]) {
  test(`modelJson SyntaxError 重试上限为 ${retries} 次`, async () => {
    const app = frontend();
    app.installSdk(() => stream([chunk('{错误}', 'stop')]));
    await assert.rejects(app.modelJson('测试', {}, undefined, retries), { name: 'SyntaxError' });
    assert.equal(app.requests.length, retries + 1);
    assert.equal(app.timers.size, 0);
  });
}

test('modelJson 对不含 JSON 对象的普通解析错误不重试', async () => {
  const app = frontend();
  app.installSdk(() => stream([chunk('没有 JSON', 'stop')]));
  await assert.rejects(app.modelJson('测试', {}, undefined, 3), /没有返回有效 JSON/);
  assert.equal(app.requests.length, 1);
});

for (const [count, topicStart] of [[0, 0], [40, 12], [45, 3], [45, 15], [45, 45]]) {
  test(`saveSession 保存 ${count} 条消息时裁剪到 40 条并调整 topicStart=${topicStart}`, () => {
    const app = frontend();
    app.state.sessionActive = true;
    const messages = Array.from({ length: count }, (_, index) => ({ id: String(index), role: 'user', content: `消息${index}`, status: 'success' }));
    app.state.messages = messages;
    app.state.topicStart = topicStart;
    app.state.interests.add('绘画');
    app.node('chat-input').value = '草'.repeat(510);
    app.node('interest-input').value = '趣'.repeat(90);
    app.saveSession();
    const saved = snapshot(app);
    const dropped = Math.max(0, count - 40);
    assert.deepEqual(saved.messages, messages.slice(dropped));
    assert.equal(saved.topicStart, Math.max(0, topicStart - dropped));
    assert.equal(saved.chatDraft.length, 500);
    assert.equal(saved.interestDraft.length, 80);
    assert.deepEqual(saved.interests, ['绘画']);
    assert.equal(app.state.messages, messages);
    assert.equal(app.state.messages.length, count);
    assert.equal(app.state.topicStart, topicStart);
  });
}

test('saveSession 未激活会话时不写存储', () => {
  const app = frontend();
  app.saveSession();
  assert.equal(app.storage.size, 0);
});

test('newConversation 清会话和草稿、取消请求，保留任务和学伴设置', async () => {
  const app = frontend();
  app.setupEvents();
  app.openStarter('绘画');
  app.node('starter-task').value = '我的自定义任务';
  await app.node('starter-start').dispatch('click');
  app.advance(1250);
  app.state.sessionActive = true;
  app.state.messages = [{ role: 'user', content: '旧消息', status: 'success' }];
  Object.assign(app.state, { topicStart: 1, userTurns: 3, guide: { title: '旧手册' }, searchMeta: { results: [] }, guideStatus: 'complete', pendingFirstMessage: '待发', pendingChatOptions: {}, pendingDemo: {}, restored: true });
  app.node('chat-input').value = '旧草稿';
  app.node('interest-input').value = '旧兴趣';
  app.storage.set('buwan_companion', '{"name":"保留学伴"}');
  const controller = new AbortController();
  app.state.controller = controller;
  const oldId = app.state.conversationId;
  app.saveSession();
  app.newConversation();
  assert.equal(app.storage.has('buwan_session'), false);
  assert.equal(app.storage.get('buwan_companion'), '{"name":"保留学伴"}');
  assert.equal(progress(app, '绘画').task, '我的自定义任务');
  assert.equal(progress(app, '绘画').remaining, 598.75);
  assert.equal(progress(app, '绘画').started, true);
  assert.equal(controller.signal.aborted, true);
  assert.notEqual(app.state.conversationId, oldId);
  assert.equal(app.state.messages.length, 1);
  assert.equal(app.state.messages[0].role, 'assistant');
  assert.equal(app.state.messages[0].content.includes('旧消息'), false);
  assert.equal(app.state.topicStart, 0);
  assert.equal(app.state.userTurns, 0);
  assert.equal(app.state.interests.size, 0);
  for (const key of ['guide', 'searchMeta', 'pendingChatOptions', 'pendingDemo', 'controller']) assert.equal(app.state[key], null, key);
  assert.equal(app.state.pendingFirstMessage, '');
  assert.equal(app.state.guideStatus, 'idle');
  assert.equal(app.state.sessionActive, false);
  assert.equal(app.state.restored, false);
  assert.equal(app.node('chat-input').value, '');
  assert.equal(app.node('interest-input').value, '');
  assert.equal(app.node('starter-workbench').hidden, true);
  assert.equal(app.starter.interest, '');
  assert.equal(app.starter.running, false);
  assert.equal(app.timers.size, 0);
});

test('readStarterProgress 忽略继承属性、损坏 JSON 与过期记录', () => {
  const app = frontend();
  assert.equal(app.readStarterProgress('__proto__'), null);
  assert.equal(app.readStarterProgress('constructor'), null);
  app.storage.set('buwan_starter_progress', '{损坏');
  assert.equal(app.readStarterProgress('绘画'), null);
  saveTask(app, '绘画', { day: '2026-10-22' });
  assert.equal(app.readStarterProgress('绘画'), null);
});

test('read/writeStarterProgress 将 __proto__ 作为自有键保存，不污染原型', () => {
  const app = frontend();
  saveTask(app, '绘画');
  app.starter.interest = '__proto__';
  app.node('starter-task').value = '  特殊键任务  ';
  app.writeStarterProgress();
  const data = JSON.parse(app.storage.get('buwan_learning_history')).records;
  assert.equal(data.find(item => item.interest === '__proto__').task, '特殊键任务');
  assert.equal(data.find(item => item.interest === '绘画').task, '保留我的第一步');
  assert.equal(app.readStarterProgress('__proto__').task, '特殊键任务');
  assert.equal(app.evaluate('Object.prototype.task'), undefined);
  assert.equal(app.evaluate('Object.prototype.day'), undefined);
  assert.equal(Object.prototype.task, undefined);
  app.openStarter('__proto__');
  assert.equal(app.node('starter-task').value, '  特殊键任务  ');
});

test('任务手动暂停后不计时，刷新恢复为暂停且仅在点击后继续', async () => {
  const app = frontend();
  app.setupEvents();
  app.openStarter('绘画');
  await app.node('starter-start').dispatch('click');
  assert.equal(app.starter.running, true);
  assert.equal(app.timers.size, 1);
  app.advance(2250);
  await app.node('starter-start').dispatch('click');
  assert.equal(app.starter.running, false);
  assert.equal(app.starter.remaining, 597.75);
  assert.equal(progress(app, '绘画').remaining, 597.75);
  assert.equal(app.timers.size, 0);
  app.advance(60000);
  assert.equal(app.starter.remaining, 597.75);
  const restored = frontend({ storage: app.storage });
  restored.setupEvents();
  restored.advance(60000);
  restored.openStarter('绘画');
  assert.equal(restored.starter.started, true);
  assert.equal(restored.starter.running, false);
  assert.equal(restored.starter.remaining, 597.75);
  assert.equal(restored.node('starter-task').disabled, true);
  assert.equal(restored.node('starter-start').textContent, '继续这一小步');
  assert.equal(restored.timers.size, 0);
  assert.equal(restored.requests.length, 0);
  await restored.node('starter-start').dispatch('click');
  assert.equal(restored.starter.running, true);
  restored.advance(1000);
  assert.equal(restored.starter.remaining, 596.75);
  await restored.node('starter-start').dispatch('click');
  assert.equal(restored.timers.size, 0);
});

test('visibilitychange 隐藏页面暂停任务，返回可见页面不自动启动', async () => {
  const app = frontend();
  app.setupEvents();
  app.openStarter('绘画');
  await app.node('starter-start').dispatch('click');
  app.advance(1250);
  app.document.visibilityState = 'hidden';
  await app.document.dispatch('visibilitychange');
  assert.equal(app.starter.running, false);
  assert.equal(app.starter.remaining, 598.75);
  assert.equal(progress(app, '绘画').remaining, 598.75);
  assert.equal(app.timers.size, 0);
  app.advance(120000);
  app.document.visibilityState = 'visible';
  await app.document.dispatch('visibilitychange');
  assert.equal(app.starter.remaining, 598.75);
  assert.equal(app.starter.running, false);
  assert.equal(app.timers.size, 0);
  assert.match(app.node('starter-session-state').textContent, /点击继续/);
});

test('restoreSession 将 pending 回应和 generating 手册标记中断，不恢复后台请求或计时', () => {
  const app = frontend();
  app.state.sessionActive = true;
  app.state.interests.add('绘画');
  app.state.messages = [{ id: '消息1', role: 'user', content: '未完成问题', status: 'pending', partial: '部分回应' }];
  app.state.guideStatus = 'generating';
  app.node('chat-input').value = '未发送草稿';
  app.saveSession();
  saveTask(app, '绘画');
  const restored = frontend({ storage: app.storage });
  assert.equal(restored.restoreSession(), true);
  assert.equal(restored.state.messages[0].status, 'interrupted');
  assert.equal(restored.state.messages[0].partial, '部分回应');
  assert.equal(restored.state.guideStatus, 'interrupted');
  assert.equal(restored.state.controller, null);
  assert.equal(restored.state.busy, false);
  assert.equal(restored.state.generating, false);
  assert.equal(restored.node('chat-input').value, '未发送草稿');
  assert.equal(restored.node('chat-log').querySelectorAll('.retry-button').length, 1);
  assert.equal(restored.starter.remaining, 123.5);
  assert.equal(restored.starter.running, false);
  assert.equal(restored.requests.length, 0);
  assert.equal(restored.timers.size, 0);
  assert.match(restored.node('chat-status').textContent, /未恢复后台请求或计时/);
});

for (const [remaining, completed] of [[0, false], [55, true]]) {
  test(`恢复任务 remaining=${remaining} completed=${completed} 不后台运行`, () => {
    const app = frontend();
    saveTask(app, '绘画', { remaining, completed });
    app.openStarter('绘画');
    assert.equal(app.starter.running, false);
    assert.equal(app.node('starter-start').disabled, true);
    assert.equal(app.node('starter-task').value, '保留我的第一步');
    assert.equal(app.timers.size, 0);
    assert.equal(app.requests.length, 0);
  });
}

for (const [name, chunks, message] of [
  ['空回应', [chunk('', 'stop')], /空回应/],
  ['截断回应', [chunk('只返回了一半'), chunk(undefined, 'length')], /长度限制/]
]) {
  test(`sendChatMessage ${name}保留用户消息和重试入口，不累计成功轮次`, async () => {
    const app = frontend();
    app.installSdk(() => stream(chunks));
    assert.equal(await app.sendChatMessage('我想学画画'), false);
    assert.equal(app.state.messages.length, 1);
    assert.equal(app.state.messages[0].content, '我想学画画');
    assert.equal(app.state.messages[0].status, 'failed');
    assert.match(app.state.messages[0].error, message);
    assert.equal(app.state.userTurns, 0);
    assert.equal(app.node('chat-log').querySelectorAll('.retry-button').length, 1);
    assert.equal(app.state.busy, false);
    assert.equal(app.state.activeChat, null);
    assert.equal(app.state.controller, null);
    assert.equal(app.node('send-message').disabled, false);
    assert.equal(snapshot(app).messages[0].status, 'failed');
    assert.equal(app.timers.size, 0);
    if (name === '截断回应') assert.equal(app.state.messages[0].partial, '只返回了一半');
  });
}

test('saveSession 存储异常保持内存内容并显示保存失败状态', () => {
  const app = frontend();
  app.state.sessionActive = true;
  app.state.messages = [{ role: 'user', content: '保留内容', status: 'success' }];
  app.storage.set = () => { throw new Error('模拟存储已满'); };
  app.saveSession();
  assert.equal(app.state.storageAvailable, false);
  assert.equal(app.state.messages[0].content, '保留内容');
  assert.equal(app.node('chat-status').classList.contains('error'), true);
  assert.match(app.node('chat-status').textContent, /本地保存不可用/);
});

test('模型偏好只从可用目录选取并可切换保存', async () => {
  const app = frontend();
  const models = [{ id: 'auto', name: '自动' }, { id: 'glm-5.3-flash', name: '已验证模型' }, { id: 'disabled', name: '已停用', enabled: false }];
  app.evaluate('globalThis.WorkBuddyCloud = { createWorkBuddyCloud: () => ({ llm: { models: { list: async () => globalThis.testModels } } }) }');
  app.evaluate(`globalThis.testModels = ${JSON.stringify(models)}`);
  await app.initModel();
  assert.equal(app.state.model.id, 'glm-5.3-flash');
  assert.equal(app.node('model-select').children.length, 2);
  app.node('model-select').value = 'auto';
  app.node('model-select').onchange();
  assert.equal(app.storage.get('buwan_model'), 'auto');
  await app.initModel();
  assert.equal(app.state.model.id, 'auto');
  app.storage.set('buwan_model', 'disabled');
  await app.initModel();
  assert.equal(app.state.model.id, 'glm-5.3-flash');
  app.state.busy = true;
  app.node('model-select').value = 'auto';
  app.node('model-select').onchange();
  assert.equal(app.state.model.id, 'glm-5.3-flash');
});

test('正常长回应不在60字处被截断', async () => {
  const app = frontend();
  const answer = '先选择你喜欢的旋律，再慢慢理解乐器结构。'.repeat(5) + '你今晚想先了解哪一项？';
  app.installSdk(() => stream([chunk(answer, 'stop')]));
  assert.equal(await app.sendChatMessage('我想学口琴'), true);
  assert.equal(app.state.messages.at(-1).content, answer);
  assert.equal(app.state.userTurns, 1);
});

test('generateGuide 额度失败后保留对话并解除 busy，不发搜索请求', async () => {
  const app = frontend();
  app.state.userTurns = 3;
  app.state.sessionActive = true;
  app.state.messages = [{ role: 'user', content: '保留学习愿望', status: 'success' }];
  app.installSdk(() => { throw Object.assign(new Error('模拟额度不足'), { code: 'quota_exceeded' }); });
  let fetches = 0;
  app.setFetch(() => { fetches += 1; assert.fail('提取失败后不应搜索'); });
  await app.generateGuide();
  assert.equal(app.requests.length, 1);
  assert.equal(fetches, 0);
  assert.equal(app.state.guideStatus, 'failed');
  assert.equal(app.state.messages[0].content, '保留学习愿望');
  assert.equal(app.state.busy, false);
  assert.equal(app.state.generating, false);
  assert.equal(app.state.controller, null);
  assert.equal(app.node('generate-guide').disabled, false);
  assert.equal(snapshot(app).guideStatus, 'failed');
  assert.equal(app.timers.size, 0);
});

function showGuide(app, id = 'guide-a') {
  app.state.sessionActive = true;
  app.state.interests = new Set(['绘画']);
  app.state.guide = { ...(id ? { id } : {}), interest: '绘画', first_lesson: '画一片叶子',
    plan4: Array.from({ length: 4 }, (_, index) => ({ goal: `目标${index + 1}`, task: `练习${index + 1}` })) };
  app.state.searchMeta = { results: [] };
  app.state.guideStatus = 'complete';
  app.renderGuide(app.state.guide, app.state.searchMeta, { restoring: true });
}
const guideButtons = app => app.node('guide-content').querySelectorAll('.primary-button');
const history = app => JSON.parse(app.storage.get('buwan_learning_history')).records;
async function finishTask(app, ms = 1234) {
  await app.node('starter-start').dispatch('click');
  app.elapse(ms);
  await app.node('starter-complete').dispatch('click');
}

test('四周各自执行，按 guideId/weekIndex 标记本项，首课独立且同日可连续完成', async () => {
  const app = frontend();
  app.setupEvents();
  showGuide(app);
  assert.equal(guideButtons(app).length, 5);
  for (const index of [0, 1, 2, 3]) {
    await guideButtons(app)[index].dispatch('click');
    assert.equal(app.node('starter-task').value, `练习${index + 1}`);
    assert.deepEqual(plain(app.starter.source), { kind: 'week', guideId: 'guide-a', weekIndex: index });
    assert.equal(guideButtons(app)[index].disabled, false);
    await finishTask(app);
    const buttons = guideButtons(app);
    assert.match(buttons[index].textContent, /累计已练习 1 次.*最近完成：.*再次练习/);
    assert.equal(buttons[index].disabled, false);
    assert.equal(buttons[4].disabled, false);
    assert.equal(app.node('learning-steps').lastElementChild.classList.contains('completed'), false);
  }
  await guideButtons(app)[4].dispatch('click');
  await finishTask(app, 775);
  assert.match(guideButtons(app)[4].textContent, /累计已练习 1 次.*最近完成：.*再次练习/);
  assert.equal(guideButtons(app)[4].disabled, false);
  assert.equal(app.node('learning-steps').lastElementChild.classList.contains('completed'), true);
  const records = history(app);
  assert.equal(records.length, 5);
  assert.ok(records.every(item => item.completed && item.day === app.todayKey() && item.completedAt));
  assert.ok(Math.abs(records[0].elapsedSeconds - 1.234) < 1e-9);
  assert.equal(records[4].task, '画一片叶子');
  assert.equal(records[4].source.kind, 'first');
  await app.node('starter-next').dispatch('click');
  assert.equal(app.starter.completed, false);
  assert.equal(app.node('starter-task').disabled, false);
  assert.equal(history(app).filter(item => item.completed).length, 5);
  showGuide(app, 'guide-b');
  assert.ok(guideButtons(app).every(button => !button.disabled));
});

test('运行和暂停任务切换均确认具体任务，取消不替换，确认保存精确进度且可从历史恢复', async () => {
  const app = frontend();
  app.setupEvents();
  showGuide(app);
  await guideButtons(app)[0].dispatch('click');
  const oldId = app.starter.id;
  await app.node('starter-start').dispatch('click');
  app.elapse(1123);
  app.setConfirm(false);
  await guideButtons(app)[1].dispatch('click');
  assert.equal(app.starter.id, oldId);
  assert.equal(app.starter.running, true);
  assert.equal(app.node('starter-task').value, '练习1');
  assert.match(app.confirmations.at(-1), /未完成任务「练习1」.*保存.*切换/);
  app.setConfirm(true);
  await guideButtons(app)[1].dispatch('click');
  assert.equal(app.starter.running, false);
  assert.equal(app.timers.size, 0);
  assert.equal(history(app).find(item => item.id === oldId).remaining, 598.877);
  await app.node('starter-start').dispatch('click');
  app.elapse(2000);
  await app.node('starter-start').dispatch('click');
  app.setConfirm(false);
  await guideButtons(app)[2].dispatch('click');
  assert.equal(app.node('starter-task').value, '练习2');
  app.setConfirm(true);
  const row = app.node('learning-history-list').children.find(item => item.children[1]?.textContent === '练习1');
  await row.querySelector('.quiet-button').dispatch('click');
  assert.equal(app.starter.id, oldId);
  assert.equal(app.starter.remaining, 598.877);
  assert.equal(app.starter.running, false);
  assert.equal(app.node('starter-task').value, '练习1');
});

test('未完成任务保存失败时停止切换，保留任务及内存进度', async () => {
  const app = frontend();
  app.setupEvents();
  showGuide(app);
  await guideButtons(app)[0].dispatch('click');
  await app.node('starter-start').dispatch('click');
  app.elapse(1500);
  app.storage.set = () => { throw new Error('模拟写入失败'); };
  await guideButtons(app)[1].dispatch('click');
  assert.equal(app.node('starter-task').value, '练习1');
  assert.equal(app.starter.remaining, 598.5);
  assert.equal(app.starter.running, false);
  assert.equal(app.state.storageAvailable, false);
});

test('完成按 deadline 结算最后一个 tick 之后的时间，到期上限准确且重复完成不新增记录', async () => {
  const app = frontend();
  app.setupEvents();
  app.openStarter('绘画');
  await finishTask(app, 1000123);
  assert.equal(progress(app, '绘画').remaining, 0);
  assert.equal(progress(app, '绘画').elapsedSeconds, 600);
  const completedAt = progress(app, '绘画').completedAt;
  app.elapse(10000);
  await app.node('starter-complete').dispatch('click');
  assert.equal(progress(app, '绘画').completedAt, completedAt);
  assert.equal(history(app).length, 1);
});

test('pagehide 立即结算并暂停，缓存页面回来不会后台计时，刷新保持同一任务', async () => {
  const app = frontend();
  app.setupEvents();
  app.openStarter('绘画');
  await app.node('starter-start').dispatch('click');
  app.elapse(1234);
  await app.window.dispatch('pagehide');
  assert.equal(app.starter.running, false);
  assert.equal(app.starter.remaining, 598.766);
  assert.equal(app.timers.size, 0);
  app.advance(60000);
  const restored = frontend({ storage: app.storage });
  restored.openStarter('绘画');
  assert.equal(restored.starter.id, app.starter.id);
  assert.equal(restored.starter.remaining, 598.766);
  assert.equal(restored.starter.running, false);
});

test('旧记录跨日期迁移且保留原始存储，未知手册来源不冒领首课或周任务', () => {
  const app = frontend();
  const legacy = { 绘画: savedTask(app, { completed: true, day: '2026-10-22', updatedAt: '2026-10-22T10:00:00Z' }),
    英语: savedTask(app, { fromGuide: false }) };
  const raw = JSON.stringify(legacy);
  app.storage.set('buwan_starter_progress', raw);
  app.setupEvents();
  showGuide(app);
  assert.ok(guideButtons(app).every(button => !button.disabled));
  assert.equal(app.node('learning-steps').lastElementChild.classList.contains('completed'), false);
  app.openStarter('英语');
  assert.equal(app.storage.get('buwan_starter_progress'), raw);
  const old = history(app).find(item => item.interest === '绘画');
  assert.equal(old.day, '2026-10-22');
  assert.equal(old.completedAt, null);
  assert.equal(old.updatedAt, legacy.绘画.updatedAt);
  assert.equal(old.source.kind, 'legacyGuide');
  assert.equal(old.elapsedSeconds, 476.5);
  const restored = frontend({ storage: app.storage });
  assert.equal(restored.readLearningRecords().length, 2);
});

test('历史按日期和兴趣筛选，复盘只填入一次草稿，保护现有输入且清对话保留历史', async () => {
  const app = frontend();
  app.setupEvents();
  app.openStarter('绘画');
  await finishTask(app, 2500);
  const firstDay = app.todayKey();
  app.elapse(86400000);
  app.openStarter('英语');
  await finishTask(app, 3500);
  app.node('learning-history-date').value = firstDay;
  await app.node('learning-history-date').dispatch('input');
  assert.equal(app.node('learning-history-list').children.length, 1);
  app.node('learning-history-interest').value = '英语';
  await app.node('learning-history-interest').dispatch('input');
  assert.match(app.node('learning-history-list').children[0].textContent, /没有符合/);
  app.node('learning-history-date').value = '';
  await app.node('learning-history-date').dispatch('input');
  const button = app.node('learning-history-list').querySelector('.quiet-button');
  app.node('chat-input').value = '原有草稿';
  app.setConfirm(false);
  await button.dispatch('click');
  assert.equal(app.node('chat-input').value, '原有草稿');
  app.setConfirm(true);
  await button.dispatch('click');
  const draft = app.node('chat-input').value;
  assert.match(draft, /英语.*实际用时 3.5 秒/);
  await button.dispatch('click');
  assert.equal(app.node('chat-input').value, draft);
  assert.equal(snapshot(app).chatDraft, draft);
  assert.equal(app.state.messages.length, 1);
  assert.match(app.state.messages[0].content, /关于「英语」/);
  assert.deepEqual([...app.state.interests], ['英语']);
  assert.equal(app.requests.length, 0);
  app.newConversation();
  assert.equal(history(app).filter(item => item.completed).length, 2);
});

test('恢复旧手册分配并持久化稳定 ID，周状态跨刷新保留且不影响首课', async () => {
  const app = frontend();
  app.setupEvents();
  showGuide(app, null);
  const id = app.state.guide.id;
  assert.ok(id);
  await guideButtons(app)[2].dispatch('click');
  await finishTask(app);
  const restored = frontend({ storage: app.storage });
  assert.equal(restored.restoreSession(), true);
  assert.equal(restored.state.guide.id, id);
  assert.match(guideButtons(restored)[2].textContent, /累计已练习 1 次.*最近完成：.*再次练习/);
  assert.equal(guideButtons(restored)[2].disabled, false);
  assert.equal(guideButtons(restored)[4].disabled, false);
  assert.equal(restored.node('learning-steps').lastElementChild.classList.contains('completed'), false);
  assert.equal(restored.starter.running, false);
});

test('最多保留 200 项历史，淘汰记录不会在刷新后被旧迁移重新加入', () => {
  const app = frontend();
  saveTask(app, '绘画', { completed: true, day: '2026-10-01' });
  for (let index = 0; index < 201; index += 1) app.openStarter('英语', { fresh: true, task: `任务${index}` });
  assert.equal(history(app).length, 200);
  assert.equal(history(app)[0].task, '任务1');
  const restored = frontend({ storage: app.storage });
  assert.equal(restored.readLearningRecords().length, 200);
  assert.equal(restored.readLearningRecords().some(item => item.interest === '绘画'), false);
  assert.ok(app.storage.has('buwan_starter_progress'));
});

for (const index of [0, 4]) {
  test(`${index === 0 ? '周任务' : '第一课'}跨日再次练习生成新记录，累计次数和最近完成时间正确`, async () => {
    const app = frontend();
    app.setupEvents();
    showGuide(app);
    await guideButtons(app)[index].dispatch('click');
    const firstId = app.starter.id;
    await finishTask(app);
    const firstRecord = plain(history(app)[0]);
    app.elapse(86400000);
    await guideButtons(app)[index].dispatch('click');
    assert.notEqual(app.starter.id, firstId);
    assert.equal(app.starter.day, app.todayKey());
    assert.equal(app.starter.started, false);
    assert.equal(app.starter.completed, false);
    assert.equal(app.starter.remaining, 600);
    assert.equal(app.node('starter-task').disabled, false);
    assert.equal(app.node('starter-task').value, firstRecord.task);
    assert.deepEqual(plain(app.starter.source), firstRecord.source);
    await finishTask(app, 2345);
    const records = history(app);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0], firstRecord);
    assert.notEqual(records[1].day, records[0].day);
    assert.notEqual(records[1].completedAt, records[0].completedAt);
    const button = guideButtons(app)[index];
    assert.equal(button.disabled, false);
    assert.match(button.textContent, /累计已练习 2 次.*再次练习/);
    assert.ok(button.textContent.includes(new Date(records[1].completedAt).toLocaleString('zh-CN')));
    assert.equal(app.node('learning-steps').lastElementChild.classList.contains('completed'), index === 4);
    assert.equal(records.filter(item => item.source.kind === 'week').length, index === 0 ? 2 : 0);
    assert.ok(guideButtons(app).filter((_button, i) => i !== index).every(button => button.textContent === '带入今日任务'));
  });
}

test('已练习来源仍优先恢复同来源的未完成项，跨日不重复创建且恢复精确进度', async () => {
  const app = frontend();
  app.setupEvents();
  showGuide(app);
  await guideButtons(app)[0].dispatch('click');
  await finishTask(app);
  await guideButtons(app)[0].dispatch('click');
  const unfinishedId = app.starter.id;
  const unfinishedDay = app.starter.day;
  await app.node('starter-start').dispatch('click');
  app.elapse(1750);
  await app.node('starter-start').dispatch('click');
  await guideButtons(app)[1].dispatch('click');
  app.elapse(86400000);
  await guideButtons(app)[0].dispatch('click');
  assert.equal(app.starter.id, unfinishedId);
  assert.equal(app.starter.day, unfinishedDay);
  assert.equal(app.starter.remaining, 598.25);
  assert.equal(app.starter.started, true);
  assert.equal(app.starter.running, false);
  assert.equal(history(app).length, 3);
  assert.match(guideButtons(app)[0].textContent, /累计已练习 1 次/);
});

const reviewButton = (app, interest) => app.node('learning-history-list').children
  .find(row => row.children[0]?.textContent.includes(` · ${interest} · 已完成`)).querySelector('.quiet-button');

for (const currentInterest of ['绘画', null]) {
  test(`历史复盘从${currentInterest || '无兴趣'}切换到英语，真实请求不包含旧轮次和手册`, async () => {
    const app = frontend();
    app.setupEvents();
    app.openStarter('英语');
    await finishTask(app);
    showGuide(app);
    if (!currentInterest) app.state.interests.clear();
    app.state.messages = [
      { role: 'user', content: '旧主题私有轮次', status: 'success' },
      { role: 'assistant', content: '旧主题回应', status: 'success' }
    ];
    app.state.userTurns = 3;
    const oldId = app.state.conversationId;
    await reviewButton(app, '英语').dispatch('click');
    assert.deepEqual([...app.state.interests], ['英语']);
    assert.notEqual(app.state.conversationId, oldId);
    assert.equal(app.state.topicStart, 2);
    assert.equal(app.state.userTurns, 0);
    assert.equal(app.state.guide, null);
    assert.equal(app.state.searchMeta, null);
    assert.equal(app.state.guideStatus, 'idle');
    assert.equal(app.node('guide-content').children.length, 0);
    const draft = app.node('chat-input').value;
    assert.match(draft, /英语.*复盘|复盘.*英语/);
    app.installSdk(() => stream([chunk('下一步想练什么？', 'stop')]));
    assert.equal(await app.sendChatMessage(draft), true);
    const request = app.requests[0];
    assert.equal(request.conversationId, app.state.conversationId);
    assert.deepEqual(JSON.parse(request.messages[1].content.slice('用户资料：'.length)).selected_interests, ['英语']);
    assert.equal(request.messages.at(-1).content, draft);
    assert.equal(JSON.stringify(request.messages).includes('旧主题'), false);
    assert.equal(app.state.userTurns, 1);
  });
}

test('同兴趣复盘保留 topicStart、成功轮次、会话 ID 和手册，实际请求保留本主题轮次', async () => {
  const app = frontend();
  app.setupEvents();
  showGuide(app);
  await guideButtons(app)[4].dispatch('click');
  await finishTask(app);
  app.state.messages = [
    { role: 'user', content: '更早主题', status: 'success' },
    { role: 'user', content: '当前绘画轮次', status: 'success' }
  ];
  app.state.topicStart = 1;
  app.state.userTurns = 2;
  const guide = app.state.guide;
  const id = app.state.conversationId;
  await reviewButton(app, '绘画').dispatch('click');
  assert.equal(app.state.guide, guide);
  assert.equal(app.state.topicStart, 1);
  assert.equal(app.state.userTurns, 2);
  assert.equal(app.state.conversationId, id);
  app.installSdk(() => stream([chunk('你喜欢哪一笔？', 'stop')]));
  await app.sendChatMessage(app.node('chat-input').value);
  assert.ok(app.requests[0].messages.some(item => item.content === '当前绘画轮次'));
  assert.equal(app.requests[0].messages.some(item => item.content === '更早主题'), false);
});

for (const rejection of ['替换草稿', '暂停任务']) {
  test(`跨兴趣复盘拒绝${rejection}不改变会话、草稿、任务、语音或存储`, async () => {
    const app = frontend();
    const voice = app.installVoice();
    app.setupEvents();
    app.openStarter('英语');
    await finishTask(app);
    app.selectInterest('绘画');
    showGuide(app);
    await app.node('starter-start').dispatch('click');
    app.elapse(1200);
    app.node('chat-input').value = '原草稿';
    app.saveSession();
    await app.node('voice-input').dispatch('click');
    const before = {
      session: app.evaluate('JSON.stringify(state, (key, value) => key === "interests" ? [...value] : value)'),
      starter: JSON.stringify(app.starter),
      storage: [...app.storage],
      draft: app.node('chat-input').value,
      guideChildren: [...app.node('guide-content').children]
    };
    app.setConfirm(message => rejection === '暂停任务' && message.includes('替换'));
    await reviewButton(app, '英语').dispatch('click');
    assert.equal(app.node('chat-input').value, before.draft);
    assert.equal(app.evaluate('JSON.stringify(state, (key, value) => key === "interests" ? [...value] : value)'), before.session);
    assert.equal(JSON.stringify(app.starter), before.starter);
    assert.deepEqual([...app.storage], before.storage);
    assert.deepEqual(app.node('guide-content').children, before.guideChildren);
    assert.equal(app.starter.running, true);
    assert.equal(voice.recognitions[0].aborts, 0);
    assert.equal(app.requests.length, 0);
    assert.equal(app.confirmations.slice(-2).filter(message => message.includes('替换')).length, 1);
  });
}

const recognitionResult = content => ({ results: [[{ transcript: content }]] });

test('mic 再次点击停止录音并失效旧回调，重启使用独立识别实例', async () => {
  const app = frontend();
  const voice = app.installVoice();
  app.setupEvents();
  app.node('chat-input').value = '基础草稿';
  await app.node('voice-input').dispatch('click');
  const first = voice.recognitions[0];
  first.onresult(recognitionResult('第一段'));
  assert.equal(app.node('chat-input').value, '基础草稿 第一段');
  assert.equal(snapshot(app).chatDraft, '基础草稿 第一段');
  assert.equal(app.node('voice-input').classList.contains('listening'), true);
  await app.node('voice-input').dispatch('click');
  assert.equal(first.stops, 1);
  assert.equal(app.state.recognition, null);
  assert.equal(app.node('voice-input').classList.contains('listening'), false);
  await app.node('voice-input').dispatch('click');
  const second = voice.recognitions[1];
  assert.notEqual(second, first);
  const storage = [...app.storage];
  const status = app.node('chat-status').textContent;
  first.onstart();
  first.onresult(recognitionResult('过期结果'));
  first.onerror({ error: '过期错误' });
  first.onend();
  assert.equal(app.node('chat-input').value, '基础草稿 第一段');
  assert.deepEqual([...app.storage], storage);
  assert.equal(app.node('chat-status').textContent, status);
  assert.equal(app.state.recognition, second);
  assert.equal(app.node('voice-input').classList.contains('listening'), true);
  second.onresult(recognitionResult('新段落'));
  assert.equal(app.node('chat-input').value, '基础草稿 第一段 新段落');
  second.onend();
  assert.equal(app.state.recognition, null);
  assert.match(app.node('chat-status').textContent, /语音已转成文字/);
});

test('识别 error 后的 result/end 不覆盖失败提示或草稿，结束后可重启', async () => {
  const app = frontend();
  const voice = app.installVoice();
  app.setupEvents();
  app.node('chat-input').value = '保留文字';
  await app.node('voice-input').dispatch('click');
  const recognition = voice.recognitions[0];
  recognition.onerror({ error: 'not-allowed' });
  const status = app.node('chat-status').textContent;
  recognition.onresult(recognitionResult('错误后的结果'));
  recognition.onend();
  assert.equal(app.node('chat-input').value, '保留文字');
  assert.equal(app.node('chat-status').textContent, status);
  assert.match(status, /not-allowed/);
  assert.equal(app.node('chat-status').classList.contains('error'), true);
  assert.equal(app.node('voice-input').classList.contains('listening'), false);
  await app.node('voice-input').dispatch('click');
  assert.equal(voice.recognitions.length, 2);
});

for (const action of ['abortActive', 'newConversation', 'selectInterest', 'sendChatMessage', 'generateGuide']) {
  test(`${action} 中止识别，过期 callback 不写回新会话或发送后的草稿`, async () => {
    const app = frontend();
    const voice = app.installVoice();
    app.setupEvents();
    app.node('chat-input').value = '待发送内容';
    await app.node('voice-input').dispatch('click');
    const recognition = voice.recognitions[0];
    app.installSdk(() => {
      assert.equal(recognition.aborts, 1, '请求 SDK 前应中止识别');
      return stream([chunk(action === 'generateGuide' ? '{"interest":"英语"}' : '下一步呢？', 'stop')]);
    });
    if (action === 'sendChatMessage') await app.sendChatMessage('待发送内容');
    else if (action === 'generateGuide') {
      app.state.userTurns = 3;
      app.installSdk(() => {
        assert.equal(recognition.aborts, 1, '提取请求前应中止识别');
        throw Object.assign(new Error('模拟额度不足'), { code: 'quota_exceeded' });
      });
      await app.generateGuide();
    } else if (action === 'selectInterest') app.selectInterest('英语');
    else app[action]();
    assert.equal(recognition.aborts, 1);
    assert.equal(app.state.recognition, null);
    assert.equal(app.node('voice-input').classList.contains('listening'), false);
    app.node('chat-input').value = '操作后新草稿';
    const storage = [...app.storage];
    const status = app.node('chat-status').textContent;
    recognition.onstart();
    recognition.onresult(recognitionResult('已过期的旧识别'));
    recognition.onerror({ error: '旧错误' });
    recognition.onend();
    assert.equal(app.node('chat-input').value, '操作后新草稿');
    assert.deepEqual([...app.storage], storage);
    assert.equal(app.node('chat-status').textContent, status);
  });
}

test('TTS 播放期间开关可点击取消，cancel 不派发结束事件也立即恢复状态', async () => {
  const app = frontend();
  const voice = app.installVoice();
  app.setupEvents();
  await app.node('tts-toggle').dispatch('click');
  app.speak('第一段播报');
  assert.equal(app.state.speaking, true);
  assert.equal(app.node('tts-toggle').disabled, false);
  const cancels = voice.synthesis.cancels;
  await app.node('tts-toggle').dispatch('click');
  assert.equal(voice.synthesis.cancels, cancels + 1);
  assert.equal(app.state.ttsEnabled, false);
  assert.equal(app.state.speaking, false);
  assert.equal(app.state.utterance, null);
  assert.equal(app.node('tts-toggle').disabled, false);
  assert.equal(app.node('tts-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(app.node('tts-toggle').querySelector('.sr-only').textContent, '开启语音播报');
});

test('旧 TTS end/error 不影响新播放，新播放的 end/error 正常释放状态', async () => {
  const app = frontend();
  const voice = app.installVoice();
  app.setupEvents();
  await app.node('tts-toggle').dispatch('click');
  app.speak('旧播报');
  const old = voice.utterances[0];
  app.speak('新播报');
  const current = voice.utterances[1];
  old.onend();
  old.onerror();
  assert.equal(app.state.utterance, current);
  assert.equal(app.state.speaking, true);
  current.onend();
  assert.equal(app.state.speaking, false);
  assert.equal(app.state.utterance, null);
  app.speak('错误播报');
  voice.utterances[2].onerror();
  assert.equal(app.state.speaking, false);
});

for (const action of ['abortActive', 'newConversation']) {
  test(`${action} 可靠停止播报和试听并立即恢复控件`, async () => {
    const app = frontend();
    const voice = app.installVoice();
    app.setupEvents();
    app.state.ttsEnabled = true;
    for (const play of [() => app.speak('播报'), () => app.previewVoice()]) {
      play();
      const utterance = voice.utterances.at(-1);
      const cancels = voice.synthesis.cancels;
      app[action]();
      assert.equal(voice.synthesis.cancels, cancels + 1);
      assert.equal(app.state.speaking, false);
      assert.equal(app.state.utterance, null);
      assert.equal(app.node('preview-voice').disabled, false);
      assert.equal(app.node('tts-toggle').disabled, false);
      utterance.onend();
      assert.equal(app.state.speaking, false);
    }
  });
}

for (const event of ['按钮', 'cancel', 'close']) {
  test(`dialog ${event} 停止试听，旧试听事件不解锁后续新试听`, async () => {
    const app = frontend();
    const voice = app.installVoice();
    app.setupEvents();
    app.previewVoice();
    const old = voice.utterances[0];
    assert.equal(app.node('preview-voice').disabled, true);
    const cancels = voice.synthesis.cancels;
    if (event === '按钮') await app.node('close-dialog').dispatch('click');
    else await app.node('companion-dialog').dispatch(event);
    assert.equal(voice.synthesis.cancels, cancels + 1);
    assert.equal(app.node('preview-voice').disabled, false);
    assert.equal(app.state.speaking, false);
    app.previewVoice();
    old.onend();
    old.onerror();
    assert.equal(app.state.utterance, voice.utterances[1]);
    assert.equal(app.node('preview-voice').disabled, true);
    assert.equal(app.state.speaking, true);
    voice.utterances[1].onend();
    assert.equal(app.node('preview-voice').disabled, false);
  });
}

test('试听与新回应互相替换时，旧 utterance 回调不影响当前播放及控件', () => {
  const app = frontend();
  const voice = app.installVoice();
  app.state.ttsEnabled = true;
  app.previewVoice();
  const preview = voice.utterances[0];
  app.speak('新回应');
  preview.onend();
  assert.equal(app.state.utterance, voice.utterances[1]);
  assert.equal(app.state.speaking, true);
  assert.equal(app.node('preview-voice').disabled, false);
  app.previewVoice();
  voice.utterances[1].onend();
  assert.equal(app.state.utterance, voice.utterances[2]);
  assert.equal(app.state.speaking, true);
  assert.equal(app.node('preview-voice').disabled, true);
});

test('数字人仅点击连接，播报走已连接控制器，隐藏页面立即断开', async () => {
  const app = frontend();
  const voice = app.installVoice();
  const calls = [];
  let callbacks;
  let status = 'disconnected';
  const controller = {
    getState: () => ({ status }),
    connect() { calls.push('connect'); status = 'ready'; callbacks.onState({ status, detail: '已连接' }); },
    disconnect() { calls.push('disconnect'); status = 'disconnected'; callbacks.onState({ status, detail: '已断开' }); },
    stop() { calls.push('stop'); },
    speak(value) { calls.push(['speak', value]); callbacks.onSpeaking(true); return true; }
  };
  app.window.BuwanAvatar = { createController(options) { callbacks = options; return controller; } };
  app.setupAvatar();
  assert.deepEqual(calls, []);
  await app.node('avatar-connect').dispatch('click');
  assert.equal(app.node('avatar-connect').disabled, true);
  assert.equal(app.node('avatar-stage').hidden, false);
  callbacks.onState({ status: 'offline', detail: '离线中' });
  assert.equal(app.node('avatar-offline').disabled, false);
  assert.equal(app.node('avatar-offline').textContent, '切换在线');
  callbacks.onState({ status: 'connecting', detail: '连接中' });
  assert.equal(app.node('avatar-stage').hidden, true);
  assert.equal(app.node('companion-stage').dataset.avatarState, 'connecting');
  callbacks.onState({ status: 'ready', detail: '已连接' });
  app.state.ttsEnabled = true;
  app.speak('数字人回应');
  assert.deepEqual(calls.at(-1), ['speak', '数字人回应']);
  assert.equal(voice.utterances.length, 0);
  assert.equal(app.state.speaking, true);
  await app.node('avatar-stop').dispatch('click');
  assert.equal(app.state.speaking, false);
  app.document.visibilityState = 'hidden';
  await app.document.dispatch('visibilitychange');
  assert.equal(calls.at(-1), 'disconnect');
  assert.equal(app.node('avatar-stage').hidden, true);
  assert.equal(app.node('avatar-connect').disabled, false);
});

test('浏览器不支持识别、播报和试听时保留明确提示', async () => {
  const app = frontend();
  app.setupEvents();
  await app.node('voice-input').dispatch('click');
  assert.match(app.node('chat-status').textContent, /不支持语音输入/);
  await app.node('tts-toggle').dispatch('click');
  assert.match(app.node('chat-status').textContent, /不支持语音播报/);
  assert.equal(app.state.ttsEnabled, false);
  app.previewVoice();
  assert.match(app.node('chat-status').textContent, /不支持语音试听/);
});
