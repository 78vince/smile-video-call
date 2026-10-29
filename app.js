/**
 * Smile Video Call (微笑視訊) - 核心邏輯
 * 專為高齡長輩量身設計：零阻力大按鈕、微光防烙印時鐘防呆喚醒、家庭相簿最大化輪播、Jitsi 視訊與語音雙模式、LINE 即時中繼推播
 */

class SmileVideoCallApp {
  constructor() {
    this.currentRole = this.getInitialRole();
    this.config = this.loadConfig();
    this.currentCallApi = null;
    this.wakeLock = null;
    this.audioCtx = null;
    this.isCallActive = false;
    this.currentCallPeerName = null;
    this.currentRoomName = null;
    this.currentCallType = "video"; // 'video' | 'audio'
    this.pendingIncomingCallType = "video";
    this.pendingIncomingAvatarUrl = null;
    this.ringInterval = null;
    this.connectingTimeout = null;
    this.eventSource = null;
    this.incomingCountdownTimer = null;
    this.currentIncomingPayload = null;

    // 喚醒防呆冷卻時間戳（避免喚醒微光時鐘瞬間直接觸發底下的通話按鈕）
    this.justWokeUpUntil = 0;
    this.screensaverTimer = null;

    // 相簿輪播狀態與 10 分鐘自動休眠計時器
    this.currentAlbumIndex = 0;
    this.albumAutoplayTimer = null;
    this.albumTenMinuteTimer = null;

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
      connectingTip: document.getElementById("connecting-tip"),
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
      btnTestIncoming: document.getElementById("btn-test-incoming"),
      // 通話中提示元件
      busyOverlay: document.getElementById("busy-overlay"),
      busyDesc: document.getElementById("busy-desc"),
      btnCloseBusy: document.getElementById("btn-close-busy"),
      // 微光待機時鐘遮罩
      screensaverOverlay: document.getElementById("screensaver-overlay"),
      screensaverClockTime: document.getElementById("screensaver-clock-time"),
      screensaverClockDate: document.getElementById("screensaver-clock-date"),
      btnTriggerScreensaver: document.getElementById("btn-trigger-screensaver"),
      // 相簿瀏覽 Modal 元件（相片最大化、無文字、扁平單色指示點）
      albumModal: document.getElementById("album-modal"),
      albumViewport: document.getElementById("album-viewport"),
      albumCurrentImg: document.getElementById("album-current-img"),
      albumDots: document.getElementById("album-dots"),
      btnAlbumPrev: document.getElementById("btn-album-prev"),
      btnAlbumNext: document.getElementById("btn-album-next"),
      btnCloseAlbum: document.getElementById("btn-close-album"),
      // 純語音通話專屬頭像畫面
      audioCallStage: document.getElementById("audio-call-stage"),
      audioCallAvatar: document.getElementById("audio-call-avatar"),
      audioCallPeerName: document.getElementById("audio-call-peer-name"),
      audioCallStatus: document.getElementById("audio-call-status")
    };

    this.init();
  }

  // ==========================================
  // 初始化流程
  // ==========================================
  init() {
    this.initViewportHeight();
    this.initClock();
    this.renderCurrentRoleView();
    this.bindEvents();
    this.initAlbum();
    this.initScreensaver();
    this.requestWakeLock();
    this.registerServiceWorker();
    this.requestWebNotificationPermission();
    this.startIncomingCallListener();
    this.checkAutoJoin();
    this.syncAlbumPhotosFromCloud(); // 雲端自動同步 Google 相簿最新相片
  }

  // 動態適配平板可視高度（徹底解決平板重新整理後網址列/工具列將底欄擠出螢幕外的問題）
  initViewportHeight() {
    const setAppHeight = () => {
      const vh = window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${vh}px`);
    };
    window.addEventListener("resize", setAppHeight);
    window.addEventListener("orientationchange", () => setTimeout(setAppHeight, 150));
    setAppHeight();
  }

  // 檢查 URL 是否帶有快速連線參數 (如點擊通知訊息直通)
  checkAutoJoin() {
    const params = new URLSearchParams(window.location.search);
    const joinTarget = params.get("join");
    const callType = params.get("callType") || "video";

    if (joinTarget) {
      const roleData = this.config.roles[this.currentRole] || this.config.roles.axiao;
      const targetContact = roleData.contacts.find((c) => c.id === joinTarget || (c.name && c.name.includes(joinTarget)));
      if (targetContact) {
        console.log("偵測到快速連線參數，自動進入房間:", targetContact.roomName, "模式:", callType);
        setTimeout(() => {
          this.joinConferenceRoom(targetContact.roomName, targetContact.name, callType, targetContact.avatarUrl);
        }, 500);
      }
    }
  }

  // 取得目前身分 (優先讀取 URL query ?u=xxx，次之讀取 localStorage)
  getInitialRole() {
    const params = new URLSearchParams(window.location.search);
    let urlRole = params.get("u");
    if (urlRole === "xiaojun") urlRole = "pengjun";
    if (urlRole && ["axiao", "ali", "along", "pengjun"].includes(urlRole)) {
      localStorage.setItem("smile_call_current_role", urlRole);
      return urlRole;
    }

    let savedRole = localStorage.getItem("smile_call_current_role");
    if (savedRole === "xiaojun") savedRole = "pengjun";
    if (savedRole && ["axiao", "ali", "along", "pengjun"].includes(savedRole)) {
      return savedRole;
    }

    return "axiao";
  }

  // 讀取設定檔
  loadConfig() {
    let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    try {
      const saved = localStorage.getItem("smile_call_config_v8");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.jitsiDomain || parsed.jitsiDomain === "meet.jit.si") {
          parsed.jitsiDomain = "jitsi.riot.im";
        }
        if (parsed.defaultWebhookUrl && parsed.defaultWebhookUrl.includes("discord.com")) {
          parsed.defaultWebhookUrl = DEFAULT_CONFIG.defaultWebhookUrl;
        }
        if (!parsed.roles?.axiao?.contacts || parsed.roles.axiao.contacts.length < 6) {
          parsed.roles.axiao.contacts = DEFAULT_CONFIG.roles.axiao.contacts;
        }
        // 確保最新真人頭貼、名稱（阿禮、阿龍、芃君）與相簿封面更新為最新設定
        parsed.roles.axiao.contacts = DEFAULT_CONFIG.roles.axiao.contacts;
        parsed.roles.ali = DEFAULT_CONFIG.roles.ali;
        parsed.roles.along = DEFAULT_CONFIG.roles.along;
        parsed.roles.pengjun = DEFAULT_CONFIG.roles.pengjun;
        parsed.roles.xiaojun = DEFAULT_CONFIG.roles.pengjun;
        // 若儲存的相片數量少於預設設定，優先升級為預設相片
        if (!parsed.albumPhotos || parsed.albumPhotos.length < DEFAULT_CONFIG.albumPhotos.length) {
          parsed.albumPhotos = DEFAULT_CONFIG.albumPhotos;
        }
        config = parsed;
      }
    } catch (e) {
      console.warn("無法讀取本機設定，改用預設設定", e);
    }

    // 優先讀取雲端快取最新相片清單
    try {
      const cached = localStorage.getItem("smile_call_cached_album_photos");
      if (cached) {
        const cachedPhotos = JSON.parse(cached);
        if (Array.isArray(cachedPhotos) && cachedPhotos.length >= DEFAULT_CONFIG.albumPhotos.length) {
          config.albumPhotos = cachedPhotos;
        }
      }
    } catch (_) {}

    return config;
  }

  saveConfig(newConfig) {
    this.config = newConfig;
    localStorage.setItem("smile_call_config_v8", JSON.stringify(newConfig));
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
    this.closeRoleModal();
    this.startIncomingCallListener();
  }

  // ==========================================
  // 頂部時鐘與待機微光時鐘更新
  // ==========================================
  initClock() {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const timeStr = `${hours}:${minutes}`;

      const month = now.getMonth() + 1;
      const date = now.getDate();
      const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      const dayStr = dayNames[now.getDay()];
      const dateStr = `${month}月${date}日 ${dayStr}`;

      if (this.dom.clockTime) this.dom.clockTime.textContent = timeStr;
      if (this.dom.clockDate) this.dom.clockDate.textContent = dateStr;

      // 同步更新微光時鐘
      if (this.dom.screensaverClockTime) this.dom.screensaverClockTime.textContent = timeStr;
      if (this.dom.screensaverClockDate) this.dom.screensaverClockDate.textContent = dateStr;
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  // ==========================================
  // 長輩微光待機時鐘與防呆喚醒機制 (Anti-Dialing Screensaver)
  // ==========================================
  initScreensaver() {
    const resetIdleTimer = () => {
      clearTimeout(this.screensaverTimer);

      // 通話中、來電中或相簿輪播中不進入微光時鐘
      if (this.isCallActive ||
          !this.dom.incomingOverlay.classList.contains("hidden") ||
          !this.dom.albumModal.classList.contains("hidden")) {
        return;
      }

      // 閒置 3 分鐘後自動進入微光待機時鐘
      this.screensaverTimer = setTimeout(() => {
        this.enterScreensaver();
      }, 3 * 60 * 1000);
    };

    // 監聽一般使用者活動以重設閒置計時
    ["touchstart", "pointerdown", "mousemove", "keydown"].forEach((evt) => {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    // 核心防呆：捕捉階段全局攔截喚醒瞬間的點擊事件，徹底避免觸發底下的撥號按鈕！
    const blockClickIfWaking = (e) => {
      if (Date.now() < this.justWokeUpUntil) {
        e.stopPropagation();
        e.preventDefault();
        console.log("防呆攔截：已阻止微光時鐘喚醒瞬間之點擊事件傳遞");
      }
    };

    window.addEventListener("click", blockClickIfWaking, true);
    window.addEventListener("touchend", blockClickIfWaking, true);
    window.addEventListener("pointerup", blockClickIfWaking, true);

    // 點擊微光遮罩本身喚醒
    if (this.dom.screensaverOverlay) {
      ["pointerdown", "touchstart", "click"].forEach((evt) => {
        this.dom.screensaverOverlay.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.wakeUpScreensaver();
        });
      });
    }

    resetIdleTimer();
  }

  enterScreensaver() {
    if (this.isCallActive ||
        !this.dom.incomingOverlay.classList.contains("hidden") ||
        !this.dom.albumModal.classList.contains("hidden")) {
      return;
    }
    if (this.dom.screensaverOverlay) {
      this.dom.screensaverOverlay.classList.remove("hidden");
    }
  }

  wakeUpScreensaver() {
    if (!this.dom.screensaverOverlay || this.dom.screensaverOverlay.classList.contains("hidden")) {
      return;
    }
    this.dom.screensaverOverlay.classList.add("hidden");
    // 設定 800ms 喚醒冷卻時間，期間內任何聯絡人卡片點擊皆無效
    this.justWokeUpUntil = Date.now() + 800;
  }

  // ==========================================
  // 家庭相簿功能 (Google 相簿最大化、手勢滑動、不休眠、10分鐘自動進入微光模式)
  // ==========================================
  initAlbum() {
    if (!this.dom.albumModal) return;

    // 前一張 / 後一張按鈕
    if (this.dom.btnAlbumPrev) {
      this.dom.btnAlbumPrev.addEventListener("click", (e) => {
        e.stopPropagation();
        this.prevAlbumPhoto();
      });
    }

    if (this.dom.btnAlbumNext) {
      this.dom.btnAlbumNext.addEventListener("click", (e) => {
        e.stopPropagation();
        this.nextAlbumPhoto();
      });
    }

    // 關閉相簿
    if (this.dom.btnCloseAlbum) {
      this.dom.btnCloseAlbum.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeAlbumModal();
      });
    }

    // 觸控手勢滑動上下張支援 (Swipe Left / Right)
    if (this.dom.albumViewport) {
      let touchStartX = 0;
      let touchStartY = 0;

      this.dom.albumViewport.addEventListener("touchstart", (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      this.dom.albumViewport.addEventListener("touchend", (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const diffX = touchEndX - touchStartX;
          const diffY = touchEndY - touchStartY;

          // 判定為水平滑動且位移大於 40px
          if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
            if (diffX < 0) {
              this.nextAlbumPhoto();
            } else {
              this.prevAlbumPhoto();
            }
          }
        }
      }, { passive: true });

      // 桌機/滑鼠拖曳滑動支援
      let mouseStartX = 0;
      let isMouseDown = false;

      this.dom.albumViewport.addEventListener("mousedown", (e) => {
        isMouseDown = true;
        mouseStartX = e.clientX;
      });

      this.dom.albumViewport.addEventListener("mouseup", (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        const diffX = e.clientX - mouseStartX;
        if (Math.abs(diffX) > 50) {
          if (diffX < 0) this.nextAlbumPhoto();
          else this.prevAlbumPhoto();
        }
      });

      this.dom.albumViewport.addEventListener("mouseleave", () => {
        isMouseDown = false;
      });
    }

    // 鍵盤左右鍵與 ESC 鍵支援
    window.addEventListener("keydown", (e) => {
      if (!this.dom.albumModal.classList.contains("hidden")) {
        if (e.key === "ArrowLeft") this.prevAlbumPhoto();
        else if (e.key === "ArrowRight") this.nextAlbumPhoto();
        else if (e.key === "Escape") this.closeAlbumModal();
      }
    });
  }

  openAlbumModal() {
    if (Date.now() < this.justWokeUpUntil) return;
    this.dom.albumModal.classList.remove("hidden");
    this.currentAlbumIndex = 0;
    this.renderAlbumPhoto();
    this.startAlbumAutoplay();
    this.requestWakeLock(); // 相簿輪播時維持不休眠功能
    this.startAlbumTenMinuteTimer(); // 10 分鐘後自動返回主畫面並進入微光模式
    this.syncAlbumPhotosFromCloud(); // 開啟相簿時自動檢查雲端是否有新上傳相片
  }

  // 10 分鐘自動休眠進入微光模式計時器
  startAlbumTenMinuteTimer() {
    if (this.albumTenMinuteTimer) clearTimeout(this.albumTenMinuteTimer);
    this.albumTenMinuteTimer = setTimeout(() => {
      console.log("相簿播放滿 10 分鐘，自動返回主畫面並進入微光模式");
      this.closeAlbumModal();
      this.enterScreensaver();
    }, 10 * 60 * 1000);
  }

  closeAlbumModal() {
    if (this.albumTenMinuteTimer) {
      clearTimeout(this.albumTenMinuteTimer);
      this.albumTenMinuteTimer = null;
    }
    this.stopAlbumAutoplay();
    this.dom.albumModal.classList.add("hidden");
  }

  renderAlbumPhoto() {
    const photos = this.config.albumPhotos || [];
    if (!photos.length) return;

    if (this.currentAlbumIndex >= photos.length) this.currentAlbumIndex = 0;
    if (this.currentAlbumIndex < 0) this.currentAlbumIndex = photos.length - 1;

    const photo = photos[this.currentAlbumIndex];

    // 平滑淡入切換效果
    if (this.dom.albumCurrentImg) {
      this.dom.albumCurrentImg.style.opacity = "0.3";
      this.dom.albumCurrentImg.src = photo.url;
      this.dom.albumCurrentImg.onload = () => {
        this.dom.albumCurrentImg.style.opacity = "1";
      };
    }

    // 渲染底部單色扁平指示點（無立體效果）
    if (this.dom.albumDots) {
      this.dom.albumDots.innerHTML = "";
      photos.forEach((_, idx) => {
        const dot = document.createElement("button");
        dot.className = `album-dot ${idx === this.currentAlbumIndex ? "active" : ""}`;
        dot.setAttribute("aria-label", `跳至第 ${idx + 1} 張相片`);
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          this.currentAlbumIndex = idx;
          this.renderAlbumPhoto();
          this.startAlbumTenMinuteTimer();
        });
        this.dom.albumDots.appendChild(dot);
      });
    }
  }

  nextAlbumPhoto() {
    const photos = this.config.albumPhotos || [];
    if (!photos.length) return;
    this.currentAlbumIndex = (this.currentAlbumIndex + 1) % photos.length;
    this.renderAlbumPhoto();
    this.startAlbumTenMinuteTimer();
  }

  prevAlbumPhoto() {
    const photos = this.config.albumPhotos || [];
    if (!photos.length) return;
    this.currentAlbumIndex = (this.currentAlbumIndex - 1 + photos.length) % photos.length;
    this.renderAlbumPhoto();
    this.startAlbumTenMinuteTimer();
  }

  startAlbumAutoplay() {
    this.stopAlbumAutoplay();
    this.albumAutoplayTimer = setInterval(() => {
      this.nextAlbumPhoto();
    }, 5000);
  }

  stopAlbumAutoplay() {
    if (this.albumAutoplayTimer) {
      clearInterval(this.albumAutoplayTimer);
      this.albumAutoplayTimer = null;
    }
  }

  // ==========================================
  // Google 相簿雲端中繼自動同步
  // ==========================================
  async syncAlbumPhotosFromCloud() {
    const webhookUrl = this.config.defaultWebhookUrl;
    if (!webhookUrl || !webhookUrl.includes("script.google.com")) return;

    try {
      const syncUrl = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}action=photos`;
      const res = await fetch(syncUrl, { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.status === "success" && Array.isArray(data.photos) && data.photos.length > 0) {
        console.log("成功從 Google 相簿雲端中繼同步最新相片:", data.photos.length, "張");
        this.config.albumPhotos = data.photos;

        // 儲存至本地快取
        try {
          localStorage.setItem("smile_call_cached_album_photos", JSON.stringify(data.photos));
        } catch (_) {}

        // 若目前相簿正在展示中，即時重新計算與渲染指示點
        if (this.dom.albumModal && !this.dom.albumModal.classList.contains("hidden")) {
          if (this.currentAlbumIndex >= data.photos.length) {
            this.currentAlbumIndex = 0;
          }
          this.renderAlbumPhoto();
        }
      }
    } catch (err) {
      console.warn("Google 相簿雲端同步略過（使用本機快取）:", err);
    }
  }

  // ==========================================
  // 音效合成 (Web Audio API)
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

  // 廣播通訊信號 (ntfy.sh)
  async broadcastSignal(payload) {
    const topic = this.config.signalTopic || "smile-axiao-call-78vince";
    const signalUrl = `https://ntfy.sh/${topic}`;

    try {
      await fetch(signalUrl, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      console.log("信號廣播成功:", payload.action);
    } catch (e) {
      console.warn("信號廣播略過錯誤:", e);
    }
  }

  // 監聽即時通訊信號 (Server-Sent Events) - 徹底修復 ntfy 內部 message 封裝解析
  startIncomingCallListener() {
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (e) {}
      this.eventSource = null;
    }

    const topic = this.config.signalTopic || "smile-axiao-call-78vince";
    const sseUrl = `https://ntfy.sh/${topic}/sse`;

    try {
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        if (this.dom.connectionStatus) {
          if (this.currentRole === "axiao") {
            this.dom.connectionStatus.textContent = "● 平板自動接聽已就緒（阿笑）";
            this.dom.statusDot.style.backgroundColor = "#22c55e";
          } else {
            this.dom.connectionStatus.textContent = `身分：${this.config.roles[this.currentRole]?.name}（隨時可撥打長輩）`;
            this.dom.statusDot.style.backgroundColor = "#2563eb";
          }
        }
      };

      this.eventSource.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (!raw) return;

          // 核心修復：ntfy 的 SSE 事件會將發送的內容包裹在 raw.message 字串中！
          let payload = raw;
          if (raw.message) {
            try {
              payload = typeof raw.message === "string" ? JSON.parse(raw.message) : raw.message;
            } catch (err) {
              console.warn("解析 ntfy payload 略過:", raw.message);
              return;
            }
          }

          if (!payload || !payload.action) return;

          // 1. 接收來電信號 (call) - 晚輩撥打給長輩
          if (payload.action === "call" && (payload.target === "axiao" || payload.target === this.currentRole)) {
            // 通話忙線守護：若長輩正在與他人通話，回覆 busy 信號
            if (this.isCallActive && this.currentRoomName !== payload.roomName) {
              console.log("長輩通話中，回傳忙線信號給撥號者:", payload.callerId);
              this.broadcastSignal({
                action: "busy",
                target: payload.callerId,
                busyWith: this.currentCallPeerName || "家人"
              });
              return;
            }
            this.handleIncomingCall(payload);
          }
          // 2. 接收忙線信號 (busy) -> 晚輩端顯示「長輩通話中」提示
          else if (payload.action === "busy" && payload.target === this.currentRole) {
            this.handleBusyLine(payload);
          }
          // 3. 遠端同步掛斷 (remote_hangup) -> 對方掛斷時，自動同步退出房間回首頁
          else if (payload.action === "remote_hangup") {
            if (this.isCallActive && this.currentRoomName === payload.roomName) {
              console.log("收到遠端掛斷信號，同步結束通話返回首頁");
              this.hangupCall(true);
            }
          }
          // 4. 取消撥號
          else if (payload.action === "cancel") {
            this.handleCancelIncomingCall();
          }
        } catch (err) {}
      };

      this.eventSource.onerror = () => {
        if (this.dom.connectionStatus) {
          this.dom.connectionStatus.textContent = "通道斷線，重新連線中...";
          this.dom.statusDot.style.backgroundColor = "#eab308";
        }
        setTimeout(() => this.startIncomingCallListener(), 4000);
      };
    } catch (e) {
      console.warn("無法啟動即時信號監聽:", e);
    }
  }

  // 處理對方忙線中提示
  handleBusyLine(payload) {
    this.endCall();
    this.stopRingingSound();

    const busyPeer = payload.busyWith ? `【${payload.busyWith}】` : "其他家人";
    this.dom.busyDesc.textContent = `阿笑媽媽目前正在與 ${busyPeer} 通話中，請稍候再撥！`;
    this.dom.busyOverlay.classList.remove("hidden");
  }

  // 來電觸發 (長輩平板畫面)
  handleIncomingCall(payload) {
    this.wakeUpScreensaver();
    this.closeAlbumModal();

    // 關鍵防呆：若長輩已經在該通話房間中等待，忽略重複呼叫信號
    if (this.currentCallApi && this.currentRoomName === payload.roomName) {
      console.log("長輩已在通話房間中等待，忽略重複呼叫信號");
      return;
    }

    if (this.currentCallApi) {
      try { this.currentCallApi.executeCommand("hangup"); } catch (e) {}
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }

    this.currentIncomingPayload = payload;
    const isAudio = payload.callType === "audio";
    this.pendingIncomingCallType = isAudio ? "audio" : "video";
    this.pendingIncomingAvatarUrl = payload.avatarUrl;

    this.dom.incomingAvatar.src = payload.avatarUrl || `https://api.dicebear.com/7.x/bottts/png?seed=${payload.callerId}&backgroundColor=b6e3f4`;
    this.dom.incomingTitle.textContent = `${isAudio ? "📞" : "📹"} ${payload.callerName} ${isAudio ? "語音" : "視訊"}來電中...`;

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

    this.joinConferenceRoom(
      payload.roomName,
      payload.callerName,
      this.pendingIncomingCallType || "video",
      this.pendingIncomingAvatarUrl
    );
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
  async sendIncomingSignalToSenior(roomName, myRoleData, callType = "video") {
    const topic = this.config.signalTopic || "smile-axiao-call-78vince";
    const signalUrl = `https://ntfy.sh/${topic}`;

    const myAvatarUrl = myRoleData.avatarUrl || `https://api.dicebear.com/7.x/bottts/png?seed=${myRoleData.id}&backgroundColor=b6e3f4`;

    const payload = {
      action: "call",
      callerId: myRoleData.id,
      callerName: myRoleData.name,
      target: "axiao",
      roomName: roomName,
      callType: callType,
      avatarUrl: myAvatarUrl
    };

    try {
      await fetch(signalUrl, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      console.log("已發送即時呼叫信號至 ntfy.sh, 模式:", callType);
    } catch (e) {
      console.warn("發送即時呼叫信號略過錯誤:", e);
    }
  }

  // ==========================================
  // 主畫面功能格渲染（支援 6 格排版：人物、空白、相簿）
  // ==========================================
  renderCurrentRoleView() {
    const roleData = this.config.roles[this.currentRole] || this.config.roles.axiao;

    this.dom.appTitle.textContent = roleData.appTitle;
    this.dom.appSubtitle.textContent = roleData.welcomeSubtitle;
    this.dom.currentRoleName.textContent = roleData.name;
    document.title = `${roleData.appTitle} - 微笑視訊`;

    this.dom.contactsGrid.innerHTML = "";

    // 過濾卡片：只有長輩（阿笑）才顯示相簿與空白槽，其他晚輩角色僅顯示通話聯絡人
    const activeContacts = roleData.contacts.filter((c) => {
      if (this.currentRole !== "axiao" && (c.type === "album" || c.type === "blank")) {
        return false;
      }
      return true;
    });

    if (activeContacts.length <= 1) {
      this.dom.contactsGrid.classList.add("single-contact");
    } else {
      this.dom.contactsGrid.classList.remove("single-contact");
    }

    // 依序產生功能卡片
    activeContacts.forEach((contact) => {
      // 1. 空白預留槽 (Slot 4 & 5)
      if (contact.type === "blank") {
        const blankCard = document.createElement("div");
        blankCard.className = "contact-card card-blank";
        blankCard.innerHTML = `
          <div class="card-blank-circle">+</div>
          <div class="card-blank-name-placeholder"></div>
          <div class="card-blank-actions-placeholder"></div>
        `;
        this.dom.contactsGrid.appendChild(blankCard);
        return;
      }

      // 2. 家庭相簿卡片 (Slot 6)
      if (contact.type === "album") {
        const albumCard = document.createElement("div");
        albumCard.className = "contact-card card-album";
        albumCard.innerHTML = `
          <div class="card-album-cover-wrapper" title="點擊瀏覽家庭相簿">
            <img class="card-album-cover-img" src="${contact.coverUrl || this.config.albumPhotos[0]?.url}" alt="家庭相簿封面">
          </div>
          <div class="contact-name">${contact.name || "家庭相簿"}</div>
          <div class="contact-actions-row">
            <button class="btn-call-action btn-action-album" title="開啟家庭相簿" aria-label="開啟家庭相簿">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
          </div>
        `;

        albumCard.addEventListener("click", () => {
          if (Date.now() < this.justWokeUpUntil) return;
          this.playTapSound();
          this.openAlbumModal();
        });

        this.dom.contactsGrid.appendChild(albumCard);
        return;
      }

      // 3. 常規使用者聯絡人卡片（無外匡、無底色、大頭照加大無外匡無陰影、單色視訊與語音雙按鈕）
      const card = document.createElement("div");
      card.className = "contact-card";

      card.innerHTML = `
        <div class="contact-avatar-wrapper" title="點擊大頭貼發起視訊通話">
          <img class="contact-avatar" src="${contact.avatarUrl}" alt="${contact.name}" loading="lazy">
        </div>
        <div class="contact-name">${contact.name}</div>
        <div class="contact-actions-row">
          <button class="btn-call-action btn-call-video" title="視訊通話" aria-label="視訊通話">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 7l-7 5 7 5V7z"></path>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </button>
          <button class="btn-call-action btn-call-audio" title="語音通話" aria-label="語音通話">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
        </div>
      `;

      // 點擊大頭貼預設發起視訊
      const avatarWrap = card.querySelector(".contact-avatar-wrapper");
      avatarWrap.addEventListener("click", () => {
        if (Date.now() < this.justWokeUpUntil) return;
        this.playTapSound();
        this.startCall(contact, roleData, "video");
      });

      // 點擊視訊鏡頭按鈕
      const btnVideo = card.querySelector(".btn-call-video");
      btnVideo.addEventListener("click", (e) => {
        e.stopPropagation();
        if (Date.now() < this.justWokeUpUntil) return;
        this.playTapSound();
        this.startCall(contact, roleData, "video");
      });

      // 點擊純語音電話按鈕
      const btnAudio = card.querySelector(".btn-call-audio");
      btnAudio.addEventListener("click", (e) => {
        e.stopPropagation();
        if (Date.now() < this.justWokeUpUntil) return;
        this.playTapSound();
        this.startCall(contact, roleData, "audio");
      });

      this.dom.contactsGrid.appendChild(card);
    });
  }

  // ==========================================
  // 發起通話（支援視訊 video 與純語音 audio 模式）
  // ==========================================
  startCall(contact, myRoleData, callType = "video") {
    const roomName = contact.roomName;
    const roomUrl = `https://${this.config.jitsiDomain}/${roomName}`;
    this.currentCallType = callType;

    // 1. 切換至通話主畫面
    this.dom.homeView.classList.add("hidden");
    this.dom.callView.classList.remove("hidden");

    // 2. 顯示撥號等待畫面
    this.dom.connectingAvatar.src = contact.avatarUrl;
    if (callType === "audio") {
      this.dom.connectingName.textContent = `正在語音撥打給 ${contact.name}...`;
      this.dom.connectingTip.textContent = "已開啟麥克風，等待對方接通...";
    } else {
      this.dom.connectingName.textContent = `正在連線 ${contact.name}...`;
      this.dom.connectingTip.textContent = "正在為您開啟視訊鏡頭，請稍候...";
    }

    this.dom.connectingOverlay.classList.remove("hidden");
    this.startRingingSound();

    // 3. 如果晚輩撥打給阿笑媽媽，發送「即時信號」通知長輩平板自動接聽！
    if (contact.id === "axiao" || this.currentRole !== "axiao") {
      this.sendIncomingSignalToSenior(roomName, myRoleData, callType);
    }

    // 4. 發送手機 LINE / Discord Webhook 通知
    this.sendNotification(contact, myRoleData, roomUrl, callType);

    // 5. 啟動 Jitsi 連線
    this.joinConferenceRoom(roomName, contact.name, callType, contact.avatarUrl);
  }

  // 進入 Jitsi 會議房間（全面傳入 avatarURL，並於語音通話時展示專屬頭像畫面）
  joinConferenceRoom(roomName, peerName, callType = "video", peerAvatarUrl = null) {
    this.requestWakeLock();
    this.currentRoomName = roomName;
    this.isCallActive = true;
    this.currentCallPeerName = peerName;
    this.currentCallType = callType;

    // 若有未清理乾淨的舊連線，先通知伺服器離線，杜絕幽靈分身
    if (this.currentCallApi) {
      try { this.currentCallApi.executeCommand("hangup"); } catch (e) {}
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }

    this.dom.jitsiContainer.innerHTML = "";
    this.dom.homeView.classList.add("hidden");
    this.dom.callView.classList.remove("hidden");

    const myRoleData = this.config.roles[this.currentRole] || this.config.roles.axiao;
    const myDisplayName = myRoleData.name || "家庭成員";
    const myAvatarUrl = myRoleData.avatarUrl || `https://api.dicebear.com/7.x/bottts/png?seed=${this.currentRole}&backgroundColor=fef08a`;

    // 取得通話對象的頭像
    if (!peerAvatarUrl) {
      const c = myRoleData.contacts.find((item) => item.name === peerName || item.roomName === roomName);
      if (c && c.avatarUrl) {
        peerAvatarUrl = c.avatarUrl;
      }
    }

    const isAudioOnly = callType === "audio";

    // 核心解決需求 3：語音通話時，顯示專屬大頭貼畫面取代字母圓形圖示！
    if (isAudioOnly) {
      this.dom.audioCallStage.classList.remove("hidden");
      this.dom.audioCallAvatar.src = peerAvatarUrl || myRoleData.avatarUrl;
      this.dom.audioCallPeerName.textContent = peerName;
      this.dom.audioCallStatus.textContent = "📞 語音通話中";
    } else {
      this.dom.audioCallStage.classList.add("hidden");
    }

    const options = {
      roomName: roomName,
      width: "100%",
      height: "100%",
      parentNode: this.dom.jitsiContainer,
      userInfo: {
        displayName: myDisplayName,
        avatarURL: myAvatarUrl
      },
      configOverwrite: {
        prejoinConfig: { enabled: false },
        prejoinPageEnabled: false,
        enableInsecureRoomNameWarning: false,
        requireDisplayName: false,
        startAudioOnly: isAudioOnly,
        startWithVideoMuted: isAudioOnly,
        startWithAudioMuted: false,
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

      // 通知 Jitsi 設置本地頭像
      try {
        this.currentCallApi.executeCommand("avatarUrl", myAvatarUrl);
      } catch (e) {}

      this.connectingTimeout = setTimeout(() => {
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      }, 3000);

      this.currentCallApi.addEventListener("videoConferenceJoined", () => {
        if (this.connectingTimeout) clearTimeout(this.connectingTimeout);
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
        try {
          this.currentCallApi.executeCommand("avatarUrl", myAvatarUrl);
        } catch (e) {}
      });

      // 對方離開房間時，自己也自動退出房間回到首頁
      this.currentCallApi.addEventListener("participantLeft", (event) => {
        console.log("偵測到對方離開房間:", event);
        setTimeout(() => {
          if (this.currentCallApi) {
            try {
              const count = this.currentCallApi.getNumberOfParticipants();
              if (count <= 1) {
                console.log("房間只剩一人，自動同步結束通話回到首頁");
                this.endCall();
              }
            } catch (e) {
              this.endCall();
            }
          }
        }, 500);
      });

      // 伺服器確認已離開房間
      this.currentCallApi.addEventListener("videoConferenceLeft", () => {
        this.endCall();
      });
      this.currentCallApi.addEventListener("readyToClose", () => {
        this.endCall();
      });
    } catch (err) {
      console.error("載入 Jitsi 失敗:", err);
      alert("無法啟動通話，請檢查網路連線。");
      this.endCall();
    }
  }

  // 主動掛斷通話
  hangupCall(isRemote = false) {
    if (this.isCallActive && !isRemote) {
      this.broadcastSignal({
        action: "remote_hangup",
        roomName: this.currentRoomName,
        sender: this.currentRole
      });
    }

    if (this.currentCallApi) {
      try {
        this.currentCallApi.executeCommand("hangup");
      } catch (e) {}
      setTimeout(() => {
        this.endCall();
      }, 300);
    } else {
      this.endCall();
    }
  }

  // 乾淨清空狀態回到主畫面
  endCall() {
    this.isCallActive = false;
    this.currentCallPeerName = null;
    this.currentRoomName = null;
    if (this.connectingTimeout) {
      clearTimeout(this.connectingTimeout);
      this.connectingTimeout = null;
    }
    this.stopRingingSound();
    this.dom.connectingOverlay.classList.add("hidden");
    this.dom.audioCallStage.classList.add("hidden");

    if (this.currentCallApi) {
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }

    this.dom.jitsiContainer.innerHTML = "";
    this.dom.callView.classList.add("hidden");
    this.dom.homeView.classList.remove("hidden");
  }

  // ==========================================
  // 發送手機推播通知（LINE GAS / Discord）
  // ==========================================
  async sendNotification(contact, callerRole, roomUrl, callType = "video") {
    const webhookUrl = contact.webhookUrl || this.config.defaultWebhookUrl;
    if (!webhookUrl) return;

    const callerName = callerRole.name;
    const targetName = contact.name;
    const isAudio = callType === "audio";
    const typeLabel = isAudio ? "語音通話" : "視訊通話";
    const iconLabel = isAudio ? "📞" : "📹";

    // 一鍵直通連結（帶入 callType）
    const webJoinUrl = `https://78vince.github.io/smile-video-call/?u=${contact.id}&join=${callerRole.id}&callType=${callType}`;
    const directRoomUrl = `https://${this.config.jitsiDomain}/${contact.roomName}`;

    const msg = `📢 **【微笑視訊通知】**\n${iconLabel} **${callerName}** 正在發起 **${typeLabel}**，呼叫 **${targetName}**！\n👉 **點此立即加入：** ${webJoinUrl}\n（直接連線，免按鈕）\n備用連結：${directRoomUrl}`;

    try {
      if (webhookUrl.includes("script.google.com")) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            content: `📢【微笑視訊】${iconLabel} ${callerName} 正在發起${typeLabel}呼叫 ${targetName}！\n👉 點此立即加入：${webJoinUrl}`,
            caller: callerName,
            target: targetName,
            callType: typeLabel,
            roomUrl: webJoinUrl
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

    this.sendBrowserNotification(`${callerName} 正在撥打${typeLabel}`, `通話對象：${targetName}，點擊加入！`, webJoinUrl);
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

  // 螢幕常亮鎖定 (Screen Wake Lock API)
  async requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
        console.log("螢幕常亮鎖定啟用成功");
      }
    } catch (err) {
      console.warn("無法取得螢幕鎖定:", err);
    }
  }

  // PWA Service Worker 註冊
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("sw.js")
        .then(() => console.log("Service Worker 註冊成功"))
        .catch((err) => console.warn("SW 註冊失敗:", err));
    }
  }

  // ==========================================
  // 事件綁定 (UI 操作與彈窗)
  // ==========================================
  bindEvents() {
    // 浮動大掛斷按鈕
    this.dom.btnFloatingHangup.addEventListener("click", () => {
      this.playTapSound();
      this.hangupCall();
    });

    // 取消撥號
    this.dom.btnCancelCall.addEventListener("click", () => {
      this.playTapSound();
      this.broadcastSignal({ action: "cancel", caller: this.currentRole });
      this.endCall();
    });

    // 關閉忙線提示
    this.dom.btnCloseBusy.addEventListener("click", () => {
      this.dom.busyOverlay.classList.add("hidden");
    });

    // 接聽來電
    this.dom.btnAnswerCall.addEventListener("click", () => {
      this.playTapSound();
      this.answerIncomingCall();
    });

    // 稍後再聊 (拒絕來電)
    this.dom.btnDeclineCall.addEventListener("click", () => {
      this.playTapSound();
      this.handleCancelIncomingCall();
    });

    // 強制重新整理（清除快取並載入最新版）
    this.dom.btnForceReload.addEventListener("click", async () => {
      this.playTapSound();
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }
      window.location.reload(true);
    });

    // 身分切換 Modal
    this.dom.btnSwitchRole.addEventListener("click", () => {
      this.openRoleModal();
    });
    this.dom.btnCloseRoleModal.addEventListener("click", () => {
      this.closeRoleModal();
    });
    this.dom.roleModal.addEventListener("click", (e) => {
      if (e.target === this.dom.roleModal) this.closeRoleModal();
    });

    document.querySelectorAll(".role-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const selected = btn.getAttribute("data-role");
        this.switchRole(selected);
      });
    });

    // 隱藏管理後台進入點（連點頂部標題 5 次即可開啟 admin.html 控制台）
    let titleClicks = 0;
    let titleTimer = null;
    if (this.dom.appTitle) {
      this.dom.appTitle.style.cursor = "pointer";
      this.dom.appTitle.addEventListener("click", () => {
        titleClicks++;
        clearTimeout(titleTimer);
        titleTimer = setTimeout(() => { titleClicks = 0; }, 2000);
        if (titleClicks >= 5) {
          window.location.href = "admin.html";
        }
      });
    }

    // 若網址帶有 ?admin=1，顯示管理齒輪按鈕
    if (window.location.search.includes("admin=1")) {
      if (this.dom.btnOpenSettings) {
        this.dom.btnOpenSettings.style.display = "inline-flex";
      }
    }

    // 家屬後台獨立頁面導向
    if (this.dom.btnOpenSettings) {
      this.dom.btnOpenSettings.addEventListener("click", () => {
        window.location.href = "admin.html";
      });
    }
    if (this.dom.btnCloseSettings) {
      this.dom.btnCloseSettings.addEventListener("click", () => {
        this.closeSettingsModal();
      });
    }
    this.dom.settingsModal.addEventListener("click", (e) => {
      if (e.target === this.dom.settingsModal) this.closeSettingsModal();
    });
    this.dom.btnSaveSettings.addEventListener("click", () => {
      this.saveSettingsFromModal();
    });

    // 立即進入微光待機時鐘按鈕
    if (this.dom.btnTriggerScreensaver) {
      this.dom.btnTriggerScreensaver.addEventListener("click", () => {
        this.closeSettingsModal();
        setTimeout(() => this.enterScreensaver(), 300);
      });
    }

    // 設定頁籤切換
    document.querySelectorAll(".settings-tabs .tab-btn").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        document.querySelectorAll(".settings-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

        tabBtn.classList.add("active");
        const targetId = tabBtn.getAttribute("data-tab");
        document.getElementById(targetId)?.classList.add("active");
      });
    });

    // 模擬測試長輩來電
    this.dom.btnTestIncoming.addEventListener("click", () => {
      this.closeSettingsModal();
      this.handleIncomingCall({
        action: "call",
        callerId: "ali",
        callerName: "阿禮",
        target: "axiao",
        roomName: "smile-axiao-ali",
        callType: "video",
        avatarUrl: "https://api.dicebear.com/7.x/bottts/png?seed=ali&backgroundColor=b6e3f4"
      });
    });

    // 測試個別通知發送按鈕
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
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({
                content: `🔔【微笑視訊測試】發送給【${target}】的 LINE 測試通知！連線完全正常。`
              })
            });
            const data = await res.json().catch(() => null);
            if (data && data.status === "error") {
              alert(`⚠️ LINE 轉發回報：\n${data.message || data.error}\n\n💡 請在家庭 LINE 群組中輸入：@阿笑的視訊機 測試\n讓機器人完成群組綁定！`);
              btn.textContent = "⚠️ 尚未綁定群組";
            } else {
              alert(`✅ 已向 Google Apps Script 發送 LINE 測試通知！請檢查手機 LINE 群組。記得按儲存！`);
              btn.textContent = "✅ 已發送";
            }
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

    // 恢復原廠預設
    document.getElementById("btn-reset-default").addEventListener("click", () => {
      if (confirm("確定要重設為原廠預設設定嗎？")) {
        localStorage.removeItem("smile_call_config_v8");
        localStorage.removeItem("smile_call_config_v7");
        localStorage.removeItem("smile_call_config_v6");
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

  openRoleModal() {
    this.dom.roleModal.classList.remove("hidden");
  }

  closeRoleModal() {
    this.dom.roleModal.classList.add("hidden");
  }

  // 後台設定開啟與儲存
  openSettingsModal() {
    const axiaoContacts = this.config.roles.axiao.contacts;
    const aliContact = axiaoContacts.find((c) => c.id === "ali");
    const alongContact = axiaoContacts.find((c) => c.id === "along");
    const xiaojunContact = axiaoContacts.find((c) => c.id === "xiaojun");

    document.getElementById("cfg-webhook-ali").value = aliContact?.webhookUrl || this.config.defaultWebhookUrl || "";
    document.getElementById("cfg-webhook-along").value = alongContact?.webhookUrl || this.config.defaultWebhookUrl || "";
    document.getElementById("cfg-webhook-xiaojun").value = xiaojunContact?.webhookUrl || this.config.defaultWebhookUrl || "";
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
function bootstrapApp() {
  if (!window.app) {
    window.app = new SmileVideoCallApp();
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}
