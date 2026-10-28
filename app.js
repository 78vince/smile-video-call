/**
 * Smile Video Call (微笑視訊) - 核心前端邏輯
 */

class SmileVideoCallApp {
  constructor() {
    this.config = this.loadConfig();
    this.currentCallApi = null;
    this.wakeLock = null;
    this.audioCtx = null;
    this.ringInterval = null;

    this.dom = {
      appTitle: document.getElementById("app-title"),
      appSubtitle: document.getElementById("app-subtitle"),
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
      btnOpenSettings: document.getElementById("btn-open-settings"),
      settingsModal: document.getElementById("settings-modal"),
      btnCloseSettings: document.getElementById("btn-close-settings"),
      btnSaveSettings: document.getElementById("btn-save-settings")
    };

    this.init();
  }

  // ==========================================
  // 初始化
  // ==========================================
  init() {
    this.initClock();
    this.renderContacts();
    this.bindEvents();
    this.requestWakeLock();
    this.registerServiceWorker();
  }

  // 讀取設定（優先使用 localStorage，無則使用 config.js）
  loadConfig() {
    try {
      const saved = localStorage.getItem("smile_call_config");
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
    localStorage.setItem("smile_call_config", JSON.stringify(newConfig));
    this.renderContacts();
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
  // 音效合成（Web Audio API，免外部音檔）
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

  // 撥號點擊音（愉悅的和弦）
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
    } catch (e) {
      console.warn("音效播放失敗", e);
    }
  }

  // 嘟嘟電話鈴聲
  startRingingSound() {
    this.stopRingingSound();
    const playRing = () => {
      try {
        const ctx = this.getAudioContext();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440; // 傳統電話雙音
        osc2.frequency.value = 480;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
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
    this.ringInterval = setInterval(playRing, 3000);
  }

  stopRingingSound() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // ==========================================
  // 渲染聯絡人大按鈕
  // ==========================================
  renderContacts() {
    this.dom.appTitle.textContent = this.config.appTitle || "微笑視訊";
    this.dom.appSubtitle.textContent = this.config.welcomeSubtitle || "點一下照片，馬上視訊聊聊天！";
    this.dom.contactsGrid.innerHTML = "";

    this.config.contacts.forEach((contact) => {
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
        this.startCall(contact);
      });

      this.dom.contactsGrid.appendChild(card);
    });
  }

  // ==========================================
  // 開始撥打視訊
  // ==========================================
  startCall(contact) {
    const fullRoomName = `${this.config.roomPrefix}-${contact.roomSuffix}`;
    const roomUrl = `https://${this.config.jitsiDomain}/${fullRoomName}`;

    // 1. 切換畫面：立即顯示視訊容器（讓 iframe 正常具備全螢幕尺寸與權限），首頁暫時隱藏
    this.dom.homeView.classList.add("hidden");
    this.dom.callView.classList.remove("hidden");

    // 2. 顯示等待撥號畫面（浮於最上層）
    this.dom.connectingAvatar.src = contact.avatarUrl;
    this.dom.connectingName.textContent = `正在撥給 ${contact.name}...`;
    this.dom.connectingOverlay.classList.remove("hidden");
    this.startRingingSound();

    // 3. 背景發送手機推播通知給家人
    this.sendNotification(contact, roomUrl);

    // 4. 確保螢幕保持開啟
    this.requestWakeLock();

    // 5. 清理上一次的通話實例
    if (this.currentCallApi) {
      this.currentCallApi.dispose();
      this.currentCallApi = null;
    }
    this.dom.jitsiContainer.innerHTML = "";

    // 6. 初始化 Jitsi Meet 外部控制
    const options = {
      roomName: fullRoomName,
      width: "100%",
      height: "100%",
      parentNode: this.dom.jitsiContainer,
      userInfo: {
        displayName: "長輩平板"
      },
      configOverwrite: {
        startWithAudioMuted: false,   // 自動開啟麥克風
        startWithVideoMuted: false,   // 自動開啟鏡頭
        prejoinPageEnabled: false,    // 跳過預覽畫面，真正一鍵加入！
        disableDeepLinking: true,     // 禁止跳轉提示下載 App，直接在網頁跑
        enableWelcomePage: false,
        enableClosePage: false,
        disableInviteFunctions: true,
        notifications: []
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: ["microphone", "camera", "hangup"],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_REMOTE_DISPLAY_NAME: "家人"
      }
    };

    try {
      this.currentCallApi = new JitsiMeetExternalAPI(this.config.jitsiDomain, options);

      // 安全機制：3秒後強制隱藏撥號遮罩，避免瀏覽器權限彈窗被遮擋
      this.connectingTimeout = setTimeout(() => {
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      }, 3000);

      // 當進入視訊房間後，關閉撥號等待層
      this.currentCallApi.addEventListener("videoConferenceJoined", () => {
        if (this.connectingTimeout) clearTimeout(this.connectingTimeout);
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      });

      // 通話掛斷或離開事件
      const handleHangup = () => {
        this.endCall();
      };

      this.currentCallApi.addEventListener("videoConferenceLeft", handleHangup);
      this.currentCallApi.addEventListener("readyToClose", handleHangup);
    } catch (err) {
      console.error("載入 Jitsi 失敗:", err);
      alert("無法啟動視訊，請檢查網路連線或稍後再試。");
      this.endCall();
    }
  }

  // 結束通話
  endCall() {
    if (this.connectingTimeout) {
      clearTimeout(this.connectingTimeout);
      this.connectingTimeout = null;
    }
    this.stopRingingSound();
    this.dom.connectingOverlay.classList.add("hidden");

    if (this.currentCallApi) {
      try {
        this.currentCallApi.dispose();
      } catch (e) {}
      this.currentCallApi = null;
    }

    this.dom.jitsiContainer.innerHTML = "";
    this.dom.callView.classList.add("hidden");
    this.dom.homeView.classList.remove("hidden");
  }

  // ==========================================
  // 發送手機推播通知
  // ==========================================
  async sendNotification(contact, roomUrl) {
    const wh = this.config.webhook;
    if (!wh || !wh.enabled) return;

    const message = `🔔【微笑視訊通知】長輩正在平板呼叫「${contact.name}」！\n👉 請點擊連結進入視訊：${roomUrl}`;

    try {
      if (wh.provider === "discord" && wh.discordWebhookUrl) {
        await fetch(wh.discordWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `📢 **長輩發起視訊通話！**\n對象：**${contact.name}**\n點此加入通話：${roomUrl}`
          })
        });
      } else if (wh.provider === "telegram" && wh.telegramBotToken && wh.telegramChatId) {
        const url = `https://api.telegram.org/bot${wh.telegramBotToken}/sendMessage`;
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: wh.telegramChatId,
            text: message
          })
        });
      } else if (wh.provider === "custom" && wh.customWebhookUrl) {
        await fetch(wh.customWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "call_initiated",
            contactName: contact.name,
            roomUrl: roomUrl,
            timestamp: new Date().toISOString()
          })
        });
      }
    } catch (err) {
      console.warn("通知發送失敗（不影響視訊運行）:", err);
    }
  }

  // ==========================================
  // 保持螢幕常亮（Screen Wake Lock API）
  // ==========================================
  async requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch (err) {
        console.warn("無法取得螢幕常亮鎖定:", err);
      }
    }
  }

  // ==========================================
  // PWA Service Worker 註冊
  // ==========================================
  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((err) => {
          console.log("Service Worker 註冊略過:", err);
        });
      });
    }
  }

  // ==========================================
  // 事件綁定
  // ==========================================
  bindEvents() {
    // 取消撥號
    this.dom.btnCancelCall.addEventListener("click", () => this.endCall());

    // 懸浮大掛斷鍵（雙重保險）
    this.dom.btnFloatingHangup.addEventListener("click", () => {
      if (this.currentCallApi) {
        this.currentCallApi.executeCommand("hangup");
      }
      this.endCall();
    });

    // 任何觸控嘗試獲取 AudioContext
    document.body.addEventListener("touchstart", () => this.getAudioContext(), { once: true });
    document.body.addEventListener("click", () => this.getAudioContext(), { once: true });

    // 設定視窗開關
    this.dom.btnOpenSettings.addEventListener("click", () => this.openSettingsModal());
    this.dom.btnCloseSettings.addEventListener("click", () => this.closeSettingsModal());
    this.dom.btnSaveSettings.addEventListener("click", () => this.saveSettingsFromModal());

    // 設定分頁切換
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.getAttribute("data-tab");
        document.getElementById(targetId).classList.add("active");
      });
    });

    // 通知通道切換
    const providerSelect = document.getElementById("cfg-webhook-provider");
    providerSelect.addEventListener("change", () => {
      const val = providerSelect.value;
      document.getElementById("group-discord").classList.toggle("hidden", val !== "discord");
      document.getElementById("group-telegram").classList.toggle("hidden", val !== "telegram");
      document.getElementById("group-custom").classList.toggle("hidden", val !== "custom");
    });

    // 測試通知按鈕
    document.getElementById("btn-test-notification").addEventListener("click", async () => {
      const btn = document.getElementById("btn-test-notification");
      btn.textContent = "發送中...";
      btn.disabled = true;
      const testContact = { name: "測試對象" };
      await this.sendNotification(testContact, `https://${this.config.jitsiDomain}/smile-test`);
      btn.textContent = "✅ 已送出測試（請檢查手機）";
      setTimeout(() => {
        btn.textContent = "🔔 測試發送通知";
        btn.disabled = false;
      }, 3000);
    });

    // 測試聲音
    document.getElementById("btn-test-sound").addEventListener("click", () => {
      this.playTapSound();
    });

    // 喚醒鎖定
    document.getElementById("btn-request-wakelock").addEventListener("click", () => {
      this.requestWakeLock();
      alert("已請求鎖定螢幕不休眠！");
    });

    // 新增聯絡人按鈕
    document.getElementById("btn-add-contact").addEventListener("click", () => {
      this.config.contacts.push({
        id: "c_" + Date.now(),
        name: "新家人",
        relation: "親友",
        roomSuffix: "room-" + Math.floor(Math.random() * 1000),
        avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=" + Date.now(),
        accentColor: "#2563eb"
      });
      this.renderSettingsContactList();
    });

    // 恢復預設值
    document.getElementById("btn-reset-default").addEventListener("click", () => {
      if (confirm("確定要清除所有自訂設定，恢復原廠預設嗎？")) {
        localStorage.removeItem("smile_call_config");
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.renderContacts();
        this.closeSettingsModal();
        alert("已重設回預設值！");
      }
    });
  }

  // ==========================================
  // 後台設定 Modal 邏輯
  // ==========================================
  openSettingsModal() {
    this.renderSettingsContactList();

    // 填入目前設定
    const wh = this.config.webhook || {};
    document.getElementById("cfg-webhook-enable").checked = !!wh.enabled;
    document.getElementById("cfg-webhook-provider").value = wh.provider || "discord";
    document.getElementById("cfg-discord-url").value = wh.discordWebhookUrl || "";
    document.getElementById("cfg-tg-token").value = wh.telegramBotToken || "";
    document.getElementById("cfg-tg-chatid").value = wh.telegramChatId || "";
    document.getElementById("cfg-custom-url").value = wh.customWebhookUrl || "";
    document.getElementById("cfg-room-prefix").value = this.config.roomPrefix || "smile-call";
    document.getElementById("cfg-jitsi-domain").value = this.config.jitsiDomain || "meet.jit.si";

    document.getElementById("cfg-webhook-provider").dispatchEvent(new Event("change"));
    this.dom.settingsModal.classList.remove("hidden");
  }

  closeSettingsModal() {
    this.dom.settingsModal.classList.add("hidden");
  }

  renderSettingsContactList() {
    const list = document.getElementById("settings-contacts-list");
    list.innerHTML = "";

    this.config.contacts.forEach((contact, index) => {
      const item = document.createElement("div");
      item.className = "settings-contact-item";
      item.innerHTML = `
        <img src="${contact.avatarUrl}" style="width: 44px; height: 44px; border-radius: 50%;">
        <input type="text" placeholder="名稱 (如：大兒子)" value="${contact.name}" data-idx="${index}" data-field="name" style="flex:2;">
        <input type="text" placeholder="房間後綴代碼" value="${contact.roomSuffix}" data-idx="${index}" data-field="roomSuffix" style="flex:1;">
        <input type="color" value="${contact.accentColor || '#2563eb'}" data-idx="${index}" data-field="accentColor" style="width:40px; height:40px; padding:0; border:none; cursor:pointer;">
        <button class="btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" data-del="${index}">刪除</button>
      `;
      list.appendChild(item);
    });

    // 刪除按鈕
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(btn.getAttribute("data-del"), 10);
        this.config.contacts.splice(idx, 1);
        this.renderSettingsContactList();
      });
    });

    // 欄位修改即時同步回記憶體
    list.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const idx = parseInt(input.getAttribute("data-idx"), 10);
        const field = input.getAttribute("data-field");
        this.config.contacts[idx][field] = input.value;
      });
    });
  }

  saveSettingsFromModal() {
    this.config.webhook = {
      enabled: document.getElementById("cfg-webhook-enable").checked,
      provider: document.getElementById("cfg-webhook-provider").value,
      discordWebhookUrl: document.getElementById("cfg-discord-url").value.trim(),
      telegramBotToken: document.getElementById("cfg-tg-token").value.trim(),
      telegramChatId: document.getElementById("cfg-tg-chatid").value.trim(),
      customWebhookUrl: document.getElementById("cfg-custom-url").value.trim()
    };
    this.config.roomPrefix = document.getElementById("cfg-room-prefix").value.trim() || "smile-call";
    this.config.jitsiDomain = document.getElementById("cfg-jitsi-domain").value.trim() || "meet.jit.si";

    this.saveConfig(this.config);
    this.closeSettingsModal();
    alert("設定已儲存！");
  }
}

// 啟動應用
window.addEventListener("DOMContentLoaded", () => {
  window.app = new SmileVideoCallApp();
});
