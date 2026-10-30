/**
 * Google Apps Script (GAS) - 微笑視訊 LINE 家庭群組自動轉發中繼站 (智慧自適應版)
 * 
 * 💡 特色功能：
 * 1. 【自動抓取群組 ID】：只要把機器人拉進家庭群組，機器人就會自動鎖定群組 ID 並打招呼，完全免去手動查 ID 的繁瑣步驟！
 * 2. 【雙向支援】：同時處理 LINE Webhook（自動綁定群組）與微笑視訊通知（推播訊息到群組）。
 * 3. 【多模式支援】：支援群組 (Group)、多人聊天室 (Room)、個人私訊 (User)。
 * 4. 【診斷頁面】：直接用瀏覽器開啟此 Web App 網址，即可看見目前是否已成功綁定群組。
 */

// ==========================================
// 1. 基本設定（請填入你的 LINE 權杖）
// ==========================================
// 請在 LINE Developers 的 Messaging API 分頁最下方「Channel access token」複製貼上：
const LINE_ACCESS_TOKEN = "請在此貼上你的_LINE_CHANNEL_ACCESS_TOKEN";

// 預設群組 ID（已成功鎖定家庭群組 ID）
const DEFAULT_GROUP_ID = "Cbaa9407dcce090399acdf70d6b344200";


// ==========================================
// 2. 接收請求核心 (doPost)
// ==========================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJson({ status: "error", message: "無有效內容" });
    }

    const body = JSON.parse(e.postData.contents);

    // -------------------------------------------------------------
    // 情境 A：來自 LINE 官方伺服器的事件（僅記錄 ID，平時家人聊天絕不回覆插嘴）
    // -------------------------------------------------------------
    if (body.events && Array.isArray(body.events)) {
      for (const event of body.events) {
        const source = event.source;
        if (source) {
          // 支援 群組 (groupId)、多人聊天室 (roomId) 或個人私訊 (userId)
          const targetId = source.groupId || source.roomId || source.userId;
          
          if (targetId) {
            // 將 ID 自動儲存至雲端腳本屬性中（持久保存）
            PropertiesService.getScriptProperties().setProperty("ACTIVE_GROUP_ID", targetId);
            
            // ⚠️ 關鍵防干擾：僅在剛加入群組 (join) 打招呼一次；平時家人聊天 (message) 絕對不回覆！
            if (event.replyToken && event.type === "join") {
              replyLineMessage(event.replyToken, 
                "🎉【微笑視訊】已成功連線並綁定此聊天室！\n" +
                "👵 之後長輩在平板點擊撥號時，我就會在這裡發送即時視訊通知囉！"
              );
            }
          }
        }
      }
      return responseJson({ status: "line_event_handled" });
    }

    // -------------------------------------------------------------
    // 情境 B：來自長輩「微笑視訊」網頁的撥號通知 (Push Message)
    // -------------------------------------------------------------
    const targetGroupId = getTargetGroupId();
    if (!targetGroupId) {
      return responseJson({ 
        status: "error", 
        message: "尚未綁定家庭群組！請先將 LINE 機器人邀請加入家庭群組並發送任意一句話。" 
      });
    }

    // 取得通知訊息文字
    let messageText = "📢【微笑視訊】長輩正在等待視訊通話！";
    if (body.content) {
      messageText = body.content;
    } else if (body.message) {
      messageText = body.message;
    } else if (body.caller && body.target) {
      messageText = "📢【微笑視訊】" + body.caller + " 正在撥打給 " + body.target + "！\n請點擊連結立即進入通話：\n👉 " + (body.callUrl || "");
    }

    // 主動推播訊息到家庭群組
    const pushResult = pushLineMessage(targetGroupId, messageText);
    return responseJson({ 
      status: "success", 
      sentToGroup: targetGroupId, 
      lineResponse: pushResult 
    });

  } catch (err) {
    return responseJson({ status: "error", error: err.toString() });
  }
}


// ==========================================
// 3. 接收 GET 請求 (doGet) - 支援 Google 相簿自動同步與診斷頁面
// ==========================================
function doGet(e) {
  // -------------------------------------------------------------
  // 情境 A：請求同步 Google 相簿最新相片清單 (?action=photos)
  // -------------------------------------------------------------
  if (e && e.parameter && (e.parameter.action === "photos" || e.parameter.action === "album")) {
    try {
      const albumUrl = e.parameter.url || "https://photos.app.goo.gl/aFTRxKidVotBq1eXA";
      const html = UrlFetchApp.fetch(albumUrl, { followRedirects: true, muteHttpExceptions: true }).getContentText();
      
      // 比對所有 Google Photos 靜態圖片網址 (lh3.googleusercontent.com/pw/...)
      const matches = html.match(/https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9_\-]+/g) || [];
      const seen = new Set();
      const photos = [];
      
      for (const m of matches) {
        if (!seen.has(m)) {
          seen.add(m);
          photos.push({ url: m + "=w1600" });
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: photos.length,
        photos: photos
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        error: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------------------------------------------
  // 情境 B：瀏覽器直接開啟 - 診斷與狀態頁面
  // -------------------------------------------------------------
  const currentGroupId = getTargetGroupId();
  const tokenSet = LINE_ACCESS_TOKEN && !LINE_ACCESS_TOKEN.includes("請在此貼上");

  let html = "<div style='font-family:sans-serif; max-width:600px; margin:40px auto; padding:24px; border:2px solid #16a34a; border-radius:16px;'>";
  html += "<h2 style='color:#16a34a; margin-top:0;'>✅ 微笑視訊 LINE 轉發中繼站運作中</h2>";
  html += "<p><strong>• LINE Access Token：</strong> " + (tokenSet ? "🟢 已設定" : "🔴 尚未設定（請填入代碼第 16 行）") + "</p>";
  html += "<p><strong>• 目前綁定群組 ID：</strong> " + (currentGroupId ? "🟢 <code>" + currentGroupId + "</code>" : "🟡 尚未綁定（請將機器人邀請加入家庭群組）") + "</p>";
  html += "<p><strong>• Google 相簿雲端自動同步：</strong> 🟢 支援 (<code>?action=photos</code>)</p>";
  html += "<hr style='border:none; border-top:1px solid #e2e8f0; margin:20px 0;'>";
  html += "<p style='color:#64748b;'>💡 只要將機器人拉進家庭群組並在群組發送任意一句話，此處就會自動顯示群組 ID！</p>";
  html += "</div>";

  return HtmlService.createHtmlOutput(html);
}


// ==========================================
// 4. LINE API 工具函式
// ==========================================

// 取得目標群組 ID（優先順序：程式常數 > 自動學習到的 ScriptProperties）
function getTargetGroupId() {
  if (DEFAULT_GROUP_ID && DEFAULT_GROUP_ID.trim() !== "") {
    return DEFAULT_GROUP_ID.trim();
  }
  return PropertiesService.getScriptProperties().getProperty("ACTIVE_GROUP_ID") || null;
}

// 發送 Push 訊息（主動推播）
function pushLineMessage(toId, text) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: toId,
    messages: [{ type: "text", text: text }]
  };

  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN.trim()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  return response.getContentText();
}

// 回覆 Reply 訊息（被動回覆）
function replyLineMessage(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken: replyToken,
    messages: [{ type: "text", text: text }]
  };

  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN.trim()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

// 產生 JSON 回應
function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
