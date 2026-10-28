/**
 * Smile Video Call (微笑視訊) - 多角色、即時通訊與自動接聽系統
 */

class SmileVideoCallApp {
  constructor() {
    this.config = this.loadConfig();
    this.currentRole = this.detectRole();
    this.currentCallApi = null;
    this.wakeLock = null;
    this.audioCtx = null;
    this.ringInterval = null;
    this.connectingTimeout = null;
    this.eventSource = null;
    this.incomingCountdownTimer = null;
    this.currentIncomingPayload = null;

    this.dom = {
      appTitle: document.getElementById("app-title"),
      appSubtitle: document.getElementById("app-subtitle"),
      currentRoleName: document.getElementById("current-role-name"),
      clockTime: document.getElementById("clock-time"),
      clockDate: document.getElementById("clock-date"),
      contactsGrid: document.getElementById("contacts-grid"),
      homeView: document.getElementById("home-view"),
      callView: document.getElementById("call-view"),
      jitsiContainer: document.getElementById("jitsi-container"),
      connectingOverlay: document.getElementById("connecting-overlay"),
      connectingAvatar: document.getElementById("connecting-avatar"),
      connectingName: document.getElementById("connecting-name"),
      btnCancelCall: document.getElementById("btn-cancel-call"),
      btnFloatingHangup: document.getElementById("btn-floating-hangup"),
      btnSwitchRole: document.getElementById("btn-switch-role"),
      btnForceReload: document.getElementById("btn-force-reload"),
      roleModal: document.getElementById("role-modal"),
      btnCloseRoleModal: document.getElementById("btn-close-role-modal"),
      btnOpenSettings: document.getElementById("btn-open-settings"),
      settingsModal: document.getElementById("settings-modal"),
      btnCloseSettings: document.getElementById("btn-close-settings"),
      btnSaveSettings: document.getElementById("btn-save-settings"),
      statusDot: document.getElementById("status-dot"),
      connectionStatus: document.getElementById("connection-status"),
      // 來電與自動接聽元件
      incomingOverlay: document.getElementById("incoming-call-overlay"),
      incomingAvatar: document.getElementById("incoming-avatar"),
      incomingTitle: document.getElementById("incoming-title"),
      incomingCountdownNum: document.getElementById("incoming-countdown-num"),
      btnAnswerCall: document.getElementById("btn-answer-call"),
      btnDeclineCall: document.getElementById("btn-decline-call"),
      btnTestIncoming: document.getElementById("btn-test-incoming")
    };

    this.init();
  }

  // ==========================================
  // 初始化
  // ==========================================
  init() {
    this.initClock();
    this.renderCurrentRoleView();
    this.bindEvents();
    this.requestWakeLock();
    this.registerServiceWorker();
    this.requestWebNotificationPermission();
    this.startIncomingCallListener();
  }

  // 偵測目前身分（優先順序：URL ?u=xxx > 本機快取 > 預設阿笑）
  detectRole() {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get("u") || params.get("user");
    if (urlRole && this.config.roles[urlRole]) {
      localStorage.setItem("smile_call_current_role", urlRole);
      return urlRole;
    }

    const savedRole = localStorage.getItem("smile_call_current_role");
    if (savedRole && this.config.roles[savedRole]) {
      return savedRole;
    }

    return "axiao";
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem("smile_call_config_v4");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("無法讀取本機設定，改用預設設定", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  saveConfig(newConfig) {
    this.config = newConfig;
    localStorage.setItem("smile_call_config_v4", JSON.stringify(newConfig));
    this.renderCurrentRoleView();
  }

  switchRole(roleId) {
    if (!this.config.roles[roleId]) return;
    this.currentRole = roleId;
    localStorage.setItem("smile_call_current_role", roleId);

    const newUrl = new URL(window.location);
    newUrl.searchParams.set("u", roleId);
    window.history.replaceState({}, "", newUrl);

    this.renderCurrentRoleView();
    this.dom.roleModal.classList.add("hidden");
    this.startIncomingCallListener();
  }

  // ==========================================
  // 強制重新整理（專門解決 PWA 應用更新難的問題）
  // ==========================================
  async forceReload() {
    this.dom.btnForceReload.textContent = "🔄 更新中...";
    this.dom.btnForceReload.disabled = true;

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        for (let name of cacheNames) {
          await caches.delete(name);
        }
      }
    } catch (e) {
      console.warn("清除快取時略過錯誤:", e);
    }

    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set("_t", Date.now());
    window.location.replace(reloadUrl.toString());
  }

  // ==========================================
  // 時鐘與日期更新
  // ==========================================
  initClock() {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      this.dom.clockTime.textContent = `${hours}:${minutes}`;

      const months = now.getMonth() + 1;
      const date = now.getDate();
      const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      const day = days[now.getDay()];
      this.dom.clockDate.textContent = `${months}月${date}日 ${day}`;
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  // ==========================================
  // 音效合成（Web Audio API）
  // ==========================================
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playTapSound() {
    try {
      const ctx = this.getAudioContext();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.35);
      });
    } catch (e) {}
  }

  startRingingSound() {
    this.stopRingingSound();

    // 震動支援
    if ("vibrate" in navigator) {
      try { navigator.vibrate([500, 250, 500, 250, 1000]); } catch (e) {}
    }

    const playRing = () => {
      try {
        const ctx = this.getAudioContext();
        if (ctx.state === "suspended") ctx.resume();

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 1.2);
        osc2.stop(ctx.currentTime + 1.2);
      } catch (e) {}
    };

    playRing();
    this.ringInterval = setInterval(playRing, 2800);
  }

  stopRingingSound() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // ==========================================
  // 即時來電監聽（長輩平板端：支援自動接聽）
  // ==========================================
  startIncomingCallListener() {
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (e) {}
      this.eventSource = null;
    }

    if (this.currentRole !== "axiao") {
      if (this.dom.connectionStatus) {
        this.dom.connectionStatus.textContent = `身分：${this.config.roles[this.currentRole]?.name}（隨時可撥打媽媽）`;
        this.dom.statusDot.style.backgroundColor = "#2563eb";
      }
      return;
    }

    const topic = this.config.signalTopic || "smile-axiao-call-78vince";
    const sseUrl = `https://ntfy.sh/${topic}/sse`;

    if (this.dom.connectionStatus) {
      this.dom.connectionStatus.textContent = "自動接聽通道連線中...";
      this.dom.statusDot.style.backgroundColor = "#eab308";
    }

    try {
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        if (this.dom.connectionStatus) {
          this.dom.connectionStatus.textContent = "● 平板自動接聽已就緒（阿笑）";
          this.dom.statusDot.style.backgroundColor = "#16a34a";
        }
      };

      this.eventSource.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (!raw.message) return;
          const payload = JSON.parse(raw.message);

          if (payload.action === "call" && (payload.target === "axiao" || payload.target === this.currentRole)) {
            this.handleIncomingCall(payload);
          } else if (payload.action === "cancel") {
            this.handleCancelIncomingCall();
          }
        } catch (err) {}
      };

      this.eventSource.onerror = () => {
        if (this.dom.connectionStatus) {
          this.dom.connectionStatus.textContent = "自動接聽斷線，重新連線中...";
          this.dom.statusDot.style.backgroundColor = "#eab308";
        }
        setTimeout(() => this.startIncomingCallListener(), 4000);
      };
    } catch (e) {
      console.warn("無法啟動即時來電監聽:", e);
    }
  }

  // 當晚輩打來時觸發（長輩平板畫面）
  handleIncomingCall(payload) {
    // 若長輩正在舊通話中，先優雅掛斷舊連線，避免出現雙重分身
    if (this.currentCallApi) {
      try { this.currentCallApi.executeCommand("hangup"); } catch (e) {}
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }

    this.currentIncomingPayload = payload;
    this.dom.incomingAvatar.src = payload.avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=" + payload.callerId;
    this.dom.incomingTitle.textContent = `👦 ${payload.callerName} 來電中...`;

    // 顯示來電全螢幕並播放鈴聲
    this.dom.incomingOverlay.classList.remove("hidden");
    this.startRingingSound();
    this.requestWakeLock();

    // 倒數自動接聽（預設 5 秒）
    let secondsLeft = this.config.autoAnswerDelaySeconds || 5;
    this.dom.incomingCountdownNum.textContent = secondsLeft;

    if (this.incomingCountdownTimer) clearInterval(this.incomingCountdownTimer);

    this.incomingCountdownTimer = setInterval(() => {
      secondsLeft--;
      this.dom.incomingCountdownNum.textContent = secondsLeft;

      if (secondsLeft <= 0) {
        clearInterval(this.incomingCountdownTimer);
        this.incomingCountdownTimer = null;
        this.answerIncomingCall();
      }
    }, 1000);
  }

  // 接聽來電
  answerIncomingCall() {
    if (this.incomingCountdownTimer) {
      clearInterval(this.incomingCountdownTimer);
      this.incomingCountdownTimer = null;
    }
    this.stopRingingSound();
    this.dom.incomingOverlay.classList.add("hidden");

    if (!this.currentIncomingPayload) return;

    const payload = this.currentIncomingPayload;
    this.currentIncomingPayload = null;

    this.joinConferenceRoom(payload.roomName, payload.callerName);
  }

  // 拒絕或取消來電
  handleCancelIncomingCall() {
    if (this.incomingCountdownTimer) {
      clearInterval(this.incomingCountdownTimer);
      this.incomingCountdownTimer = null;
    }
    this.stopRingingSound();
    this.dom.incomingOverlay.classList.add("hidden");
    this.currentIncomingPayload = null;
  }

  // 發送信號通知長輩平板來電
  async sendIncomingSignalToSenior(roomName, myRoleData) {
    const topic = this.config.signalTopic || "smile-axiao-call-78vince";
    const signalUrl = `https://ntfy.sh/${topic}`;

    const payload = {
      action: "call",
      callerId: myRoleData.id,
      callerName: myRoleData.name,
      target: "axiao",
      roomName: roomName,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${myRoleData.id}&backgroundColor=b6e3f4`
    };

    try {
      await fetch(signalUrl, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      console.log("已發送即時呼叫信號至 ntfy.sh");
    } catch (e) {
      console.warn("發送即時呼叫信號略過錯誤:", e);
    }
  }

  // ==========================================
  // 畫面渲染：根據目前身分動態產生
  // ==========================================
  renderCurrentRoleView() {
    const roleData = this.config.roles[this.currentRole] || this.config.roles.axiao;

    this.dom.appTitle.textContent = roleData.appTitle;
    this.dom.appSubtitle.textContent = roleData.welcomeSubtitle;
    this.dom.currentRoleName.textContent = roleData.name;
    document.title = `${roleData.appTitle} - 微笑視訊`;

    this.dom.contactsGrid.innerHTML = "";

    roleData.contacts.forEach((contact) => {
      const card = document.createElement("button");
      card.className = "contact-card";
      card.style.borderColor = contact.accentColor || "#e2e8f0";

      card.innerHTML = `
        <div class="contact-avatar-wrapper">
          <img class="contact-avatar" src="${contact.avatarUrl}" alt="${contact.name}" loading="lazy">
          <div class="badge-video-icon" style="background-color: ${contact.accentColor || '#16a34a'}">📹</div>
        </div>
        <div class="contact-name">${contact.name}</div>
        <div class="contact-action-hint">點我通話</div>
      `;

      card.addEventListener("click", () => {
        this.playTapSound();
        this.startCall(contact, roleData);
      });

      this.dom.contactsGrid.appendChild(card);
    });
  }

  // ==========================================
  // 發起視訊通話
  // ==========================================
  startCall(contact, myRoleData) {
    const roomName = contact.roomName;
    const roomUrl = `https://${this.config.jitsiDomain}/${roomName}`;

    // 1. 切換至視訊主畫面
    this.dom.homeView.classList.add("hidden");
    this.dom.callView.classList.remove("hidden");

    // 2. 顯示撥號等待畫面
    this.dom.connectingAvatar.src = contact.avatarUrl;
    this.dom.connectingName.textContent = `正在連線 ${contact.name}...`;
    this.dom.connectingOverlay.classList.remove("hidden");
    this.startRingingSound();

    // 3. 如果晚輩撥打給阿笑媽媽，發送「即時信號」通知長輩平板自動接聽！
    if (contact.id === "axiao" || this.currentRole !== "axiao") {
      this.sendIncomingSignalToSenior(roomName, myRoleData);
    }

    // 4. 發送手機 LINE / Discord Webhook 通知
    this.sendNotification(contact, myRoleData, roomUrl);

    // 5. 啟動視訊連線
    this.joinConferenceRoom(roomName, contact.name);
  }

  // 進入 Jitsi 視訊會議
  joinConferenceRoom(roomName, peerName) {
    this.requestWakeLock();

    // 若有未清理乾淨的舊連線，先通知伺服器離線，消滅「幽靈媽媽分身」
    if (this.currentCallApi) {
      try { this.currentCallApi.executeCommand("hangup"); } catch (e) {}
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }

    this.dom.jitsiContainer.innerHTML = "";
    this.dom.homeView.classList.add("hidden");
    this.dom.callView.classList.remove("hidden");

    const myDisplayName = this.config.roles[this.currentRole]?.name || "家庭成員";
    const options = {
      roomName: roomName,
      width: "100%",
      height: "100%",
      parentNode: this.dom.jitsiContainer,
      userInfo: {
        displayName: myDisplayName
      },
      configOverwrite: {
        prejoinConfig: { enabled: false },
        prejoinPageEnabled: false,
        enableInsecureRoomNameWarning: false,
        requireDisplayName: false,
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking: true,
        enableWelcomePage: false,
        enableClosePage: false,
        disableInviteFunctions: true,
        notifications: []
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: ["microphone", "camera", "hangup"],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_REMOTE_DISPLAY_NAME: peerName
      }
    };

    try {
      this.currentCallApi = new JitsiMeetExternalAPI(this.config.jitsiDomain, options);

      this.connectingTimeout = setTimeout(() => {
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      }, 3000);

      this.currentCallApi.addEventListener("videoConferenceJoined", () => {
        if (this.connectingTimeout) clearTimeout(this.connectingTimeout);
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      });

      // 當伺服器確認已離開房間時
      this.currentCallApi.addEventListener("videoConferenceLeft", () => {
        this.endCall();
      });
      this.currentCallApi.addEventListener("readyToClose", () => {
        this.endCall();
      });
    } catch (err) {
      console.error("載入 Jitsi 失敗:", err);
      alert("無法啟動視訊，請檢查網路連線。");
      this.endCall();
    }
  }

  // 掛斷電話（優雅掛斷：先送出 hangup 封包，等伺服器確認後再清空 DOM，徹底消滅幽靈分身）
  hangupCall() {
    if (this.currentCallApi) {
      try {
        this.currentCallApi.executeCommand("hangup");
      } catch (e) {}

      // 保險：延遲 600ms 確保封包傳遞完成後清理 DOM
      setTimeout(() => {
        this.endCall();
      }, 600);
    } else {
      this.endCall();
    }
  }

  // 結束通話畫面清理
  endCall() {
    if (this.connectingTimeout) {
      clearTimeout(this.connectingTimeout);
      this.connectingTimeout = null;
    }
    this.stopRingingSound();
    this.dom.connectingOverlay.classList.add("hidden");

    if (this.currentCallApi) {
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }

    this.dom.jitsiContainer.innerHTML = "";
    this.dom.callView.classList.add("hidden");
    this.dom.homeView.classList.remove("hidden");
  }

  // ==========================================
  // 發送手機推播通知（同時支援 Discord 與 LINE GAS）
  // ==========================================
  async sendNotification(contact, callerRole, roomUrl) {
    const webhookUrl = contact.webhookUrl || this.config.defaultWebhookUrl;
    if (!webhookUrl) return;

    const callerName = callerRole.name;
    const targetName = contact.name;
    const msg = `📢 **【微笑視訊通知】**\n**${callerName}** 正在呼叫 **${targetName}**！\n👉 請點擊連結進入視訊：${roomUrl}`;

    try {
      if (webhookUrl.includes("script.google.com")) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            content: `📢【微笑視訊】${callerName} 正在呼叫 ${targetName}！\n👉 點此加入通話：${roomUrl}`,
            caller: callerName,
            target: targetName,
            roomUrl: roomUrl
          })
        });
      } else {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: msg })
        });
      }
    } catch (err) {
      console.warn("通知發送略過:", err);
    }

    this.sendBrowserNotification(`${callerName} 正在撥打視訊`, `通話對象：${targetName}，點擊加入！`, roomUrl);
  }

  requestWebNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  sendBrowserNotification(title, body, url) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const notif = new Notification(title, {
          body: body,
          icon: "icons/icon-192.png"
        });
        notif.onclick = () => {
          window.focus();
          if (url) window.location.href = url;
        };
      } catch (e) {}
    }
  }

  async requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch (err) {}
    }
  }

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  // ==========================================
  // 事件綁定
  // ==========================================
  bindEvents() {
    // 強制重新載入按鈕
    this.dom.btnForceReload.addEventListener("click", () => this.forceReload());

    // 來電手動接聽 / 拒絕
    this.dom.btnAnswerCall.addEventListener("click", () => this.answerIncomingCall());
    this.dom.btnDeclineCall.addEventListener("click", () => this.handleCancelIncomingCall());

    // 取消撥號
    this.dom.btnCancelCall.addEventListener("click", () => this.hangupCall());

    // 懸浮大掛斷鍵（優雅掛斷）
    this.dom.btnFloatingHangup.addEventListener("click", () => {
      this.hangupCall();
    });

    // 瀏覽器關閉或刷新時，主動通知 Jitsi 伺服器掛斷，避免留下幽靈分身
    window.addEventListener("beforeunload", () => {
      if (this.currentCallApi) {
        try { this.currentCallApi.executeCommand("hangup"); } catch (e) {}
      }
    });
    window.addEventListener("pagehide", () => {
      if (this.currentCallApi) {
        try { this.currentCallApi.executeCommand("hangup"); } catch (e) {}
      }
    });

    // 任何觸控嘗試獲取 AudioContext
    document.body.addEventListener("touchstart", () => this.getAudioContext(), { once: true });
    document.body.addEventListener("click", () => this.getAudioContext(), { once: true });

    // 切換角色 Modal
    this.dom.btnSwitchRole.addEventListener("click", () => {
      this.dom.roleModal.classList.remove("hidden");
    });

    this.dom.btnCloseRoleModal.addEventListener("click", () => {
      this.dom.roleModal.classList.add("hidden");
    });

    document.querySelectorAll(".role-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.getAttribute("data-role");
        this.switchRole(role);
      });
    });

    // 後台設定 Modal
    this.dom.btnOpenSettings.addEventListener("click", () => this.openSettingsModal());
    this.dom.btnCloseSettings.addEventListener("click", () => this.closeSettingsModal());
    this.dom.btnSaveSettings.addEventListener("click", () => this.saveSettingsFromModal());

    // 設定分頁切換
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.getAttribute("data-tab");
        document.getElementById(targetId).classList.add("active");
      });
    });

    // 模擬測試自動接聽來電按鈕（可直接在平板上驗證來電鈴聲與 5 秒接聽流程）
    if (this.dom.btnTestIncoming) {
      this.dom.btnTestIncoming.addEventListener("click", () => {
        this.closeSettingsModal();
        this.handleIncomingCall({
          callerId: "ali",
          callerName: "阿禮 (測試來電)",
          target: "axiao",
          roomName: "smile-axiao-ali",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=ali&backgroundColor=b6e3f4"
        });
      });
    }

    // 個別測試通知按鈕
    document.querySelectorAll(".btn-test-single").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = btn.getAttribute("data-target");
        const input = document.getElementById(`cfg-webhook-${target}`);
        const url = input.value.trim();
        if (!url) {
          alert(`請先貼上 ${target} 的 Webhook / GAS 網址！`);
          return;
        }

        btn.textContent = "發送中...";
        btn.disabled = true;

        try {
          if (url.includes("script.google.com")) {
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({
                content: `🔔【微笑視訊測試】發送給【${target}】的 LINE 測試通知！連線完全正常。`
              })
            });
            alert(`✅ 已向 Google Apps Script 發送 LINE 測試通知！請檢查手機 LINE。記得按儲存！`);
            btn.textContent = "✅ 已發送";
          } else {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: `🔔【微笑視訊測試】發送給【${target}】的 Discord 測試通知！連線完全正常。`
              })
            });
            if (res.ok) {
              alert(`✅ 成功發送測試通知給 ${target}！請查看 Discord。記得按儲存！`);
              btn.textContent = "✅ 發送成功";
            } else {
              alert("❌ 發送失敗，請確認網址正確");
              btn.textContent = "❌ 失敗";
            }
          }
        } catch (e) {
          alert("❌ 發送失敗: " + e.message);
          btn.textContent = "❌ 失敗";
        }

        setTimeout(() => {
          btn.textContent = `🔔 測試通知`;
          btn.disabled = false;
        }, 3000);
      });
    });

    // 測試聲音
    document.getElementById("btn-test-sound").addEventListener("click", () => {
      this.playTapSound();
    });

    // 喚醒鎖定
    document.getElementById("btn-request-wakelock").addEventListener("click", () => {
      this.requestWakeLock();
      alert("已請求螢幕常亮鎖定！");
    });

    // 恢復預設
    document.getElementById("btn-reset-default").addEventListener("click", () => {
      if (confirm("確定要重設為原廠預設設定嗎？")) {
        localStorage.removeItem("smile_call_config_v4");
        localStorage.removeItem("smile_call_current_role");
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.currentRole = "axiao";
        this.renderCurrentRoleView();
        this.closeSettingsModal();
        alert("已重設完成！");
      }
    });
  }

  // ==========================================
  // 後台設定開啟與儲存
  // ==========================================
  openSettingsModal() {
    const axiaoContacts = this.config.roles.axiao.contacts;
    const aliContact = axiaoContacts.find((c) => c.id === "ali");
    const alongContact = axiaoContacts.find((c) => c.id === "along");
    const xiaojunContact = axiaoContacts.find((c) => c.id === "xiaojun");

    document.getElementById("cfg-webhook-ali").value = aliContact?.webhookUrl || "";
    document.getElementById("cfg-webhook-along").value = alongContact?.webhookUrl || "";
    document.getElementById("cfg-webhook-xiaojun").value = xiaojunContact?.webhookUrl || "";
    document.getElementById("cfg-auto-answer-seconds").value = this.config.autoAnswerDelaySeconds || 5;
    document.getElementById("sys-current-role").textContent = this.config.roles[this.currentRole]?.name || "阿笑";

    this.dom.settingsModal.classList.remove("hidden");
  }

  closeSettingsModal() {
    this.dom.settingsModal.classList.add("hidden");
  }

  saveSettingsFromModal() {
    const aliUrl = document.getElementById("cfg-webhook-ali").value.trim();
    const alongUrl = document.getElementById("cfg-webhook-along").value.trim();
    const xiaojunUrl = document.getElementById("cfg-webhook-xiaojun").value.trim();
    const delay = parseInt(document.getElementById("cfg-auto-answer-seconds").value, 10) || 5;

    this.config.autoAnswerDelaySeconds = delay;

    const axiaoContacts = this.config.roles.axiao.contacts;
    const cAli = axiaoContacts.find((c) => c.id === "ali");
    const cAlong = axiaoContacts.find((c) => c.id === "along");
    const cXiaojun = axiaoContacts.find((c) => c.id === "xiaojun");

    if (cAli) cAli.webhookUrl = aliUrl;
    if (cAlong) cAlong.webhookUrl = alongUrl;
    if (cXiaojun) cXiaojun.webhookUrl = xiaojunUrl;

    if (this.config.roles.ali.contacts[0]) this.config.roles.ali.contacts[0].webhookUrl = aliUrl;
    if (this.config.roles.along.contacts[0]) this.config.roles.along.contacts[0].webhookUrl = alongUrl;
    if (this.config.roles.xiaojun.contacts[0]) this.config.roles.xiaojun.contacts[0].webhookUrl = xiaojunUrl;

    this.saveConfig(this.config);
    this.closeSettingsModal();
    alert("✅ 設定已儲存並套用！");
  }
}

// 啟動應用
window.addEventListener("DOMContentLoaded", () => {
  window.app = new SmileVideoCallApp();
});
