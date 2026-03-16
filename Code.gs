/**
 * 我喝故我在? 造型飲料點餐系統 - Discord 彩色卡片版 (VVIP 文青特調)
 * GitHub 安全強化版 - 隱私資訊分離
 */

// --- 0. 安全設定區 ---
// 🔒 安全強化：網址已移至「專案設定 > 指令碼屬性」中的 DRINK_WEBHOOK
const DRINK_WEBHOOK_URL = PropertiesService.getScriptProperties().getProperty('DRINK_WEBHOOK');

// 1. 建立自定義管理選單
function onOpen() {
  SpreadsheetApp.getUi().createMenu('☕ 飲料系統管理')
      .addItem('📢 啟動系統 (設為開啟)', 'manualOpen')
      .addItem('🛑 關閉系統 (設為關閉)', 'manualClose')
      .addSeparator()
      .addItem('🔙 撤銷最後一筆訂單 (主揪用)', 'deleteLastOrder')
      .addSeparator()
      .addItem('📥 結算並歸檔今日訂單', 'manualArchive')
      .addToUi();
}

/**
 * 核心通知函式：發送彩色卡片
 */
function sendDiscordEmbed(embedData) {
  if (!DRINK_WEBHOOK_URL || DRINK_WEBHOOK_URL.indexOf("http") === -1) {
    Logger.log("❌ 找不到 DRINK_WEBHOOK 屬性，請在 GAS 專案設定中新增。");
    return;
  }
  
  const payload = {
    "embeds": [{
      "title": embedData.title,
      "description": embedData.description || "",
      "color": embedData.color || 3447003, 
      "fields": embedData.fields || [],
      "footer": { "text": "⌚ 運命之刻：" + new Date().toLocaleString() }
    }]
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(DRINK_WEBHOOK_URL, options);
    Logger.log("Discord 回應：" + response.getContentText());
  } catch (e) {
    Logger.log("Discord 通知失敗：" + e.toString());
  }
}

// 3. 網頁 API：提供資料 (doGet)
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const menuSheet = ss.getSheetByName('Menu');
  const vvipSheet = ss.getSheetByName('VVIP');
  
  const statusValue = menuSheet.getRange('G2').getValue().toString().trim(); 
  const restaurant = menuSheet.getRange('I2').getValue().toString().trim(); 
  
  if (statusValue !== "開啟") {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "關閉", restaurant: restaurant || "目前休息中", menu: [], extras: [], vvip: []
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const menuData = menuSheet.getRange(2, 1, menuSheet.getLastRow(), 2).getValues().filter(r => r[0] !== "" && r[0] !== null);
  const extraData = menuSheet.getRange(2, 5, menuSheet.getLastRow(), 2).getValues().filter(r => r[0] !== "" && r[0] !== null);
  let vvipList = (vvipSheet && vvipSheet.getLastRow() >= 2) ? vvipSheet.getRange(2, 1, vvipSheet.getLastRow() - 1, 1).getValues().flat() : [];

  return ContentService.createTextOutput(JSON.stringify({ 
    status: "開啟", restaurant: restaurant, menu: menuData, extras: extraData, vvip: vvipList 
  })).setMimeType(ContentService.MimeType.JSON);
}

// 4. 訂單處理 (doPost)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Orders');
    const menuSheet = ss.getSheetByName('Menu');
    
    // --- 撤回邏輯 ---
    if (data.action === "delete") {
      const rows = sheet.getDataRange().getValues();
      const userName = data.userName.trim();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (rows[i][1].toString().replace(/'/g, "") === userName) {
          const deletedItem = rows[i][2];
          sheet.deleteRow(i + 1);
          
          sendDiscordEmbed({
            "title": "🔙 【飲料撤回通知】",
            "color": 15158332, 
            "description": "這份糖分與水分的契約已被解除。",
            "fields": [
              { "name": "👤 姓名", "value": userName, "inline": true },
              { "name": "🥤 品項", "value": deletedItem, "inline": true }
            ]
          });
          
          return ContentService.createTextOutput(JSON.stringify({ "result": "已成功撤回！" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "result": "找不到訂單。" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 檢查系統狀態
    if (menuSheet.getRange('G2').getValue().toString().trim() !== "開啟") {
      return ContentService.createTextOutput(JSON.stringify({ "result": "🛑 系統已關閉。" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 計算價格與 VVIP 邏輯
    const vvipList = (ss.getSheetByName('VVIP') && ss.getSheetByName('VVIP').getLastRow() >= 2) ? ss.getSheetByName('VVIP').getRange(2, 1, ss.getSheetByName('VVIP').getLastRow() - 1, 1).getValues().flat() : [];
    const isVVIP = vvipList.includes(data.userName.trim());
    let basePrice = Number(data.price), toppingPrice = (basePrice > 35) ? 0 : (Number(data.extraPrice) || 0);
    let total = (basePrice + toppingPrice) * (Number(data.quantity) || 1);

    sheet.appendRow([
      new Date(), "'" + data.userName, data.item, data.ice, data.sugar,
      data.extraItem, basePrice, toppingPrice, data.quantity, total,
      isVVIP ? "是" : (data.hasPaid ? "是" : "否"), isVVIP ? total : (Number(data.receivedAmount) || 0), data.note
    ]);
    
    sendDiscordEmbed({
      "title": isVVIP ? "✨ 【VVIP 降臨：老大請客】" : "🥤 【新訂單來囉】",
      "color": isVVIP ? 15844367 : 3447003, 
      "fields": [
        { "name": "👤 點餐人", "value": data.userName, "inline": true },
        { "name": "🥤 品項", "value": data.item + " (" + data.ice + "/" + data.sugar + ")", "inline": true },
        { "name": "➕ 加料", "value": data.extraItem || "無", "inline": true },
        { "name": "💰 總計", "value": "$" + total, "inline": true },
        { "name": "📝 備註", "value": data.note || "無" }
      ]
    });

    return ContentService.createTextOutput(JSON.stringify({ 
      "result": isVVIP ? "🌙 月色真美。在群星溫柔的注視下，這份甘甜無需塵世的紙張交換。" : "下單成功！我喝故我在。" 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "錯誤：" + err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 管理功能
function manualOpen() { 
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const restaurant = ss.getSheetByName('Menu').getRange('I2').getValue();
  ss.getSheetByName('Menu').getRange('G2').setValue('開啟');
  
  sendDiscordEmbed({
    "title": "📢 【飲料系統啟動】",
    "color": 3447003,
    "description": "今日目標：**" + restaurant + "**\n血液中的糖分不足了嗎？快來下單吧！"
  });
}

function manualClose() { 
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menu').getRange('G2').setValue('關閉');
  sendDiscordEmbed({
    "title": "🛑 【飲料系統截止】",
    "color": 15105570, 
    "description": "點餐截止，準備結算帳目。"
  });
}

function deleteLastOrder() { 
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName("Orders"); 
  if(s.getLastRow()>=2) s.deleteRow(s.getLastRow()); 
}

function manualArchive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), o = ss.getSheetByName("Orders"), h = ss.getSheetByName("History");
  if (o.getLastRow() < 2) return;
  const d = o.getRange(2, 1, o.getLastRow() - 1, 13).getValues();
  h.getRange(h.getLastRow() + 1, 1, d.length, 13).setValues(d);
  o.getRange(2, 1, o.getLastRow() - 1, 13).clearContent();
}

/**
 * 測試連線診斷函式
 */
function debugDrinkConnection() {
  sendDiscordEmbed({
    "title": "⚡ 飲料系統測試：安全換鎖成功",
    "color": 3066993,
    "description": "看到此訊息代表飲料系統的 Webhook 設定正確！"
  });
}
