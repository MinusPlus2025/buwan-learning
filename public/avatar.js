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

  // 覆盖控制台 anchor：星云应用配置里的 SetCharacterCanvasAnchor 面向固定容器比例，
  // 在比例不同的舞台上会把竖幅全身形象裁成窄条。改用 SDK 的 layout 接口，按舞台实际
  // 尺寸计算 cover 缩放，形象居中、不变形；舞台尺寸变化（含取消隐藏）时重新计算。
  function applyStageLayout(attempt) {
    const sdk = attempt && attempt.sdk;
    const stage = queryStage();
    if (!sdk || !stage) return;
    const canvas = stage.querySelector('canvas');
    const baseW = (canvas && canvas.width) || 1080;
    const baseH = (canvas && canvas.height) || 1920;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.max(rect.width / baseW, rect.height / baseH);
    const layout = { avatar: { h_align: 'center', v_align: 'center', scale } };
    try {
      if (typeof sdk.changeLayout === 'function') sdk.changeLayout(layout);
      else if (typeof sdk.setCharacterCanvasLayout === 'function') sdk.setCharacterCanvasLayout(layout);
    } catch { /* 布局覆盖失败时退回控制台 anchor，不影响连接本身。 */ }
  }
  let stageObserver = null;
  // 舞台元素查询统一走这里：测试或极端环境下 document 可能没有 querySelector。
  function queryStage() {
    const document = root.document;
    if (!document || typeof document.querySelector !== 'function') return null;
    return document.querySelector('#avatar-stage');
  }
  function observeStage(getAttempt) {
    const stage = queryStage();
    if (!stage || stageObserver || typeof root.ResizeObserver !== 'function') return;
    stageObserver = new root.ResizeObserver(() => { const attempt = getAttempt(); if (attempt) applyStageLayout(attempt); });
    stageObserver.observe(stage);
  }

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

  // 直连会话架构：星云后端依据请求的 TLS/HTTP 特征判定客户端类型，由服务端代建会话会被
  // 归类为后端客户端而拒绝 WebSocket 接入（SOCKET_QUIT ttsa_backend_lite）。故拦截 SDK
  // 对网关的会话请求：先用服务端签发的签名头从浏览器直连星云建会话，再把响应中的阿里云
  // 资源地址改写成本地代理路径。App Secret 始终只在服务端，不下发浏览器。
  const ASSET_ORIGIN = 'https://public-xmov.oss-cn-hangzhou.aliyuncs.com/';
  const ASSET_PREFIX = '/api/avatar/asset/';
  let directSessionHooked = false;
  let directSessionToken = null;
  function rewriteAssetUrls(value) {
    if (typeof value === 'string') {
      return value.indexOf(ASSET_ORIGIN) === 0 ? ASSET_PREFIX + value.slice(ASSET_ORIGIN.length) : value;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = rewriteAssetUrls(value[i]);
      return value;
    }
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) value[key] = rewriteAssetUrls(value[key]);
      return value;
    }
    return value;
  }
  function installDirectSession(config) {
    const originalFetch = root.fetch;
    if (typeof originalFetch !== 'function') return;
    const gatewayPath = config && config.gatewayServer;
    const sessionToken = config && config.headers && config.headers['X-Buwan-Avatar-Token'];
    if (typeof gatewayPath !== 'string' || typeof sessionToken !== 'string' || !sessionToken) return;
    // 每次拿到新配置都更新 token：离线切回在线等场景会重建会话，旧 token 已被服务端回收。
    directSessionToken = sessionToken;
    if (directSessionHooked) return;
    directSessionHooked = true;
    const authHeaders = () => ({ 'Content-Type': 'application/json', 'X-Buwan-Avatar-Token': directSessionToken });
    root.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String((init && init.method) || 'GET').toUpperCase();
      if (url !== gatewayPath || method !== 'POST') return originalFetch(input, init);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const signResponse = await originalFetch('/api/avatar/sign', {
            method: 'POST',
            credentials: 'same-origin',
            headers: authHeaders(),
            body: init && init.body
          });
          if (signResponse.ok) {
            const signed = await signResponse.json();
            if (signed && typeof signed.url === 'string' && signed.headers && typeof signed.body === 'string') {
              const direct = await originalFetch(signed.url, {
                method: 'POST',
                credentials: 'omit',
                headers: { ...signed.headers, 'Content-Type': 'application/json' },
                body: signed.body
              });
              const payload = await direct.json().catch(() => null);
              if (payload && typeof payload === 'object') {
                rewriteAssetUrls(payload);
                const sessionId = payload && payload.data && payload.data.session_id;
                if (direct.ok && typeof sessionId === 'string' && sessionId) {
                  void originalFetch('/api/avatar/activated', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: authHeaders(),
                    body: JSON.stringify({ request_id: signed.requestId, session_id: sessionId })
                  }).catch(() => {});
                }
                return new Response(JSON.stringify(payload), {
                  status: direct.status,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
          } else if (signResponse.status === 403 && attempt === 0) {
            // 连接凭证已被服务端回收（离线模式停止会话后重连即此场景）：换取新凭证再试一次。
            const configResponse = await originalFetch('/api/avatar/config', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            });
            if (configResponse.ok) {
              const fresh = await configResponse.json().catch(() => null);
              const freshToken = fresh && fresh.headers && fresh.headers['X-Buwan-Avatar-Token'];
              if (typeof freshToken === 'string' && freshToken) { directSessionToken = freshToken; continue; }
            }
          }
        } catch { /* 签名或直连失败时落入服务端代理兜底。 */ }
        break;
      }
      return originalFetch(gatewayPath, init);
    };
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
    observeStage(() => current);

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
      applyStageLayout(attempt);
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
        installDirectSession(config);
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
            } else if (status === 4 || status === 7) {
              // 仅 close(4) 与 stopped(7) 是终态；offline(1)/network_off(3)/visible(5)/invisible(6) 均为正常状态
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
        // 重连会重建会话与渲染资源，延迟重排一次确保布局覆盖仍然生效。
        setTimeout(() => { if (active(attempt)) applyStageLayout(attempt); }, 800);
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
