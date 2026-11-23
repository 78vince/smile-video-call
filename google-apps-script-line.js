/**
 * Google Apps Script (GAS) - 微笑視訊 LINE 一對一精準私訊轉發中繼站 (方案2：省80%額度版)
 *
 * 💡 核心特色：
 * 1. 【點誰就只私訊誰（每次僅扣 1 則）】：
 *    長輩在平板點「阿禮」，系統只會一對一私訊推播給「阿禮」，不再發到群組按人數乘算扣點，免費額度直接放大 5 倍（每月可撥 200 次）！
 * 2. 【零門檻 10 秒自動綁定個人 ID】：
 *    阿禮、阿龍、宜靜、芃君只要各自加機器人好友，在一對一私訊輸入自己的名字（例如輸入「阿禮」），
 *    機器人就會自動記住該家人的個人 User ID 並回覆確認（被動回覆完全免費、不扣額度）！
 * 3. 【支援多組 Token 自動備援輪替】：
 *    若 1 號機器人當月滿 200 則，可於 BACKUP_LINE_ACCESS_TOKENS 填入備用機器人權杖，系統會自動無縫切換發送。
 * 4. 【視覺化診斷頁面】：
 *    用瀏覽器直接開啟此 Web App 網址，即可一目了然查看 4 位家人是否已完成一對一私訊綁定。
 */

// ==========================================
// 1. 基本設定（請填入你的 LINE 權杖）
// ==========================================
// 主機器人「阿笑的視訊機」的 Channel access token：
const LINE_ACCESS_TOKEN = "請在此貼上你的_LINE_CHANNEL_ACCESS_TOKEN";

// （選填）備用機器人 Token 陣列：若主機器人當月滿 200 則，會自動改用此處的備用 Token 發送
const BACKUP_LINE_ACCESS_TOKENS = [];

// 是否允許在「該家人尚未綁定個人私訊」時退回發送至家庭群組？
// 設為 false 可徹底禁止發送群組（100% 保護額度不被群組人數乘算吃光）；設為 true 則在未綁定個人時退回發群組
const ALLOW_GROUP_FALLBACK = false;

// 預設家庭群組 ID（僅在 ALLOW_GROUP_FALLBACK = true 或後台全體測試時使用）
const DEFAULT_GROUP_ID = "Cbaa9407dcce090399acdf70d6b344200";

// （選填）手動固定個人 User ID（通常留空即可，家人私訊機器人輸入名字就會自動綁定並存在雲端屬性中）
const MANUAL_USER_IDS = {
  ali: "Ucbc9f630c1473a62fb191a75182690ac", // 阿禮（已綁定）
  along: "",   // 阿龍
  yijing: "",  // 宜靜
  pengjun: "", // 芃君
  achang: ""   // 阿昌
};

// 家庭成員對照表
const FAMILY_MEMBERS = {
  ali:     { id: "ali",     name: "阿禮", icon: "👦", keywords: ["阿禮", "ali"] },
  along:   { id: "along",   name: "阿龍", icon: "🧑", keywords: ["阿龍", "along"] },
  yijing:  { id: "yijing",  name: "宜靜", icon: "👩", keywords: ["宜靜", "yijing"] },
  pengjun: { id: "pengjun", name: "芃君", icon: "👧", keywords: ["芃君", "小君", "pengjun", "xiaojun"] },
  achang:  { id: "achang",  name: "阿昌", icon: "🧢", keywords: ["阿昌", "achang"] }
};


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
    // 情境 A：來自 LINE 官方伺服器的 Webhook 事件（家人私訊綁定 ID）
    // -------------------------------------------------------------
    if (body.events && Array.isArray(body.events)) {
      const props = PropertiesService.getScriptProperties();

      for (const event of body.events) {
        const source = event.source;
        if (!source) continue;

        // 1. 若在群組中觸發，僅靜默記錄群組 ID，平時家人聊天絕不插嘴
        if (source.groupId || source.roomId) {
          const gId = source.groupId || source.roomId;
          props.setProperty("ACTIVE_GROUP_ID", gId);
          continue;
        }

        // 2. 一對一私訊 (source.type === "user")：自動辨識家人名字並綁定個人 userId
        if (source.userId) {
          const userId = source.userId;

          // 若剛加好友 (follow)，引導家人輸入名字完成綁定（replyMessage 完全免費不扣額度）
          if (event.type === "follow" && event.replyToken) {
            replyLineMessage(
              event.replyToken,
              "👋 歡迎加入【阿笑的視訊機】一對一通知！\n\n" +
              "請直接輸入您的名字傳送給我（例如輸入：阿禮、阿龍、宜靜、芃君 或 阿昌），即可完成個人專屬綁定！"
            );
            continue;
          }

          // 若傳送文字訊息，檢查是否包含家人名字
          if (event.type === "message" && event.message && event.message.type === "text") {
            const text = (event.message.text || "").trim();
            const matchedMember = detectFamilyMember(text);

            if (matchedMember) {
              props.setProperty("USER_ID_" + matchedMember.id, userId);

              if (event.replyToken) {
                replyLineMessage(
                  event.replyToken,
                  "✅【微笑視訊】已成功綁定「" + matchedMember.icon + " " + matchedMember.name + "」的一對一私訊通知！\n" +
                  "🆔 您的專屬 ID：" + userId + "\n\n" +
                  "👵 之後阿笑在平板點選【" + matchedMember.name + "】時，系統只會一對一私訊通知您（每次僅扣 1 則額度）！"
                );
              }
            } else if (event.replyToken) {
              replyLineMessage(
                event.replyToken,
                "💡 若要綁定【微笑視訊】一對一來電通知，請直接傳送您的名字：\n" +
                "👉 阿禮\n👉 阿龍\n👉 宜靜\n👉 芃君\n👉 阿昌"
              );
            }
          }
        }
      }
      return responseJson({ status: "line_event_handled" });
    }

    // -------------------------------------------------------------
    // 情境 B：來自長輩「微笑視訊」網頁的撥號通知 (一對一精準 Push)
    // -------------------------------------------------------------
    let messageText = "📢【微笑視訊】長輩正在等待視訊通話！";
    if (body.content) {
      messageText = body.content;
    } else if (body.message) {
      messageText = body.message;
    } else if (body.caller && body.target) {
      messageText = "📢【微笑視訊】" + body.caller + " 正在撥打給 " + body.target + "！\n請點擊連結立即進入通話：\n👉 " + (body.callUrl || body.roomUrl || "");
    }

    // 辨識這次長輩是點哪一位家人（例如：阿禮 / 阿龍 / 宜靜 / 芃君 / 阿昌）
    const targetSearchText = [body.targetId || "", body.target || "", body.content || "", body.roomUrl || ""].join(" ");
    const targetMember = detectFamilyMember(targetSearchText);

    if (targetMember) {
      const targetUserId = getMemberUserId(targetMember.id);

      if (targetUserId) {
        // 🎯 找到該家人的個人 User ID -> 一對一精準推播（只扣 1 則額度！）
        const pushResult = pushLineMessageWithFailover(targetUserId, messageText);
        return responseJson({
          status: pushResult.ok ? "success" : "error",
          mode: "direct_user_1on1",
          targetMember: targetMember.name,
          sentToUser: targetUserId,
          lineResponse: pushResult.responseText
        });
      }

      // 若該位家人還沒私訊機器人綁定個人 ID，且關閉了群組退回
      if (!ALLOW_GROUP_FALLBACK) {
        return responseJson({
          status: "error",
          mode: "unbound_user",
          targetMember: targetMember.name,
          message: "【" + targetMember.name + "】尚未綁定一對一私訊！請 " + targetMember.name + " 用手機打開 LINE 私訊「阿笑的視訊機」並輸入「" + targetMember.name + "」即可完成綁定。"
        });
      }
    }

    // 退回群組推播（僅在 ALLOW_GROUP_FALLBACK = true 或未指定特定家人時觸發）
    const targetGroupId = getTargetGroupId();
    if (!targetGroupId) {
      return responseJson({
        status: "error",
        message: "尚未綁定個人私訊或家庭群組！請家人先私訊 LINE 機器人輸入自己的名字（阿禮/阿龍/宜靜/芃君/阿昌）。"
      });
    }

    const groupResult = pushLineMessageWithFailover(targetGroupId, messageText);
    return responseJson({
      status: groupResult.ok ? "success" : "error",
      mode: "group_fallback",
      sentToGroup: targetGroupId,
      lineResponse: groupResult.responseText
    });

  } catch (err) {
    return responseJson({ status: "error", error: err.toString() });
  }
}


// ==========================================
// 3. 接收 GET 請求 (doGet) - Google 相簿同步 + 一對一綁定狀態診斷頁面
// ==========================================
function doGet(e) {
  // -------------------------------------------------------------
  // 情境 A：請求同步 Google 相簿最新相片清單 (?action=photos)
  // -------------------------------------------------------------
  if (e && e.parameter && (e.parameter.action === "photos" || e.parameter.action === "album")) {
    try {
      const albumUrl = e.parameter.url || "https://photos.app.goo.gl/aFTRxKidVotBq1eXA";
      const html = UrlFetchApp.fetch(albumUrl, { followRedirects: true, muteHttpExceptions: true }).getContentText();

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
  // 情境 B：瀏覽器直接開啟 - 檢視 5 位家人一對一私訊綁定狀態
  // -------------------------------------------------------------
  const tokenSet = LINE_ACCESS_TOKEN && !LINE_ACCESS_TOKEN.includes("請在此貼上");

  let memberRowsHtml = "";
  const keys = ["ali", "along", "yijing", "pengjun", "achang"];
  for (const key of keys) {
    const m = FAMILY_MEMBERS[key];
    const uid = getMemberUserId(key);
    const statusHtml = uid
      ? "🟢 已綁定一對一私訊 (<code>" + uid + "</code>)"
      : "🟡 尚未綁定 — <span style='color:#d97706;'>請用 LINE 一對一私訊機器人輸入「<strong>" + m.name + "</strong>」</span>";
    memberRowsHtml += "<li style='margin:10px 0;'><strong>" + m.icon + " " + m.name + "：</strong> " + statusHtml + "</li>";
  }

  let html = "<div style='font-family:sans-serif; max-width:660px; margin:36px auto; padding:24px; border:2px solid #16a34a; border-radius:16px;'>";
  html += "<h2 style='color:#16a34a; margin-top:0;'>✅ 微笑視訊 LINE 一對一精準通知中繼站（方案 2 省額度版）</h2>";
  html += "<p><strong>• LINE Access Token：</strong> " + (tokenSet ? "🟢 已設定" : "🔴 尚未設定（請填入代碼第 20 行）") + "</p>";
  html += "<p><strong>• 推播模式：</strong> 🟢 一對一精準私訊（點誰就只通知誰，每次僅扣 1 則額度）</p>";
  html += "<hr style='border:none; border-top:1px solid #e2e8f0; margin:18px 0;'>";
  html += "<h3 style='margin-bottom:8px; color:#1e293b;'>👨‍👩‍👧‍👦 家人一對一私訊綁定狀態：</h3>";
  html += "<ul style='line-height:1.6; padding-left:20px;'>" + memberRowsHtml + "</ul>";
  html += "<hr style='border:none; border-top:1px solid #e2e8f0; margin:18px 0;'>";
  html += "<p style='color:#475569; font-size:0.95rem; margin-bottom:0;'>💡 <strong>如何綁定？</strong> 請家人各自在 LINE 點開「阿笑的視訊機」<strong>一對一私訊聊天室</strong>（不是在群組喔！），傳送自己的名字（例如「<strong>阿禮</strong>」），機器人秒回確認後重新整理此頁面就會變成 🟢 已綁定！</p>";
  html += "</div>";

  return HtmlService.createHtmlOutput(html);
}


// ==========================================
// 4. 輔助與 LINE API 工具函式
// ==========================================

// 從文字中辨識對應的家庭成員
function detectFamilyMember(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 優先檢查明確的網址參數 ?u=xxx
  if (lower.includes("u=ali")) return FAMILY_MEMBERS.ali;
  if (lower.includes("u=along")) return FAMILY_MEMBERS.along;
  if (lower.includes("u=yijing")) return FAMILY_MEMBERS.yijing;
  if (lower.includes("u=pengjun") || lower.includes("u=xiaojun")) return FAMILY_MEMBERS.pengjun;
  if (lower.includes("u=achang")) return FAMILY_MEMBERS.achang;

  // 再檢查姓名關鍵字
  const keys = ["ali", "along", "yijing", "pengjun", "achang"];
  for (const key of keys) {
    const member = FAMILY_MEMBERS[key];
    for (const kw of member.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return member;
      }
    }
  }
  return null;
}

// 取得該成員已綁定的個人 LINE User ID
function getMemberUserId(memberId) {
  if (MANUAL_USER_IDS[memberId] && MANUAL_USER_IDS[memberId].trim() !== "") {
    return MANUAL_USER_IDS[memberId].trim();
  }
  return PropertiesService.getScriptProperties().getProperty("USER_ID_" + memberId) || null;
}

// 取得目標群組 ID
function getTargetGroupId() {
  if (DEFAULT_GROUP_ID && DEFAULT_GROUP_ID.trim() !== "") {
    return DEFAULT_GROUP_ID.trim();
  }
  return PropertiesService.getScriptProperties().getProperty("ACTIVE_GROUP_ID") || null;
}

// 支援主 Token + 備用 Token 自動輪替的 Push 推播
function pushLineMessageWithFailover(toId, text) {
  const tokens = [LINE_ACCESS_TOKEN].concat(BACKUP_LINE_ACCESS_TOKENS || []).filter(function(t) {
    return t && t.trim() !== "" && !t.includes("請在此貼上");
  });

  if (tokens.length === 0) {
    return { ok: false, responseText: "尚未設定 LINE_ACCESS_TOKEN" };
  }

  let lastResponseText = "";
  for (let i = 0; i < tokens.length; i++) {
    const res = pushLineMessageWithToken(toId, text, tokens[i].trim());
    lastResponseText = res.body;
    // 若成功 (HTTP 200)，或非額度上限錯誤，即返回結果
    if (res.code === 200) {
      return { ok: true, responseText: res.body, tokenIndex: i };
    }
  }

  return { ok: false, responseText: lastResponseText };
}

// 使用指定 Token 發送 Push 訊息
function pushLineMessageWithToken(toId, text, token) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: toId,
    messages: [{ type: "text", text: text }]
  };

  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  return {
    code: response.getResponseCode(),
    body: response.getContentText()
  };
}

// 回覆 Reply 訊息（被動回覆，完全免費不扣每月 200 則額度）
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
