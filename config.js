/**
 * Smile Video Call (微笑視訊) - 預設設定檔
 * 
 * 提示：也可以在網頁端長按右下角的「齒輪」設定按鈕進行自訂，設定會保存在平板的本機快取中。
 */
const DEFAULT_CONFIG = {
  // 視訊伺服器網域（預設使用 Jitsi 官方免費伺服器）
  jitsiDomain: "meet.jit.si",

  // 房間名稱前綴（建議加上專屬英文字母，避免與全世界其他人撞名）
  roomPrefix: "smile-call-vince",

  // 歡迎詞設定
  appTitle: "微笑視訊",
  welcomeSubtitle: "點一下照片，馬上視訊聊聊天！",

  // 聯絡人清單（可隨意增減）
  contacts: [
    {
      id: "vince",
      name: "大兒子 Vince",
      relation: "兒子",
      roomSuffix: "vince-personal",
      // 頭像可以放網路圖片網址，或用預設的內建圖案
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=vince&backgroundColor=b6e3f4",
      accentColor: "#2563eb"
    },
    {
      id: "daughter",
      name: "小女兒 小涵",
      relation: "女兒",
      roomSuffix: "daughter-personal",
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=daughter&backgroundColor=ffd5dc",
      accentColor: "#db2777"
    },
    {
      id: "family",
      name: "全家大家庭",
      relation: "客廳大聚會",
      roomSuffix: "family-living-room",
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=family&backgroundColor=d1fae5",
      accentColor: "#059669"
    }
  ],

  // 外部通知設定（長輩點擊時，自動發送訊息到晚輩手機）
  webhook: {
    enabled: false,
    // 支援: 'telegram' | 'discord' | 'custom'
    provider: "discord",
    
    // Discord Webhook 網址範例: https://discord.com/api/webhooks/xxxx/yyyy
    discordWebhookUrl: "",

    // Telegram Bot 設定 (需建立 Bot 與取得 Chat ID)
    telegramBotToken: "",
    telegramChatId: "",

    // 自訂 Webhook URL (支援 POST 發送 JSON: { contactName, roomUrl, timestamp })
    customWebhookUrl: ""
  }
};
