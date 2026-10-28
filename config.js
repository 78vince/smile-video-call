/**
 * Smile Video Call (微笑視訊) - 多角色家庭配置檔
 * 
 * 核心架構：以阿笑（長輩）為中心，晚輩擁有專屬一鍵直通頁面與稱謂
 */
const DEFAULT_CONFIG = {
  // 視訊伺服器
  jitsiDomain: "meet.jit.si",
  roomPrefix: "smile",

  // 預設全局通知（若個人沒有設定，則使用此通知）
  defaultWebhookUrl: "https://discord.com/api/webhooks/1564922649514221598/9mfthoZpD4EIYrfmPIsGJpAo-cMND4xmo-lQ-lTsAAvcQp6I7aJeMj_PiBrlZ0FWEP3I",

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
          // 阿禮專屬 Discord Webhook
          webhookUrl: "https://discord.com/api/webhooks/1564922649514221598/9mfthoZpD4EIYrfmPIsGJpAo-cMND4xmo-lQ-lTsAAvcQp6I7aJeMj_PiBrlZ0FWEP3I"
        },
        {
          id: "along",
          name: "阿龍",
          relation: "二兒子",
          roomName: "smile-axiao-along",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=along&backgroundColor=c084fc",
          accentColor: "#9333ea",
          // 阿龍專屬 Webhook（可由阿龍自行填寫）
          webhookUrl: ""
        },
        {
          id: "xiaojun",
          name: "小君",
          relation: "孫女",
          roomName: "smile-axiao-xiaojun",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=xiaojun&backgroundColor=ffd5dc",
          accentColor: "#db2777",
          // 小君專屬 Webhook（可由小君自行填寫）
          webhookUrl: ""
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
          webhookUrl: "https://discord.com/api/webhooks/1564922649514221598/9mfthoZpD4EIYrfmPIsGJpAo-cMND4xmo-lQ-lTsAAvcQp6I7aJeMj_PiBrlZ0FWEP3I"
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
          webhookUrl: ""
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
          webhookUrl: ""
        }
      ]
    }
  }
};
