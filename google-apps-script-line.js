/**
 * Google Apps Script (GAS) - 微笑視訊 LINE 訊息發送中繼站
 * 
 * 💡 為什麼需要這個？
 * 因為 LINE Messaging API 禁止從純前端網頁直接呼叫，透過免費的 Google 雲端腳本（GAS）中繼，
 * 當長輩撥號時，就能 100% 免費且即時發送 LINE 訊息到您的手機或家庭群組！
 * 
 * 🚀 部署教學（只要 2 分鐘）：
 * 1. 進入 https://script.google.com/ 點擊「新增專案」。
 * 2. 將本檔案全部內容複製並貼到編輯器中（替換原本的內容）。
 * 3. 填寫下方的 LINE_ACCESS_TOKEN 與 LINE_USER_ID。
 * 4. 點擊右上角「部署」➜「新增部署作業」。
 * 5. 點擊齒輪圖示 ➜ 選擇「網頁應用程式」：
 *    - 執行身分：選擇「我」（你的 Google 帳號）
 *    - 誰可以存取：務必選擇「所有人 (Anyone)」
 * 6. 點擊「部署」，複製產生的「網頁應用程式網址」
 *    （格式為：https://script.google.com/macros/s/AKfy.../exec）。
 * 7. 把該網址貼入「微笑視訊」後台設定中即可！
 */

// 請在此貼上你的 LINE 官方帳號 Channel Access Token
const LINE_ACCESS_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";

// 請在此貼上接收通知的 LINE User ID 或 家庭 LINE 群組 Group ID
const LINE_USER_ID = "YOUR_LINE_USER_OR_GROUP_ID";

function doPost(e) {
  try {
    let postData = {};
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    }
    
    // 取得通知文字
    const messageContent = postData.content || postData.message || "📢【微笑視訊】長輩正在等待視訊通話！";

    // 發送 Push 訊息到指定的 LINE
    const lineEndpoint = "https://api.line.me/v2/bot/message/push";
    const payload = {
      to: LINE_USER_ID,
      messages: [
        {
          type: "text",
          text: messageContent
        }
      ]
    };

    const options = {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + LINE_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(lineEndpoint, options);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      response: response.getContentText() 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("✅ 微笑視訊 LINE 中繼服務正常運作中！");
}
