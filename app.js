/**
 * Smile Video Call (微笑視訊) - 多角色核心邏輯
 * 支援 阿笑（長輩）與 阿禮、阿龍、小君（晚輩）四種專屬身分介面
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
      roleModal: document.getElementById("role-modal"),
      btnCloseRoleModal: document.getElementById("btn-close-role-modal"),
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
    this.renderCurrentRoleView();
    this.bindEvents();
    this.requestWakeLock();
    this.registerServiceWorker();
    this.requestWebNotificationPermission();
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

    return "axiao"; // 預設為長輩阿笑
  }

  // 讀取設定
  loadConfig() {
    try {
      const saved = localStorage.getItem("smile_call_config_v2");
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
    localStorage.setItem("smile_call_config_v2", JSON.stringify(newConfig));
    this.renderCurrentRoleView();
  }

  // 切換身分
  switchRole(roleId) {
    if (!this.config.roles[roleId]) return;
    this.currentRole = roleId;
    localStorage.setItem("smile_call_current_role", roleId);

    // 平滑更新 URL 參數，不刷新頁面
    const newUrl = new URL(window.location);
    newUrl.searchParams.set("u", roleId);
    window.history.replaceState({}, "", newUrl);

    this.renderCurrentRoleView();
    this.dom.roleModal.classList.add("hidden");
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
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 和弦
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
    const playRing = () => {
      try {
        const ctx = this.getAudioContext();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440;
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

    // 1. 立即切換到視訊容器（確保 iframe 具備 100% 寬高）
    this.dom.homeView.classList.add("hidden");
    this.dom.callView.classList.remove("hidden");

    // 2. 顯示撥號等待畫面
    this.dom.connectingAvatar.src = contact.avatarUrl;
    this.dom.connectingName.textContent = `正在連線 ${contact.name}...`;
    this.dom.connectingOverlay.classList.remove("hidden");
    this.startRingingSound();

    // 3. 發送手機 Discord / Webhook 通知給對方
    this.sendNotification(contact, myRoleData, roomUrl);

    // 4. 保持螢幕常亮
    this.requestWakeLock();

    // 5. 清理舊實例
    if (this.currentCallApi) {
      try { this.currentCallApi.dispose(); } catch (e) {}
      this.currentCallApi = null;
    }
    this.dom.jitsiContainer.innerHTML = "";

    // 6. 初始化 Jitsi Meet
    const myDisplayName = myRoleData.name + (myRoleData.id === "axiao" ? " (長輩)" : "");
    const options = {
      roomName: roomName,
      width: "100%",
      height: "100%",
      parentNode: this.dom.jitsiContainer,
      userInfo: {
        displayName: myDisplayName
      },
      configOverwrite: {
        // 核心：關閉預覽確認頁，直通通話
        prejoinConfig: {
          enabled: false
        },
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
        DEFAULT_REMOTE_DISPLAY_NAME: contact.name
      }
    };

    try {
      this.currentCallApi = new JitsiMeetExternalAPI(this.config.jitsiDomain, options);

      // 3秒後隱藏遮罩，露出視訊鏡頭
      this.connectingTimeout = setTimeout(() => {
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      }, 3000);

      this.currentCallApi.addEventListener("videoConferenceJoined", () => {
        if (this.connectingTimeout) clearTimeout(this.connectingTimeout);
        this.stopRingingSound();
        this.dom.connectingOverlay.classList.add("hidden");
      });

      const handleHangup = () => {
        this.endCall();
      };

      this.currentCallApi.addEventListener("videoConferenceLeft", handleHangup);
      this.currentCallApi.addEventListener("readyToClose", handleHangup);
    } catch (err) {
      console.error("載入 Jitsi 失敗:", err);
      alert("無法啟動視訊，請檢查網路連線。");
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
  // 發送手機推播通知（支援個別 Webhook）
  // ==========================================
  async sendNotification(contact, callerRole, roomUrl) {
    // 優先使用該聯絡人專屬的 Webhook，若無則使用全域 Webhook
    const webhookUrl = contact.webhookUrl || this.config.defaultWebhookUrl;
    if (!webhookUrl) return;

    const callerName = callerRole.name;
    const targetName = contact.name;
    const msg = `📢 **【微笑視訊通知】**\n**${callerName}** 正在呼叫 **${targetName}**！\n👉 請點擊連結進入視訊：${roomUrl}`;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: msg
        })
      });
    } catch (err) {
      console.warn("通知發送失敗:", err);
    }

    // 同步發送瀏覽器本機通知（若有授權且分頁在背景）
    this.sendBrowserNotification(`${callerName} 正在撥打視訊`, `通話對象：${targetName}，點擊加入！`, roomUrl);
  }

  // 瀏覽器通知
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

  // 螢幕鎖定
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

  // PWA Service Worker
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
    this.dom.btnCancelCall.addEventListener("click", () => this.endCall());

    this.dom.btnFloatingHangup.addEventListener("click", () => {
      if (this.currentCallApi) {
        this.currentCallApi.executeCommand("hangup");
      }
      this.endCall();
    });

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

    // 個別測試通知按鈕
    document.querySelectorAll(".btn-test-single").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = btn.getAttribute("data-target");
        const input = document.getElementById(`cfg-webhook-${target}`);
        const url = input.value.trim();
        if (!url) {
          alert(`請先貼上 ${target} 的 Discord Webhook 網址！`);
          return;
        }

        btn.textContent = "發送中...";
        btn.disabled = true;

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: `🔔【微笑視訊測試】這是一則發送給【${target}】的測試通知！連線完全正常。`
            })
          });
          if (res.ok) {
            alert(`✅ 成功發送測試通知給 ${target}！請查看 Discord。記得按儲存並套用！`);
            btn.textContent = "✅ 發送成功";
          } else {
            alert("❌ 發送失敗，請確認網址正確");
            btn.textContent = "❌ 失敗";
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
        localStorage.removeItem("smile_call_config_v2");
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

    // 更新阿笑撥號時的個別 webhook
    const axiaoContacts = this.config.roles.axiao.contacts;
    const cAli = axiaoContacts.find((c) => c.id === "ali");
    const cAlong = axiaoContacts.find((c) => c.id === "along");
    const cXiaojun = axiaoContacts.find((c) => c.id === "xiaojun");

    if (cAli) cAli.webhookUrl = aliUrl;
    if (cAlong) cAlong.webhookUrl = alongUrl;
    if (cXiaojun) cXiaojun.webhookUrl = xiaojunUrl;

    // 晚輩撥給媽媽時也同步使用
    if (this.config.roles.ali.contacts[0]) this.config.roles.ali.contacts[0].webhookUrl = aliUrl;
    if (this.config.roles.along.contacts[0]) this.config.roles.along.contacts[0].webhookUrl = alongUrl;
    if (this.config.roles.xiaojun.contacts[0]) this.config.roles.xiaojun.contacts[0].webhookUrl = xiaojunUrl;

    this.saveConfig(this.config);
    this.closeSettingsModal();
    alert("✅ 個別通知設定已儲存並套用！");
  }
}

// 啟動應用
window.addEventListener("DOMContentLoaded", () => {
  window.app = new SmileVideoCallApp();
});
