(function (root) {
  'use strict';

  const SDK_URL = 'https://media.xingyun3d.com/xingyun3d/general/litesdk/xmovAvatar@latest.js';
  const CONNECT_TIMEOUT = 30000;
  const SCRIPT_TIMEOUT = 25000;
  const DETAILS = {
    disconnected: '数字人未连接。',
    connecting: '正在连接数字人。',
    loading: '正在加载数字人资源。',
    confirming: '资源已加载，正在确认连接。',
    ready: '数字人已连接。',
    unconfigured: '数字人服务尚未配置，请配置后重试。',
    error: '数字人连接失败，请重试。',
    closed: '数字人连接已断开，请重试。',
    offline: '数字人处于离线模式，循环播放缓存视频，不消耗积分。',
    timeout: '数字人连接超时，请重试。',
    scriptError: '数字人组件加载失败，请重试。',
    scriptTimeout: '数字人组件加载超时，请重试。'
  };
  let sdkLoading = null;

  function notify(callback, value) {
    try { callback(value); } catch { /* 界面回调异常不影响会话释放。 */ }
  }

  function loadSdk() {
    if (typeof root.XmovAvatar === 'function') return Promise.resolve(root.XmovAvatar);
    if (sdkLoading) return sdkLoading;
    const pending = new Promise((resolve, reject) => {
      const document = root.document;
      if (!document || !(document.head || document.body)) {
        reject(new Error(DETAILS.scriptError));
        return;
      }
      const script = document.createElement('script');
      let settled = false;
      let timer;
      const finish = (detail) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        if (detail) {
          script.remove();
          reject(new Error(detail));
        } else {
          resolve(root.XmovAvatar);
        }
      };
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => finish(typeof root.XmovAvatar === 'function' ? null : DETAILS.scriptError);
      script.onerror = () => finish(DETAILS.scriptError);
      timer = setTimeout(() => finish(DETAILS.scriptTimeout), SCRIPT_TIMEOUT);
      try { (document.head || document.body).appendChild(script); }
      catch { finish(DETAILS.scriptError); }
    });
    sdkLoading = pending;
    const clearPending = () => { if (sdkLoading === pending) sdkLoading = null; };
    pending.then(clearPending, clearPending);
    return pending;
  }

  function createController({
    fetchImpl = (...args) => root.fetch(...args),
    SDKClass,
    loadSdk: sdkLoader = loadSdk,
    onState = () => {},
    onSpeaking = () => {},
    containerId = '#avatar-stage'
  } = {}) {
    let state = { status: 'disconnected', detail: DETAILS.disconnected };
    let current = null;
    let sequence = 0;
    let speaking = false;

    const getState = () => ({ ...state });
    const active = (attempt) => current === attempt && attempt.sequence === sequence;
    const publish = (next) => {
      state = next;
      notify(onState, getState());
    };
    const setSpeaking = (value) => {
      if (speaking === value) return;
      speaking = value;
      notify(onSpeaking, value);
    };
    const settle = (attempt, result) => {
      if (attempt.settled) return;
      attempt.settled = true;
      clearTimeout(attempt.timer);
      attempt.resolve({ ...result });
    };
    const destroy = (attempt) => {
      const sdk = attempt.sdk;
      attempt.sdk = null;
      if (!sdk) return;
      try { Promise.resolve(sdk.destroy()).catch(() => {}); }
      catch { /* 销毁失败也不能恢复已失效的连接。 */ }
    };
    const release = (attempt) => {
      clearTimeout(attempt.timer);
      attempt.abort.abort();
      destroy(attempt);
    };
    const finish = (attempt, status, detail) => {
      if (!active(attempt)) return;
      current = null;
      sequence++;
      release(attempt);
      const next = { status, detail };
      settle(attempt, next);
      publish(next);
      if (!current) setSpeaking(false);
    };
    const fail = (attempt, detail = DETAILS.error) => finish(attempt, 'error', detail);
    const maybeReady = (attempt) => {
      if (!active(attempt) || state.status !== 'connecting' || !attempt.sdk) return;
      if (!attempt.online || !(attempt.progress === 100 || attempt.initialized)) return;
      const next = { status: 'ready', detail: DETAILS.ready };
      if (attempt.progress !== undefined) next.progress = attempt.progress;
      settle(attempt, next);
      publish(next);
    };
    const watchCommand = (attempt, result) => {
      Promise.resolve(result).catch(() => { if (active(attempt)) fail(attempt); });
    };

    async function start(attempt) {
      try {
        if (!active(attempt)) return;
        const response = await fetchImpl('/api/avatar/config', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: attempt.abort.signal
        });
        if (!active(attempt)) return;
        const config = await response.json();
        if (!active(attempt)) return;
        if (config && config.configured === false) {
          finish(attempt, 'unconfigured', DETAILS.unconfigured);
          return;
        }
        if (!response.ok || !config || config.configured !== true ||
            typeof config.appId !== 'string' || !config.appId.trim() ||
            config.appSecret !== 'server-managed' || config.gatewayServer !== '/api/avatar/session' ||
            typeof config.headers?.['X-Buwan-Avatar-Token'] !== 'string' ||
            !config.headers['X-Buwan-Avatar-Token'].trim()) {
          fail(attempt);
          return;
        }
        let Avatar = SDKClass;
        if (!Avatar) {
          try { Avatar = await sdkLoader(); }
          catch (error) {
            if (active(attempt)) fail(attempt, error?.message === DETAILS.scriptTimeout ? DETAILS.scriptTimeout : DETAILS.scriptError);
            return;
          }
          Avatar = Avatar || root.XmovAvatar;
        }
        if (!active(attempt)) return;
        if (typeof Avatar !== 'function') {
          fail(attempt, DETAILS.scriptError);
          return;
        }
        attempt.sdk = new Avatar({
          containerId,
          appId: config.appId,
          appSecret: 'server-managed',
          gatewayServer: '/api/avatar/session',
          headers: { 'X-Buwan-Avatar-Token': config.headers['X-Buwan-Avatar-Token'] },
          enableLogger: false,
          onMessage(message) {
            if (!active(attempt)) return;
            const code = message?.code;
            if ((typeof code === 'number' && code >= 10000 && code < 50000) || code === 50001 || code === 50004) fail(attempt);
          },
          onStatusChange(status) {
            if (!active(attempt)) return;
            if (status === 0) {
              attempt.online = true;
              maybeReady(attempt);
            } else if ([1, 3, 4, 5, 7].includes(status)) {
              fail(attempt, DETAILS.closed);
            }
          },
          onVoiceStateChange(status) {
            if (!active(attempt) || state.status !== 'ready') return;
            if (status === 'start' || status === 'voice_start') setSpeaking(true);
            else if (status === 'end' || status === 'voice_end') setSpeaking(false);
          }
        });
        // 构造器可能同步回调失败；只销毁这个旧实例，不碰后续连接。
        if (!active(attempt)) {
          destroy(attempt);
          return;
        }
        const initialized = attempt.sdk.init({
          onDownloadProgress(progress) {
            if (!active(attempt) || state.status !== 'connecting' ||
                typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 100) return;
            attempt.progress = Math.max(attempt.progress ?? 0, progress);
            publish({
              status: 'connecting',
              detail: attempt.progress === 100 ? DETAILS.confirming : DETAILS.loading,
              progress: attempt.progress
            });
            maybeReady(attempt);
          }
        });
        if (initialized && typeof initialized.then === 'function') {
          Promise.resolve(initialized).then(() => {
            if (!active(attempt)) return;
            attempt.initialized = true;
            maybeReady(attempt);
          }, () => { if (active(attempt)) fail(attempt); });
        }
        maybeReady(attempt);
      } catch {
        if (active(attempt)) fail(attempt);
      }
    }

    function connect() {
      if (current) return current.promise;
      const attempt = {
        sequence: ++sequence,
        abort: new AbortController(),
        sdk: null,
        online: false,
        initialized: false,
        progress: undefined,
        hasSpoken: false,
        settled: false
      };
      attempt.promise = new Promise((resolve) => { attempt.resolve = resolve; });
      current = attempt;
      attempt.timer = setTimeout(() => fail(attempt, DETAILS.timeout), CONNECT_TIMEOUT);
      publish({ status: 'connecting', detail: DETAILS.connecting });
      void start(attempt);
      return attempt.promise;
    }

    function disconnect() {
      const attempt = current;
      current = null;
      sequence++;
      if (attempt) release(attempt);
      const next = { status: 'disconnected', detail: DETAILS.disconnected };
      if (attempt) settle(attempt, next);
      publish(next);
      if (!current) setSpeaking(false);
      return { ...next };
    }

    function setMode(mode) {
      const attempt = current;
      if (!attempt || !['ready', 'offline'].includes(state.status) || !['offline', 'online'].includes(mode)) return false;
      try {
        if (mode === 'offline') {
          if (state.status === 'offline') return true;
          watchCommand(attempt, attempt.sdk.offlineMode());
          if (!active(attempt)) return false;
          setSpeaking(false);
          publish({ status: 'offline', detail: DETAILS.offline });
          return true;
        }
        if (state.status === 'ready') return true;
        watchCommand(attempt, attempt.sdk.onlineMode());
        if (!active(attempt)) return false;
        publish({ status: 'ready', detail: DETAILS.ready });
        return true;
      } catch {
        fail(attempt);
        return false;
      }
    }

    function setPresence(mode) {
      const attempt = current;
      if (!attempt || state.status !== 'ready' || typeof mode !== 'string') return false;
      const methods = { idle: 'idle', listening: 'listen', thinking: 'think' };
      const method = methods[mode];
      if (!method || typeof attempt.sdk[method] !== 'function') return false;
      try { watchCommand(attempt, attempt.sdk[method]()); return active(attempt); }
      catch { fail(attempt); return false; }
    }

    function speak(text) {
      const attempt = current;
      if (!attempt || state.status !== 'ready' || typeof text !== 'string' || !text.trim()) return false;
      const plainText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      try {
        const sdk = attempt.sdk;
        if (attempt.hasSpoken) {
          watchCommand(attempt, sdk.interactiveidle());
          if (!active(attempt) || state.status !== 'ready') return false;
          setSpeaking(false);
          if (!active(attempt)) return false;
        }
        attempt.hasSpoken = true;
        watchCommand(attempt, sdk.speak(plainText, true, true));
        return active(attempt);
      } catch {
        fail(attempt);
        return false;
      }
    }

    function stop() {
      const attempt = current;
      if (!attempt || state.status !== 'ready') return false;
      try {
        watchCommand(attempt, attempt.sdk.interactiveidle());
        if (active(attempt)) setSpeaking(false);
        return active(attempt);
      } catch {
        fail(attempt);
        return false;
      }
    }

    return { connect, disconnect, speak, stop, getState, setMode, setPresence,
      setOffline(value) { return setMode(value ? 'offline' : 'online'); } };
  }

  root.BuwanAvatar = { createController, loadSdk };
})(typeof window === 'undefined' ? globalThis : window);
