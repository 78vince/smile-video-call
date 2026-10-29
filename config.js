/**
 * Smile Video Call (微笑視訊) - 多角色與即時通訊配置檔
 */
const LINE_FAMILY_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwFd5_E2nJ14Dmf6ZNuqTgaxWrVtJRNeQLL8wPcYyaEC3ZGa8X9Xs8j_gMfDeO-V9ZZAQ/exec";

const DEFAULT_CONFIG = {
  // 視訊伺服器（使用開源免登入、免主持人驗證的公開伺服器）
  jitsiDomain: "jitsi.riot.im",
  roomPrefix: "smile",

  // 即時來電信號通道（利用 ntfy.sh 免費公共通道進行長輩平板來電監聽）
  // 晚輩撥號時會發送信號到此通道，長輩平板收到後自動響鈴並倒數自動接聽
  signalTopic: "smile-axiao-call-78vince",

  // 來電自動接聽倒數秒數（0 代表立刻接聽，建議 5 秒讓長輩知道誰打來）
  autoAnswerDelaySeconds: 5,

  // 預設全局通知（統一採用 Google Apps Script LINE 家庭群組轉發中繼站）
  defaultWebhookUrl: LINE_FAMILY_WEBHOOK_URL,

  // 角色群組資料
  roles: {
    // 1. 阿笑（長輩平板）
    axiao: {
      id: "axiao",
      name: "阿笑",
      appTitle: "阿笑的視訊機",
      welcomeSubtitle: "點一下照片，馬上視訊聊聊天！",
      contacts: [
        {
          id: "ali",
          name: "阿禮",
          relation: "大兒子",
          roomName: "smile-axiao-ali",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=ali&backgroundColor=b6e3f4",
          accentColor: "#2563eb",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        },
        {
          id: "along",
          name: "阿龍",
          relation: "二兒子",
          roomName: "smile-axiao-along",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=along&backgroundColor=c084fc",
          accentColor: "#9333ea",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        },
        {
          id: "xiaojun",
          name: "小君",
          relation: "孫女",
          roomName: "smile-axiao-xiaojun",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=xiaojun&backgroundColor=ffd5dc",
          accentColor: "#db2777",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    },

    // 2. 阿禮（晚輩頁面）
    ali: {
      id: "ali",
      name: "阿禮",
      appTitle: "阿禮的家庭通話",
      welcomeSubtitle: "點擊大頭貼，立即連線阿笑媽媽",
      contacts: [
        {
          id: "axiao",
          name: "阿笑媽媽",
          relation: "媽媽",
          roomName: "smile-axiao-ali",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=axiao&backgroundColor=fef08a",
          accentColor: "#f59e0b",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    },

    // 3. 阿龍（晚輩頁面）
    along: {
      id: "along",
      name: "阿龍",
      appTitle: "阿龍的家庭通話",
      welcomeSubtitle: "點擊大頭貼，立即連線阿笑媽媽",
      contacts: [
        {
          id: "axiao",
          name: "阿笑媽媽",
          relation: "媽媽",
          roomName: "smile-axiao-along",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=axiao&backgroundColor=fef08a",
          accentColor: "#f59e0b",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    },

    // 4. 小君（晚輩頁面，稱呼奶奶）
    xiaojun: {
      id: "xiaojun",
      name: "小君",
      appTitle: "小君的家庭通話",
      welcomeSubtitle: "點擊大頭貼，立即連線阿笑奶奶",
      contacts: [
        {
          id: "axiao",
          name: "阿笑奶奶",
          relation: "奶奶",
          roomName: "smile-axiao-xiaojun",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=axiao&backgroundColor=fef08a",
          accentColor: "#f59e0b",
          webhookUrl: LINE_FAMILY_WEBHOOK_URL
        }
      ]
    }
  }
};
