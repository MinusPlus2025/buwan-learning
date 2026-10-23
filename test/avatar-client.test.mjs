import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/avatar.js', import.meta.url), 'utf8');
const config = () => ({
  configured: true,
  appId: 'test-app',
  appSecret: 'server-managed',
  gatewayServer: '/api/avatar/session',
  headers: { 'X-Buwan-Avatar-Token': 'test-local-token' }
});
const response = (value = config(), ok = true) => ({ ok, json: async () => value });
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function clock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    tick(duration) {
      const end = now + duration;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        now = timer.at;
        timers.delete(id);
        timer.callback();
      }
      now = end;
    },
    get size() { return timers.size; }
  };
}

function environment(window = {}) {
  const time = clock();
  const logs = [];
  const consoleMock = Object.fromEntries(['log', 'error', 'warn', 'info', 'debug'].map((name) => [name, (...args) => logs.push(args)]));
  const context = vm.createContext({
    window, AbortController,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    console: consoleMock
  });
  vm.runInContext(source, context, { filename: 'avatar.js' });
  return { api: window.BuwanAvatar, window, time, logs };
}

function harness({ fetchImpl, init, SDKClass, loadSdk, onState, onSpeaking } = {}) {
  const env = environment();
  const requests = [];
  const instances = [];
  const states = [];
  const voices = [];
  class FakeAvatar {
    constructor(options) {
      this.options = options;
      this.calls = [];
      this.destroyCount = 0;
      instances.push(this);
    }
    init(options) {
      this.initOptions = options;
      return init ? init.call(this, options) : Promise.resolve();
    }
    speak(...args) { this.calls.push(['speak', ...args]); }
    interactiveidle() { this.calls.push(['interactiveidle']); }
    destroy() { this.destroyCount++; }
  }
  const controller = env.api.createController({
    fetchImpl: async (...args) => {
      requests.push(args);
      return fetchImpl ? fetchImpl(...args) : response();
    },
    ...(loadSdk ? { loadSdk } : { SDKClass: SDKClass || FakeAvatar }),
    onState(value) { states.push(plain(value)); onState?.(value); },
    onSpeaking(value) { voices.push(value); onSpeaking?.(value); }
  });
  return { ...env, controller, instances, states, voices, requests, FakeAvatar };
}

async function online(h) {
  const pending = h.controller.connect();
  await flush();
  h.instances.at(-1).options.onStatusChange(0);
  assert.equal((await pending).status, 'ready');
  return h.instances.at(-1);
}

function documentMock() {
  const scripts = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, 'script');
      return { removed: false, remove() { this.removed = true; } };
    },
    head: { appendChild(script) { scripts.push(script); } }
  };
  return { document, scripts };
}

test('创建控制器不请求配置、不加载 SDK、不注册全局生命周期事件', () => {
  let loads = 0;
  const h = harness({ loadSdk() { loads++; } });
  assert.deepEqual(plain(h.controller.getState()), { status: 'disconnected', detail: '数字人未连接。' });
  assert.equal(h.requests.length, 0);
  assert.equal(loads, 0);
  assert.equal(h.time.size, 0);
  assert.equal(h.controller.speak('你好'), false);
  assert.equal(h.controller.stop(), false);
  assert.equal(h.window.onpagehide, undefined);
  assert.equal(h.window.onvisibilitychange, undefined);
});

test('显式连接使用同源 JSON POST、去重并只将白名单代理参数传给 SDK', async () => {
  const h = harness({ fetchImpl: async () => response({ ...config(), enableLogger: true, onMessage: '不能覆盖', extra: '不能传入' }) });
  const first = h.controller.connect();
  assert.strictEqual(h.controller.connect(), first);
  await flush();
  assert.equal(h.requests.length, 1);
  const [url, options] = h.requests[0];
  assert.equal(url, '/api/avatar/config');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.body, '{}');
  assert.equal(options.headers['Content-Type'], 'application/json');
  const sdk = h.instances[0];
  assert.equal(sdk.options.containerId, '#avatar-stage');
  assert.equal(sdk.options.appId, 'test-app');
  assert.equal(sdk.options.appSecret, 'server-managed');
  assert.equal(sdk.options.gatewayServer, '/api/avatar/session');
  assert.deepEqual(plain(sdk.options.headers), config().headers);
  assert.equal(sdk.options.enableLogger, false);
  assert.equal(sdk.options.extra, undefined);
  assert.equal(typeof sdk.options.onMessage, 'function');
  sdk.options.onStatusChange(0);
  assert.equal((await first).status, 'ready');
  assert.strictEqual(h.controller.connect(), first);
  assert.equal(h.time.size, 0);
  h.controller.disconnect();
});

test('浏览器默认 fetch 和自定义容器可用，加载器只在配置成功后运行', async () => {
  const calls = [];
  const h = environment({ fetch: async (...args) => { calls.push(args); return response(); } });
  let options;
  let initOptions;
  let loads = 0;
  class SDK {
    constructor(value) { options = value; }
    init(value) { initOptions = value; }
    destroy() {}
  }
  const controller = h.api.createController({ containerId: '#other-stage', loadSdk: async () => { loads++; return SDK; } });
  assert.equal(loads, 0);
  const pending = controller.connect();
  await flush();
  assert.equal(loads, 1);
  assert.equal(calls.length, 1);
  assert.equal(options.containerId, '#other-stage');
  options.onStatusChange(0);
  initOptions.onDownloadProgress(100);
  assert.equal((await pending).status, 'ready');
  controller.disconnect();
});

test('单有在线、下载进度或非 online 状态都不假报 ready', async () => {
  const init = deferred();
  const h = harness({ init: () => init.promise });
  const pending = h.controller.connect();
  await flush();
  const sdk = h.instances[0];
  sdk.options.onStatusChange(2);
  sdk.initOptions.onDownloadProgress(100);
  assert.equal(h.controller.getState().status, 'connecting');
  assert.equal(h.controller.speak('未就绪'), false);
  sdk.options.onStatusChange(0);
  assert.equal((await pending).status, 'ready');
  h.controller.disconnect();
  init.resolve();
  await flush();
  assert.equal(h.controller.getState().status, 'disconnected');
});

test('只有 online 且初始化完成才能连接；同步 init 的 undefined 不算完成', async () => {
  const h = harness({ init: () => undefined });
  const pending = h.controller.connect();
  await flush();
  const sdk = h.instances[0];
  sdk.options.onStatusChange(0);
  assert.equal(h.controller.getState().status, 'connecting');
  sdk.initOptions.onDownloadProgress(99);
  assert.equal(h.controller.getState().status, 'connecting');
  sdk.initOptions.onDownloadProgress(100);
  assert.equal((await pending).status, 'ready');
  h.controller.disconnect();
});

test('init Promise 完成仍要在线回调，进度只接受有限范围数值且不倒退', async () => {
  const h = harness();
  const pending = h.controller.connect();
  await flush();
  const sdk = h.instances[0];
  assert.equal(h.controller.getState().status, 'connecting');
  for (const value of [NaN, Infinity, -1, 101, '100', null]) sdk.initOptions.onDownloadProgress(value);
  assert.equal(h.controller.getState().progress, undefined);
  sdk.initOptions.onDownloadProgress(40);
  sdk.initOptions.onDownloadProgress(20);
  assert.equal(h.controller.getState().progress, 40);
  assert.equal(h.controller.getState().status, 'connecting');
  sdk.options.onStatusChange(0);
  assert.equal((await pending).status, 'ready');
  h.time.tick(60000);
  assert.equal(h.controller.getState().status, 'ready');
  h.controller.disconnect();
});

test('未配置包括 HTTP 503，允许显式重试且不会加载 SDK', async () => {
  let requests = 0;
  let loads = 0;
  const h = harness({
    fetchImpl: async () => response(requests++ ? config() : { configured: false, note: '不展示服务端原文' }, requests > 1),
    loadSdk: async () => { loads++; throw new Error('敏感错误'); }
  });
  assert.equal((await h.controller.connect()).status, 'unconfigured');
  assert.equal(loads, 0);
  assert.equal(h.time.size, 0);
  assert.equal(h.controller.getState().detail, '数字人服务尚未配置，请配置后重试。');
  assert.equal((await h.controller.connect()).status, 'error');
  assert.equal(h.requests.length, 2);
  assert.equal(loads, 1);
});

test('无效配置及 HTTP 错误不会将凭据或非同源地址交给 SDK', async () => {
  const invalid = [
    null, {}, { ...config(), appId: '' }, { ...config(), configured: 'true' },
    { ...config(), appSecret: '真实密钥禁止下发' },
    { ...config(), gatewayServer: 'https://other.invalid/session' },
    { ...config(), headers: {} }, { ...config(), headers: { 'X-Buwan-Avatar-Token': '' } }
  ];
  for (const value of invalid) {
    const h = harness({ fetchImpl: async () => response(value) });
    assert.equal((await h.controller.connect()).status, 'error');
    assert.equal(h.instances.length, 0);
    assert.equal(h.time.size, 0);
  }
  const h = harness({ fetchImpl: async () => response(config(), false) });
  assert.equal((await h.controller.connect()).status, 'error');
  assert.equal(h.instances.length, 0);
});

test('仅 ready 后可播报，XML 字符被转义，重复播报与 stop 使用 interactiveidle', async () => {
  const h = harness();
  const sdk = await online(h);
  const text = '<ue4event type="ka">你好 &amp; \'世界\'</ue4event>';
  assert.equal(h.controller.speak(text), true);
  assert.deepEqual(sdk.calls[0], ['speak', '&lt;ue4event type=&quot;ka&quot;&gt;你好 &amp;amp; &apos;世界&apos;&lt;/ue4event&gt;', true, true]);
  assert.equal(h.controller.speak('再说一次'), true);
  assert.deepEqual(sdk.calls.slice(1), [['interactiveidle'], ['speak', '再说一次', true, true]]);
  assert.equal(h.controller.stop(), true);
  assert.deepEqual(sdk.calls.at(-1), ['interactiveidle']);
  for (const text of ['', ' \n ', null, {}]) assert.equal(h.controller.speak(text), false);
  h.controller.disconnect();
  assert.equal(h.controller.speak('再见'), false);
  assert.equal(h.controller.stop(), false);
  assert.equal(sdk.destroyCount, 1);
});

test('兼容文档中的两种语音回调，旧连接回调不能改变 speaking 或新状态', async () => {
  const h = harness();
  const old = await online(h);
  old.options.onVoiceStateChange('start');
  old.options.onVoiceStateChange('start');
  old.options.onVoiceStateChange('end');
  old.options.onVoiceStateChange('voice_start');
  assert.deepEqual(h.voices, [true, false, true]);
  h.controller.disconnect();
  const sdk = await online(h);
  sdk.options.onVoiceStateChange('voice_start');
  const before = h.states.length;
  old.options.onVoiceStateChange('voice_end');
  old.options.onStatusChange(4);
  old.options.onMessage({ code: 10003, originalError: '不应泄漏' });
  old.initOptions.onDownloadProgress(1);
  assert.equal(h.states.length, before);
  assert.equal(h.voices.at(-1), true);
  assert.equal(sdk.destroyCount, 0);
  sdk.options.onVoiceStateChange('voice_end');
  assert.equal(h.voices.at(-1), false);
  h.controller.disconnect();
});

for (const phase of ['config', 'json', 'sdk', 'init']) {
  test(`在 ${phase} 阶段 disconnect 后可立即重连，旧完成或旧回调不影响新连接`, async () => {
    const gate = deferred();
    let configCalls = 0;
    let loadCalls = 0;
    let initCalls = 0;
    const h = harness({
      fetchImpl: async () => {
        const first = configCalls++ === 0;
        if (first && phase === 'config') return gate.promise;
        if (first && phase === 'json') return { ok: true, json: () => gate.promise };
        return response();
      },
      ...(phase === 'sdk' ? { loadSdk: () => loadCalls++ === 0 ? gate.promise : Promise.resolve(h.FakeAvatar) } : {}),
      init: () => initCalls++ === 0 && phase === 'init' ? gate.promise : Promise.resolve()
    });
    const oldPending = h.controller.connect();
    await flush();
    const old = h.instances[0];
    h.controller.disconnect();
    assert.equal((await oldPending).status, 'disconnected');
    assert.equal(h.requests[0][1].signal.aborted, true);
    if (old) assert.equal(old.destroyCount, 1);
    const fresh = await online(h);
    if (phase === 'config') gate.resolve(response());
    else if (phase === 'json') gate.resolve(config());
    else if (phase === 'sdk') gate.resolve(h.FakeAvatar);
    else gate.reject(new Error('旧初始化失败：test-local-token'));
    await flush();
    if (old) {
      old.options.onStatusChange(0);
      old.options.onMessage({ code: 50004 });
      old.initOptions.onDownloadProgress(100);
    }
    assert.equal(h.controller.getState().status, 'ready');
    assert.equal(fresh.destroyCount, 0);
    assert.equal(h.instances.length, phase === 'init' ? 2 : 1);
    assert.equal(h.time.size, 0);
    h.controller.disconnect();
  });
}

for (const phase of ['config', 'sdk', 'init']) {
  test(`${phase} 阶段连接总超时 30 秒后释放，可重试且忽略旧结果`, async () => {
    const gate = deferred();
    let requests = 0;
    let loads = 0;
    let inits = 0;
    const h = harness({
      fetchImpl: async () => requests++ === 0 && phase === 'config' ? gate.promise : response(),
      ...(phase === 'sdk' ? { loadSdk: () => loads++ === 0 ? gate.promise : Promise.resolve(h.FakeAvatar) } : {}),
      init: () => inits++ === 0 && phase === 'init' ? gate.promise : Promise.resolve()
    });
    const pending = h.controller.connect();
    await flush();
    h.time.tick(29999);
    assert.equal(h.controller.getState().status, 'connecting');
    h.time.tick(1);
    assert.equal((await pending).detail, '数字人连接超时，请重试。');
    assert.equal(h.requests[0][1].signal.aborted, true);
    if (phase === 'init') assert.equal(h.instances[0].destroyCount, 1);
    const fresh = await online(h);
    if (phase === 'config') gate.resolve(response());
    else if (phase === 'sdk') gate.resolve(h.FakeAvatar);
    else gate.resolve();
    await flush();
    assert.equal(h.controller.getState().status, 'ready');
    assert.equal(fresh.destroyCount, 0);
    h.controller.disconnect();
  });
}

test('init 拒绝或抛出时销毁实例，错误及 token 不出现在状态或日志', async () => {
  for (const init of [() => Promise.reject(new Error('真实错误：test-local-token')), () => { throw new Error('真实错误：test-local-token'); }]) {
    const h = harness({ init });
    assert.equal((await h.controller.connect()).status, 'error');
    assert.equal(h.instances[0].destroyCount, 1);
    assert.equal(h.time.size, 0);
    assert.equal(JSON.stringify(h.states).includes('test-local-token'), false);
    assert.deepEqual(h.logs, []);
  }
});

test('配置网络错误、JSON 错误、SDK 构造错误和加载错误仅显示固定中文信息', async () => {
  const error = new Error('test-local-token：禁止公开');
  for (const options of [
    { fetchImpl: async () => { throw error; } },
    { fetchImpl: async () => ({ ok: true, json: async () => { throw error; } }) },
    { SDKClass: class { constructor() { throw error; } } },
    { loadSdk: async () => { throw error; } },
    { loadSdk: async () => ({}) }
  ]) {
    const h = harness(options);
    assert.equal((await h.controller.connect()).status, 'error');
    assert.equal(JSON.stringify(h.states).includes('test-local-token'), false);
    assert.deepEqual(h.logs, []);
    assert.equal(h.time.size, 0);
  }
});

test('SDK 错误消息和非在线状态释放连接，网络恢复通知不能假报 ready', async () => {
  for (const code of [10001, 10005, 30004, 40006, 50001, 50004]) {
    const h = harness();
    const sdk = await online(h);
    sdk.options.onMessage({ code, message: 'test-local-token', originalError: 'test-local-token' });
    assert.equal(h.controller.getState().status, 'error');
    assert.equal(sdk.destroyCount, 1);
    assert.equal(JSON.stringify(h.states).includes('test-local-token'), false);
  }
  for (const status of [1, 3, 4, 5, 7]) {
    const h = harness();
    const sdk = await online(h);
    sdk.options.onStatusChange(status);
    assert.equal(h.controller.getState().status, 'error');
    assert.equal(sdk.destroyCount, 1);
    sdk.options.onStatusChange(0);
    assert.equal(h.controller.getState().status, 'error');
  }
  const h = harness();
  const pending = h.controller.connect();
  await flush();
  for (const code of [50002, 50003]) h.instances[0].options.onMessage({ code });
  for (const status of [2, 6, '0', { status: 0 }]) h.instances[0].options.onStatusChange(status);
  assert.equal(h.controller.getState().status, 'connecting');
  h.controller.disconnect();
  await pending;
});

test('构造器同步错误回调也会销毁旧实例，不能调用其 init', async () => {
  let destroyed = 0;
  const h = harness({ SDKClass: class {
    constructor(options) { options.onMessage({ code: 10003 }); }
    init() { assert.fail('错误连接不应初始化'); }
    destroy() { destroyed++; }
  } });
  assert.equal((await h.controller.connect()).status, 'error');
  await flush();
  assert.equal(destroyed, 1);
});

test('destroy 抛出或拒绝不影响断开和重连，重复 disconnect 不重复销毁', async () => {
  for (const destroy of [() => { throw new Error('销毁失败'); }, () => Promise.reject(new Error('销毁失败'))]) {
    const h = harness();
    const sdk = await online(h);
    let count = 0;
    sdk.destroy = () => { count++; return destroy(); };
    h.controller.disconnect();
    h.controller.disconnect();
    await flush();
    assert.equal(count, 1);
    assert.equal(h.controller.getState().status, 'disconnected');
    await online(h);
    h.controller.disconnect();
  }
});

test('speak 和 stop 失败会释放连接，异步旧命令错误不伤害新连接', async () => {
  for (const method of ['speak', 'interactiveidle']) {
    const h = harness();
    const sdk = await online(h);
    sdk[method] = () => { throw new Error('test-local-token'); };
    assert.equal(method === 'speak' ? h.controller.speak('测试') : h.controller.stop(), false);
    assert.equal(h.controller.getState().status, 'error');
    assert.equal(sdk.destroyCount, 1);
  }
  const gate = deferred();
  const h = harness();
  const old = await online(h);
  old.speak = () => gate.promise;
  h.controller.speak('测试');
  h.controller.disconnect();
  const fresh = await online(h);
  gate.reject(new Error('旧命令错误'));
  await flush();
  assert.equal(h.controller.getState().status, 'ready');
  assert.equal(fresh.destroyCount, 0);
  fresh.speak = () => Promise.reject(new Error('当前命令错误'));
  h.controller.speak('再次测试');
  await flush();
  assert.equal(h.controller.getState().status, 'error');
  assert.equal(fresh.destroyCount, 1);
});

test('界面回调抛出和 getState 快照修改不能破坏控制器及释放流程', async () => {
  const h = harness({ onState() { throw new Error('界面错误'); }, onSpeaking() { throw new Error('语音界面错误'); } });
  const sdk = await online(h);
  const snapshot = h.controller.getState();
  snapshot.status = 'error';
  assert.equal(h.controller.getState().status, 'ready');
  sdk.options.onVoiceStateChange('start');
  h.controller.disconnect();
  assert.equal(sdk.destroyCount, 1);
  assert.equal(h.controller.getState().status, 'disconnected');
});

test('SDK 脚本懒加载去重，使用官方 URL，成功清除超时且复用全局类', async () => {
  const dom = documentMock();
  const h = environment({ document: dom.document });
  assert.equal(dom.scripts.length, 0);
  const pending = h.api.loadSdk();
  assert.strictEqual(h.api.loadSdk(), pending);
  assert.equal(dom.scripts.length, 1);
  assert.equal(dom.scripts[0].src, 'https://media.xingyun3d.com/xingyun3d/general/litesdk/xmovAvatar@latest.js');
  assert.equal(dom.scripts[0].async, true);
  class SDK {}
  h.window.XmovAvatar = SDK;
  dom.scripts[0].onload();
  assert.strictEqual(await pending, SDK);
  assert.strictEqual(await h.api.loadSdk(), SDK);
  assert.equal(h.time.size, 0);
  assert.equal(dom.scripts.length, 1);
});

test('SDK 加载 25 秒超时，清理失败脚本且允许重试，迟到事件不会影响重试', async () => {
  const dom = documentMock();
  const h = environment({ document: dom.document });
  const pending = h.api.loadSdk();
  const rejected = assert.rejects(pending, { message: '数字人组件加载超时，请重试。' });
  const lateLoad = dom.scripts[0].onload;
  h.time.tick(24999);
  assert.equal(dom.scripts[0].removed, false);
  h.time.tick(1);
  await rejected;
  assert.equal(dom.scripts[0].removed, true);
  const retry = h.api.loadSdk();
  assert.equal(dom.scripts.length, 2);
  lateLoad();
  assert.equal(h.time.size, 1);
  class SDK {}
  h.window.XmovAvatar = SDK;
  dom.scripts[1].onload();
  assert.strictEqual(await retry, SDK);
  assert.equal(h.time.size, 0);
});

test('SDK 网络失败、脚本无导出、DOM 缺失和插入异常都可安全失败', async () => {
  for (const event of ['onerror', 'onload']) {
    const dom = documentMock();
    const h = environment({ document: dom.document });
    const pending = h.api.loadSdk();
    const rejected = assert.rejects(pending, { message: '数字人组件加载失败，请重试。' });
    dom.scripts[0][event]();
    await rejected;
    assert.equal(dom.scripts[0].removed, true);
    assert.equal(h.time.size, 0);
  }
  const absent = environment();
  await assert.rejects(absent.api.loadSdk(), { message: '数字人组件加载失败，请重试。' });
  const dom = documentMock();
  dom.document.head.appendChild = () => { throw new Error('DOM 异常'); };
  const broken = environment({ document: dom.document });
  await assert.rejects(broken.api.loadSdk(), { message: '数字人组件加载失败，请重试。' });
  assert.equal(broken.time.size, 0);
});

test('默认脚本加载超时通过控制器显示明确中文，之后仍可重试', async () => {
  const dom = documentMock();
  const h = environment({ document: dom.document, fetch: async () => response() });
  const controller = h.api.createController();
  const pending = controller.connect();
  await flush();
  h.time.tick(25000);
  assert.equal((await pending).detail, '数字人组件加载超时，请重试。');
  assert.equal(h.time.size, 0);
  const retry = controller.connect();
  await flush();
  assert.equal(dom.scripts.length, 2);
  controller.disconnect();
  assert.equal((await retry).status, 'disconnected');
  h.time.tick(25000);
  await flush();
  assert.equal(controller.getState().status, 'disconnected');
});
