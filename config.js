/**
 * Smile Video Call (微笑視訊) - 多角色與即時通訊配置檔
 */
const LINE_FAMILY_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwFd5_E2nJ14Dmf6ZNuqTgaxWrVtJRNeQLL8wPcYyaEC3ZGa8X9Xs8j_gMfDeO-V9ZZAQ/exec";

// 統一頭像圖庫（採用 PNG 格式以確保 Jitsi Meet 語音模式 100% 渲染頭像，杜絕字母圓形）
const AVATAR_AXIAO = "https://api.dicebear.com/7.x/bottts/png?seed=axiao&backgroundColor=fef08a";
const AVATAR_ALI = "https://api.dicebear.com/7.x/bottts/png?seed=ali&backgroundColor=b6e3f4";
const AVATAR_ALONG = "https://api.dicebear.com/7.x/bottts/png?seed=along&backgroundColor=c084fc";
const AVATAR_XIAOJUN = "https://api.dicebear.com/7.x/bottts/png?seed=xiaojun&backgroundColor=ffd5dc";

const DEFAULT_CONFIG = {
  // 視訊伺服器（使用開源免登入、免主持人驗證的公開伺服器）
  jitsiDomain: "jitsi.riot.im",
  roomPrefix: "smile",

  // 即時來電信號通道（利用 ntfy.sh 免費公共通道進行長輩平板來電監聽）
  signalTopic: "smile-axiao-call-78vince",

  // 來電自動接聽倒數秒數
  autoAnswerDelaySeconds: 5,

  // 預設全局通知（統一採用 Google Apps Script LINE 家庭群組轉發中繼站）
  defaultWebhookUrl: LINE_FAMILY_WEBHOOK_URL,

  // Google 相簿公開連結與照片清單（僅使用 Google 相簿，無本地生活照，無文字描述）
  googlePhotosAlbumUrl: "https://photos.app.goo.gl/aFTRxKidVotBq1eXA",
  albumPhotos: [
    {
      url: "https://lh3.googleusercontent.com/pw/AP1GczO1rO8LgLGfxT0xOZSJUNaqbpvGXk5pE08dCfvlB42B0bLzUqcL8MMPEmC5hv7u_pWy56RwsKaeiOIL7orxiiXrxTKDoJDo-PQoOXQh5epPYstCvQ=w1600"
    },
    {
      url: "https://lh3.googleusercontent.com/pw/AP1GczOkwFIvU2l6tIb1KjO33Bg9e-noxioqSXRJ5R3RN819hXW_XZPE6BykrTM4wtg4gTJgsL60nUle4fyx8MxdT9t4jLDS9kXKXmcpRNxX_HXH9OgatZVt=w1600"
    },
    {
      url: "https://lh3.googleusercontent.com/pw/AP1GczOtrc07rvp8We2MU-k_qVXFhfLXqAL6uXikVueiZk4xZI9ezD84quxegPfrTdYw_IBJHjRSULSF1OfVgOmsSV4B5vnWPSXzH_2ZDPNgESItBm5LSQ=w1600"
    },
    {
      url: "https://lh3.googleusercontent.com/pw/AP1GczPm5rpW1IiOhrEylCnX_4xya4S8H7p_0tEpI7MPZNxuk0nL6ZAXEqfkQr9kbqkLp25rTw1m6zI6Gc0hvof0NFZENBM-U9EjNNY-TAamW9FeXc6zjAlO=w1600"
    }
  ],

  // 角色群組資料
  roles: {
    // 1. 阿笑（長輩平板）- 預設 6 個功能槽：3 人物、2 空白、1 相簿（放最後）
    axiao: {
      id: "axiao",
      name: "阿笑",
      avatarUrl: AVATAR_AXIAO,
      appTitle: "阿笑的視訊機",
      welcomeSubtitle: "點一下照片，馬上聊聊天！",
      contacts: [
        {
          id: "ali",
          name: "阿禮",
          relation: "大兒子",
          roomName: "smile-axiao-ali",
          avatarUrl: AVATAR_ALI,
          accentColor: "#2563eb",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        },
        {
          id: "along",
          name: "阿龍",
          relation: "二兒子",
          roomName: "smile-axiao-along",
          avatarUrl: AVATAR_ALONG,
          accentColor: "#9333ea",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        },
        {
          id: "xiaojun",
          name: "小君",
          relation: "孫女",
          roomName: "smile-axiao-xiaojun",
          avatarUrl: AVATAR_XIAOJUN,
          accentColor: "#db2777",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        },
        {
          id: "blank-1",
          type: "blank",
          name: "預留位置"
        },
        {
          id: "blank-2",
          type: "blank",
          name: "預留位置"
        },
        {
          id: "album",
          type: "album",
          name: "家庭相簿",
          coverUrl: "https://lh3.googleusercontent.com/pw/AP1GczO1rO8LgLGfxT0xOZSJUNaqbpvGXk5pE08dCfvlB42B0bLzUqcL8MMPEmC5hv7u_pWy56RwsKaeiOIL7orxiiXrxTKDoJDo-PQoOXQh5epPYstCvQ=w600"
        }
      ]
    },

    // 2. 阿禮（晚輩頁面）
    ali: {
      id: "ali",
      name: "阿禮",
      avatarUrl: AVATAR_ALI,
      appTitle: "阿禮的家庭通話",
      welcomeSubtitle: "點擊大頭貼，立即連線阿笑媽媽",
      contacts: [
        {
          id: "axiao",
          name: "阿笑媽媽",
          relation: "媽媽",
          roomName: "smile-axiao-ali",
          avatarUrl: AVATAR_AXIAO,
          accentColor: "#f59e0b",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    },

    // 3. 阿龍（晚輩頁面）
    along: {
      id: "along",
      name: "阿龍",
      avatarUrl: AVATAR_ALONG,
      appTitle: "阿龍的家庭通話",
      welcomeSubtitle: "點擊大頭貼，立即連線阿笑媽媽",
      contacts: [
        {
          id: "axiao",
          name: "阿笑媽媽",
          relation: "媽媽",
          roomName: "smile-axiao-along",
          avatarUrl: AVATAR_AXIAO,
          accentColor: "#f59e0b",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    },

    // 4. 小君（晚輩頁面，稱呼奶奶）
    xiaojun: {
      id: "xiaojun",
      name: "小君",
      avatarUrl: AVATAR_XIAOJUN,
      appTitle: "小君的家庭通話",
      welcomeSubtitle: "點擊大頭貼，立即連線阿笑奶奶",
      contacts: [
        {
          id: "axiao",
          name: "阿笑奶奶",
          relation: "奶奶",
          roomName: "smile-axiao-xiaojun",
          avatarUrl: AVATAR_AXIAO,
          accentColor: "#f59e0b",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    }
  }
};
