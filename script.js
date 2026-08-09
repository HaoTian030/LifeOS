// ============帳============號============登============入============
// 這一步先只處理「登入這件事本身能不能動」，Todo/Goal/Reflection
// 暫時還是讀寫 localStorage，之後才會一塊一塊換成讀寫 Supabase。
const SUPABASE_URL = "https://jtnmrikpgixlqxnudxob.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CA0WqLqcsbp7HuxZ7oS4rA_sIClhTfc";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authEmailInput = document.getElementById("auth-email-input");
const authSendLinkButton = document.getElementById("auth-send-link-button");
const authStatus = document.getElementById("auth-status");
const authLoggedOut = document.getElementById("auth-logged-out");
const authOtpRow = document.getElementById("auth-otp-row");
const authOtpInput = document.getElementById("auth-otp-input");
const authVerifyOtpButton = document.getElementById("auth-verify-otp-button");
const authLoggedIn = document.getElementById("auth-logged-in");
const authLogoutButton = document.getElementById("auth-logout-button");
const authGoogleButton = document.getElementById("auth-google-button");
const authGuestTrigger = document.getElementById("auth-guest-trigger");
const authOpenModalButton = document.getElementById("auth-open-modal-button");
const authModalOverlay = document.getElementById("auth-modal-overlay");
const authModalClose = document.getElementById("auth-modal-close");

// 記著剛剛是對哪個 email 寄的驗證碼，等一下驗證那一步要用。
let pendingAuthEmail = "";

// 目前登入的使用者。null 代表未登入（示範模式），
// 有值代表已登入（雲端模式，Todo 資料讀寫 Supabase）。
let currentUser = null;

async function sendOtp() {
  const email = authEmailInput.value.trim();
  if (!email) return;

  authStatus.innerText = "寄送中...";

  // 這裡刻意不傳 emailRedirectTo：一旦不指定跳轉網址，
  // Supabase 就會寄「純驗證碼」的信，而不是「點擊連結」的信。
  const { error } = await supabaseClient.auth.signInWithOtp({
    email: email
  });

  if (error) {
    authStatus.innerText = `❌ ${error.message}`;
    return;
  }

  pendingAuthEmail = email;
  authLoggedOut.style.display = "none";
  authOtpRow.style.display = "flex";
  authStatus.innerText = "✅ 驗證碼已寄出，請到信箱查收";
}

// Google 登入：點下去會跳轉到 Google 的登入頁面，
// 授權完成後跳轉回目前這個網址，登入狀態改變後 onAuthStateChange 會自動接手切換畫面，
// 跟 OTP 登入成功後的處理方式一致，不需要另外寫。
async function signInWithGoogle() {
  authStatus.innerText = "正在前往 Google 登入...";

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
    }
  });

  if (error) {
    authStatus.innerText = `❌ ${error.message}`;
  }
  // 沒有 error 的話，瀏覽器會直接跳轉離開這一頁去 Google，不用再處理畫面。
}

async function verifyOtp() {
  const code = authOtpInput.value.trim();
  if (!code) return;

  authStatus.innerText = "驗證中...";

  const { error } = await supabaseClient.auth.verifyOtp({
    email: pendingAuthEmail,
    token: code,
    type: "email"
  });

  if (error) {
    authStatus.innerText = `❌ ${error.message}`;
  }
  // 驗證成功的話，onAuthStateChange 會自動接手切換畫面，這裡不用另外處理。
}

// 登入彈出視窗：開關邏輯跟既有的 History Modal 是同一套互動慣例，
// 點視窗外面空白處也能關閉，維持一致的操作手感。
function openAuthModal() {
  authModalOverlay.style.display = "flex";
}
function closeAuthModal() {
  authModalOverlay.style.display = "none";
}

authOpenModalButton.addEventListener("click", openAuthModal);
authModalClose.addEventListener("click", closeAuthModal);
authModalOverlay.addEventListener("click", function (event) {
  if (event.target === authModalOverlay) {
    closeAuthModal();
  }
});

async function showLoggedIn(user) {
  authGuestTrigger.style.display = "none";
  authLoggedIn.style.display = "flex";
  authLoggedOut.style.display = "none";
  authOtpRow.style.display = "none";
  authLogoutButton.title = `已登入：${user.email}（點擊登出）`;
  authStatus.innerText = "";
  closeAuthModal();
  await initTodosForUser(user);
  await initGoalsForUser();
  await initReflectionsForUser();
  await initFinanceForUser();
}

function showLoggedOut() {
  authGuestTrigger.style.display = "flex";
  authLoggedIn.style.display = "none";
  authLoggedOut.style.display = "flex";
  authOtpRow.style.display = "none";
  authStatus.innerText = "";
  authOtpInput.value = "";
  pendingAuthEmail = "";
  closeAuthModal();
  initTodosForGuest();
  initGoalsForGuest();
  initReflectionsForGuest();
  initFinanceForGuest();
}

async function logout() {
  await supabaseClient.auth.signOut();
}

authSendLinkButton.addEventListener("click", sendOtp);
authVerifyOtpButton.addEventListener("click", verifyOtp);
authLogoutButton.addEventListener("click", logout);
authGoogleButton.addEventListener("click", signInWithGoogle);

// 登入狀態改變時（包含剛點完信裡連結跳轉回來的那一刻）自動更新畫面。
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session) {
    showLoggedIn(session.user);
  } else {
    showLoggedOut();
  }
});

// 頁面剛載入時，確認一次目前是不是已經在登入狀態。
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) {
    showLoggedIn(data.session.user);
  } else {
    showLoggedOut();
  }
});
// ===================================================================

// ============五============分============頁============導============覽============
// 分頁邏輯只負責「顯示/隱藏哪些卡片」，不碰資料本身。
// 每張卡片在 HTML 上用 data-tab 標記屬於哪個分頁，這裡切換時只是
// 對照 data-tab 值決定 display，登入/登出、資料讀寫完全不受影響。
const tabNavButtons = document.querySelectorAll(".tab-nav-button");
const tabCards = document.querySelectorAll("[data-tab]");

function switchTab(targetTab) {
  tabCards.forEach(function (card) {
    card.style.display = card.dataset.tab === targetTab ? "" : "none";
  });

  tabNavButtons.forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.tabTarget === targetTab);
  });
}

tabNavButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    switchTab(button.dataset.tabTarget);
    if (button.dataset.tabTarget === "notion") {
      loadNotionTab();
    }
  });
});
// 登入後預設落在「待辦與目標」分頁（Log #007 定案），HTML 上已經
// 預設只有這個分頁的卡片沒有 display:none，這裡不需要在載入時額外呼叫。
// ===================================================================

// ============N============o============t============i============o============n============
// Notion 整合（BYO Token 版本，每位使用者連接自己的 Notion）：
// Phase 1（讀取）＋ Phase 2（新增/編輯/封存）。沒連接時顯示表單，連接後顯示資料庫內容（表格）。
// 編輯方式是「點哪一格改哪一格」的就地編輯，跟 Notion 本身的操作邏輯一致，不再跳出額外表單。
// 實際呼叫 Notion API 的動作都交給兩支 Edge Function 代打：
//   notion-fetch  負責讀取（含資料庫結構，用來知道每個欄位該用什麼編輯控制項）
//   notion-write  負責新增／編輯／封存
// 前端全程看不到、也不會傳送裸露的 Token 去外部網站。
const notionConnectForm = document.getElementById("notion-connect-form");
const notionTokenInput = document.getElementById("notion-token-input");
const notionDatabaseInput = document.getElementById("notion-database-input");
const notionSaveButton = document.getElementById("notion-save-button");
const notionStatus = document.getElementById("notion-status");
const notionEntriesSection = document.getElementById("notion-entries-section");
const notionEntriesStatus = document.getElementById("notion-entries-status");
const notionTableWrapper = document.getElementById("notion-table-wrapper");
const notionRefreshButton = document.getElementById("notion-refresh-button");
const notionEditConnectionButton = document.getElementById("notion-edit-connection-button");
const notionAddButton = document.getElementById("notion-add-button");

// 記住最近一次讀取到的 schema，就地編輯靠它知道每個欄位的型別跟可選項目
let notionSchema = null;
// 新增一筆之後，記住它的 id，重新整理表格後自動把該筆的標題格帶入編輯狀態
let notionFocusPageId = null;

async function saveNotionField(pageId, key, value) {
  const { data, error } = await supabaseClient.functions.invoke("notion-write", {
    body: { action: "update", pageId, properties: { [key]: value } },
  });

  if (error || !data || !data.success) {
    alert((data && data.error) || "更新失敗，請稍後再試一次。");
    return false;
  }
  return true;
}

async function archiveNotionEntry(pageId) {
  if (!confirm("確定要封存這個項目嗎？封存後會從 LifeOS 跟 Notion 的一般畫面消失，但可以在 Notion 的垃圾桶復原。")) {
    return;
  }

  const { data, error } = await supabaseClient.functions.invoke("notion-write", {
    body: { action: "archive", pageId },
  });

  if (error || !data || !data.success) {
    alert((data && data.error) || "封存失敗，請稍後再試一次。");
    return;
  }

  await loadNotionTab();
}

// schemaField 為 null 代表這格是標題欄位
function enterCellEditMode(cell, entry, schemaField) {
  if (cell.dataset.editing === "true") return;
  cell.dataset.editing = "true";

  const isTitle = schemaField === null;
  const key = isTitle ? notionSchema.titleKey : schemaField.key;
  const type = isTitle ? "title" : schemaField.type;
  const currentValue = isTitle ? entry.title : entry.raw ? entry.raw[schemaField.key] : null;
  const originalHTML = cell.innerHTML;

  function revert() {
    cell.innerHTML = originalHTML;
    cell.dataset.editing = "false";
  }

  async function commit(newValue) {
    const saved = await saveNotionField(entry.id, key, newValue);
    if (saved) {
      await loadNotionTab();
    } else {
      revert();
    }
  }

  cell.innerHTML = "";

  if (type === "checkbox") {
    // checkbox 不需要進入「編輯模式」，點一下直接切換並儲存
    commit(!currentValue);
    return;
  }

  if (type === "rich_text") {
    const textarea = document.createElement("textarea");
    textarea.value = currentValue || "";
    cell.appendChild(textarea);
    textarea.focus();
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Escape") revert();
    });
    textarea.addEventListener("blur", function () {
      const newValue = textarea.value.trim();
      if (newValue === (currentValue || "")) {
        revert();
      } else {
        commit(newValue);
      }
    });
  } else if (type === "date") {
    const input = document.createElement("input");
    input.type = "date";
    input.value = currentValue || "";
    cell.appendChild(input);
    input.focus();
    input.addEventListener("change", function () {
      commit(input.value);
    });
    input.addEventListener("blur", function () {
      if (cell.dataset.editing === "true" && input.value === (currentValue || "")) revert();
    });
  } else if (type === "select" || type === "status") {
    const select = document.createElement("select");
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.innerText = "（不選）";
    select.appendChild(emptyOption);
    (schemaField.options || []).forEach(function (opt) {
      const option = document.createElement("option");
      option.value = opt.name;
      option.innerText = opt.name;
      if (opt.name === currentValue) option.selected = true;
      select.appendChild(option);
    });
    cell.appendChild(select);
    select.focus();
    select.addEventListener("change", function () {
      commit(select.value);
    });
    select.addEventListener("blur", function () {
      if (cell.dataset.editing === "true" && select.value === (currentValue || "")) revert();
    });
  } else if (type === "multi_select") {
    const group = document.createElement("div");
    group.className = "notion-cell-multiselect";
    const selectedValues = Array.isArray(currentValue) ? currentValue.slice() : [];
    const originalValues = Array.isArray(currentValue) ? currentValue.slice() : [];

    function arraysEqual(a, b) {
      if (a.length !== b.length) return false;
      const sa = a.slice().sort();
      const sb = b.slice().sort();
      return sa.every(function (v, i) {
        return v === sb[i];
      });
    }

    function finalize() {
      document.removeEventListener("click", outsideClickHandler, true);
      if (arraysEqual(selectedValues, originalValues)) {
        revert();
      } else {
        commit(selectedValues);
      }
    }

    function outsideClickHandler(e) {
      if (!cell.contains(e.target)) {
        finalize();
      }
    }

    function renderTags() {
      group.innerHTML = "";

      (schemaField.options || []).forEach(function (opt) {
        const tag = document.createElement("span");
        tag.className = "notion-tag notion-tag-color-" + (opt.color || "default");
        if (selectedValues.includes(opt.name)) tag.classList.add("is-selected");
        tag.innerText = opt.name;
        tag.addEventListener("click", function (e) {
          e.stopPropagation();
          const index = selectedValues.indexOf(opt.name);
          if (index === -1) {
            selectedValues.push(opt.name);
          } else {
            selectedValues.splice(index, 1);
          }
          renderTags();
        });
        group.appendChild(tag);
      });

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "notion-cell-multiselect-confirm";
      confirmBtn.title = "完成，儲存這些標籤";
      confirmBtn.innerText = "✓";
      confirmBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        finalize();
      });
      group.appendChild(confirmBtn);
    }

    renderTags();
    cell.appendChild(group);

    // 用 setTimeout 延後註冊，避免這次打開編輯模式的同一次點擊，馬上被判定成「點擊外部」而立刻關閉
    setTimeout(function () {
      document.addEventListener("click", outsideClickHandler, true);
    }, 0);
  } else if (type === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.value = currentValue !== null && currentValue !== undefined ? currentValue : "";
    cell.appendChild(input);
    input.focus();
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") revert();
      if (e.key === "Enter") input.blur();
    });
    input.addEventListener("blur", function () {
      const raw = input.value;
      const newValue = raw === "" ? null : Number(raw);
      if (newValue === (currentValue ?? null)) {
        revert();
      } else {
        commit(newValue);
      }
    });
  } else {
    // title / url / email / phone_number，都用單行文字輸入
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentValue || "";
    cell.appendChild(input);
    input.focus();
    input.select();
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") revert();
      if (e.key === "Enter") input.blur();
    });
    input.addEventListener("blur", function () {
      const newValue = input.value.trim();
      if (newValue === (currentValue || "")) {
        revert();
      } else {
        commit(newValue);
      }
    });
  }
}

function renderNotionTable(schema, entries) {
  notionTableWrapper.innerHTML = "";

  if (!entries || entries.length === 0) {
    notionTableWrapper.innerHTML = '<p class="empty-state">這個 Notion 資料庫目前沒有資料。</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "notion-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const titleTh = document.createElement("th");
  titleTh.innerText = "項目";
  headRow.appendChild(titleTh);

  schema.fields.forEach(function (field) {
    const th = document.createElement("th");
    th.innerText = field.key;
    headRow.appendChild(th);
  });

  headRow.appendChild(document.createElement("th")); // 操作按鈕欄位，不需要標題文字

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  entries.forEach(function (entry) {
    try {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      titleCell.className = "notion-table-title notion-cell-editable";
      titleCell.innerText = entry.title || "（無標題）";
      titleCell.addEventListener("click", function () {
        enterCellEditMode(titleCell, entry, null);
      });
      row.appendChild(titleCell);

      const fieldsByKey = {};
      (entry.fields || []).forEach(function (f) {
        fieldsByKey[f.key] = f;
      });

      schema.fields.forEach(function (schemaField) {
        const cell = document.createElement("td");
        cell.className = "notion-table-cell notion-cell-editable";
        const field = fieldsByKey[schemaField.key];

        if (!field) {
          cell.innerHTML = "";
        } else if (field.type === "tag") {
          const tag = document.createElement("span");
          tag.className = "notion-tag notion-tag-color-" + (field.color || "default");
          tag.innerText = field.value;
          cell.appendChild(tag);
        } else if (field.type === "tags") {
          (field.values || []).forEach(function (v) {
            const tag = document.createElement("span");
            tag.className = "notion-tag notion-tag-color-" + (v.color || "default");
            tag.innerText = v.name;
            tag.style.marginRight = "4px";
            cell.appendChild(tag);
          });
        } else {
          cell.innerText = field.value || "";
        }

        cell.addEventListener("click", function () {
          enterCellEditMode(cell, entry, schemaField);
        });

        row.appendChild(cell);
      });

      const actionsCell = document.createElement("td");
      actionsCell.className = "notion-table-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "notion-table-action-btn";
      deleteBtn.type = "button";
      deleteBtn.title = "封存";
      deleteBtn.innerText = "🗑️";
      deleteBtn.addEventListener("click", function () {
        archiveNotionEntry(entry.id);
      });
      actionsCell.appendChild(deleteBtn);

      if (entry.url) {
        const link = document.createElement("a");
        link.href = entry.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.title = "在 Notion 開啟";
        link.className = "notion-table-action-btn";
        link.innerText = "↗️";
        actionsCell.appendChild(link);
      }

      row.appendChild(actionsCell);
      tbody.appendChild(row);

      // 剛新增的項目，自動把標題格帶入編輯狀態，方便直接接著打字命名
      if (notionFocusPageId && entry.id === notionFocusPageId) {
        notionFocusPageId = null;
        setTimeout(function () {
          enterCellEditMode(titleCell, entry, null);
        }, 0);
      }
    } catch (renderError) {
      console.log("渲染 Notion 資料列時發生錯誤", renderError, entry);
    }
  });

  table.appendChild(tbody);
  notionTableWrapper.appendChild(table);
}

async function loadNotionTab() {
  if (!currentUser) {
    notionConnectForm.style.display = "flex";
    notionEntriesSection.style.display = "none";
    notionStatus.innerText = "請先登入才能連接 Notion。";
    return;
  }

  notionEntriesStatus.innerText = "讀取中...";

  const { data, error } = await supabaseClient.functions.invoke("notion-fetch");

  if (error || !data) {
    notionConnectForm.style.display = "flex";
    notionEntriesSection.style.display = "none";
    notionStatus.innerText = "連線發生問題，請稍後再試一次。";
    return;
  }

  if (!data.connected) {
    notionConnectForm.style.display = "flex";
    notionEntriesSection.style.display = "none";
    notionStatus.innerText = data.error || "";
    return;
  }

  if (data.error) {
    // 已經存過連線設定，但讀取失敗（Token／資料庫 ID 錯誤），
    // 讓表單繼續顯示，才有辦法修改重填，不要卡在只顯示錯誤訊息卻沒地方改的畫面
    notionConnectForm.style.display = "flex";
    notionEntriesSection.style.display = "none";
    notionStatus.innerText = data.error;
    return;
  }

  notionConnectForm.style.display = "none";
  notionEntriesSection.style.display = "block";
  notionEntriesStatus.innerText = "";
  notionSchema = data.schema;
  renderNotionTable(data.schema, data.entries);
}

notionSaveButton.addEventListener("click", async function () {
  if (!currentUser) {
    notionStatus.innerText = "請先登入才能連接 Notion。";
    return;
  }

  const token = notionTokenInput.value.trim();
  const databaseId = notionDatabaseInput.value.trim();

  if (!token || !databaseId) {
    notionStatus.innerText = "請把 Token 跟資料庫 ID 都填寫完整。";
    return;
  }

  notionStatus.innerText = "儲存中...";

  const { error } = await supabaseClient.from("notion_connections").upsert({
    user_id: currentUser.id,
    notion_token: token,
    notion_database_id: databaseId,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    notionStatus.innerText = "儲存失敗，請稍後再試一次。";
    return;
  }

  notionStatus.innerText = "已儲存，正在測試連線...";
  await loadNotionTab();
});

notionRefreshButton.addEventListener("click", loadNotionTab);

notionEditConnectionButton.addEventListener("click", function () {
  notionConnectForm.style.display = "flex";
  notionEntriesSection.style.display = "none";
  notionStatus.innerText = "";
});

notionAddButton.addEventListener("click", async function () {
  if (!notionSchema) return;

  const { data, error } = await supabaseClient.functions.invoke("notion-write", {
    body: { action: "create", properties: {} },
  });

  if (error || !data || !data.success) {
    alert((data && data.error) || "新增失敗，請稍後再試一次。");
    return;
  }

  notionFocusPageId = data.pageId;
  await loadNotionTab();
});
// ===================================================================

// ============共============用============工============具============
// 給 todos / goals / reflections 共用的讀寫邏輯：
// 讀取時如果資料不存在或壞掉，就退回 defaultValue，不會讓整個網頁掛掉。
function loadFromStorage(key, defaultValue) {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  } catch (error) {
    console.log(`讀取 ${key} 失敗，使用預設值`, error);
    return defaultValue;
  }
}
function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
// ===================================================================

// ============今============日============代============辦============
// 這一塊已改成讀寫 Supabase 的 todos 表（登入後）；
// 未登入時走「示範模式」，只在記憶體裡操作，重新整理就恢復原狀，
// 不會寫進 localStorage 也不會寫進 Supabase。

// 示範模式用的固定範例資料，只是給還沒登入的人看畫面長相用。
const DEMO_TODOS = [
  { id: "demo-1", text: "範例：新增你的第一個待辦", done: false },
  { id: "demo-2", text: "範例：完成後打勾看看效果", done: true }
];

function todayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 算出「本週週日」的日期字串（ISO 格式，跟 Supabase 的 date 欄位比對用）。
function thisSundayDateString() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = 週日
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const yyyy = sunday.getFullYear();
  const mm = String(sunday.getMonth() + 1).padStart(2, "0");
  const dd = String(sunday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 確認這位使用者在 user_stats 有沒有自己的一筆資料，沒有就先建立一筆。
// Todo／Goal 共用同一筆 user_stats，所以這裡一次把兩邊的初始值都準備好。
async function ensureUserStatsRow() {
  const { data, error } = await supabaseClient
    .from("user_stats")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.log("讀取 user_stats 失敗", error);
    return;
  }

  if (!data) {
    await supabaseClient.from("user_stats").insert({
      user_id: currentUser.id,
      total_completed_todos: 0,
      total_completed_goals: 0,
      last_todo_date: todayDateString(),
      last_goal_week_start: thisSundayDateString()
    });
    totalCompletedTodos = 0;
    totalCompletedGoals = 0;
  } else {
    totalCompletedTodos = data.total_completed_todos;
    totalCompletedGoals = data.total_completed_goals;
  }
}

// 檢查今天日期是否跟 user_stats 記錄的上次不同：
// 不同的話，還在 active 但未完成的項目改成 pending 狀態等使用者決定，
// 已完成的項目直接刪除（完成次數已經算進 total_completed_todos，不用再保留列）。
async function checkTodoDayRolloverCloud() {
  const today = todayDateString();

  const { data: stats } = await supabaseClient
    .from("user_stats")
    .select("last_todo_date")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  const lastDate = stats && stats.last_todo_date ? stats.last_todo_date : today;

  if (lastDate !== today) {
    const { data: activeTodos, error } = await supabaseClient
      .from("todos")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("status", "active");

    if (!error && activeTodos) {
      const unfinishedIds = activeTodos.filter(t => !t.done).map(t => t.id);
      const finishedIds = activeTodos.filter(t => t.done).map(t => t.id);

      if (unfinishedIds.length > 0) {
        await supabaseClient
          .from("todos")
          .update({ status: "pending" })
          .in("id", unfinishedIds);
      }
      if (finishedIds.length > 0) {
        await supabaseClient
          .from("todos")
          .delete()
          .in("id", finishedIds);
      }
    }

    await supabaseClient
      .from("user_stats")
      .update({ last_todo_date: today })
      .eq("user_id", currentUser.id);
  }
}

async function loadTodosFromSupabase() {
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.log("讀取待辦失敗", error);
    todos = [];
    return;
  }

  todos = data.map(row => ({ id: row.id, text: row.text, done: row.done }));
}

async function loadPendingTodosFromSupabase() {
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.log("讀取待處理代辦失敗", error);
    pendingTodos = [];
    return;
  }

  pendingTodos = data.map(row => ({ id: row.id, text: row.text, done: row.done }));
}

// 登入成功後：先確保 user_stats 有資料、檢查跨天，再把雲端資料載入畫面。
async function initTodosForUser(user) {
  currentUser = user;
  await ensureUserStatsRow();
  await checkTodoDayRolloverCloud();
  await loadTodosFromSupabase();
  await loadPendingTodosFromSupabase();
  renderTodos();
  renderPendingTodos();
  updatePlayerPanel();
}

// 未登入：套用示範資料，純記憶體操作，不寫入任何地方。
function initTodosForGuest() {
  currentUser = null;
  todos = DEMO_TODOS.map(item => ({ id: item.id, text: item.text, done: item.done }));
  pendingTodos = [];
  totalCompletedTodos = todos.filter(todo => todo.done).length;
  renderTodos();
  renderPendingTodos();
  updatePlayerPanel();
}

function refreshTodos() {
  renderTodos();
  updatePlayerPanel();
}

// options.deleteRemote：true 代表這筆待處理代辦要在 Supabase 裡徹底刪除
// （放棄、或加入本週目標而不再是 Todo）；false 代表資料庫端已經處理好狀態
// （例如延到今天已經把 status 改回 active），這裡只需要更新畫面上的清單。
async function removeFromPending(id, options) {
  const shouldDeleteRemote = !!(options && options.deleteRemote);

  if (currentUser && shouldDeleteRemote) {
    const { error } = await supabaseClient.from("todos").delete().eq("id", id);
    if (error) {
      console.log("移除待處理代辦失敗", error);
      return;
    }
  }

  pendingTodos = pendingTodos.filter(function (item) {
    return item.id !== id;
  });
  renderPendingTodos();
}
function renderPendingTodos() {
  pendingTodosList.innerHTML = "";

  if (pendingTodos.length === 0) {
    pendingTodosSection.style.display = "none";
    return;
  }
  pendingTodosSection.style.display = "block";

  pendingTodos.forEach(function (item) {
    const pendingItem = document.createElement("div");
    pendingItem.className = "pending-item";

    const text = document.createElement("span");
    text.innerText = item.text;

    const toTodayButton = document.createElement("button");
    toTodayButton.type = "button";
    toTodayButton.innerText = "延到今天";
    toTodayButton.addEventListener("click", async function () {
      if (currentUser) {
        const { error } = await supabaseClient
          .from("todos")
          .update({ status: "active" })
          .eq("id", item.id);
        if (error) {
          console.log("延到今天失敗", error);
          return;
        }
      }
      todos.push({ id: item.id, text: item.text, done: false });
      await removeFromPending(item.id, { deleteRemote: false });
      refreshTodos();
    });

    const toGoalButton = document.createElement("button");
    toGoalButton.type = "button";
    toGoalButton.innerText = "加入本週目標";
    toGoalButton.addEventListener("click", async function () {
      if (currentUser) {
        const { data, error } = await supabaseClient
          .from("goals")
          .insert({
            user_id: currentUser.id,
            text: item.text,
            done: false,
            status: "active"
          })
          .select()
          .single();

        if (error) {
          console.log("加入本週目標失敗", error);
          return;
        }

        goals.push({
          id: data.id,
          text: data.text,
          done: data.done,
          counted: data.counted,
          completedDate: data.completed_date
        });
      } else {
        goals.push({
          id: `demo-goal-${Date.now()}`,
          text: item.text,
          done: false,
          counted: false
        });
      }
      await removeFromPending(item.id, { deleteRemote: true });
      refreshGoals();
    });

    const dropButton = document.createElement("button");
    dropButton.type = "button";
    dropButton.innerText = "放棄";
    dropButton.addEventListener("click", async function () {
      await removeFromPending(item.id, { deleteRemote: true });
    });

    pendingItem.appendChild(text);
    pendingItem.appendChild(toTodayButton);
    pendingItem.appendChild(toGoalButton);
    pendingItem.appendChild(dropButton);
    pendingTodosList.appendChild(pendingItem);
  });
}
function renderTodos() {
  todoList.innerHTML = "";

  todos.forEach(function (todo) {
    const todoItem = document.createElement("div");
    todoItem.className = "todo-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;

    checkbox.addEventListener("change", async function () {
      const newDone = checkbox.checked;

      if (currentUser) {
        const { error } = await supabaseClient
          .from("todos")
          .update({ done: newDone })
          .eq("id", todo.id);

        if (error) {
          console.log("更新待辦狀態失敗", error);
          checkbox.checked = todo.done; // 失敗就復原畫面上的勾選狀態
          return;
        }
      }

      if (newDone && !todo.done) {
        totalCompletedTodos++;
      } else if (!newDone && todo.done) {
        totalCompletedTodos--;
      }

      if (currentUser) {
        await supabaseClient
          .from("user_stats")
          .update({ total_completed_todos: totalCompletedTodos })
          .eq("user_id", currentUser.id);
      }

      todo.done = newDone;
      refreshTodos();
    });

    const text = document.createElement("span");
    text.innerText = todo.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.innerText = "刪除";

    deleteButton.addEventListener("click",function () {
    deleteTodo(todo.id);
    });

    todoItem.appendChild(checkbox);
    todoItem.appendChild(text);
    todoItem.appendChild(deleteButton);
    todoList.appendChild(todoItem);
  });

updateTodoProgress();
}
async function addTodo() {
  const newTodoText = todoInput.value.trim();

  if (newTodoText === "") return;

  if (currentUser) {
    const { data, error } = await supabaseClient
      .from("todos")
      .insert({
        user_id: currentUser.id,
        text: newTodoText,
        done: false,
        status: "active"
      })
      .select()
      .single();

    if (error) {
      console.log("新增待辦失敗", error);
      return;
    }

    todos.push({ id: data.id, text: data.text, done: data.done });
  } else {
    todos.push({
      id: `demo-${Date.now()}`,
      text: newTodoText,
      done: false
    });
  }

  todoInput.value = "";
  refreshTodos();
}
async function deleteTodo(id) {

  if (currentUser) {
    const { error } = await supabaseClient.from("todos").delete().eq("id", id);
    if (error) {
      console.log("刪除待辦失敗", error);
      return;
    }
  }

  todos = todos.filter(function (todo) {

    return todo.id !== id;

  });

  refreshTodos();

}
function updateTodoProgress() {
  const total = todos.length;
  const completed = todos.filter(todo => todo.done).length;

  todoProgress.innerText = `✅: ${completed} / ${total}`;
}

let todos = [];
let pendingTodos = [];
let totalCompletedTodos = 0;
const todoInput = document.getElementById("todo-input");
const todoList = document.getElementById("todo-list");
const todoProgress = document.getElementById("todo-progress");
const addTodoButton = document.getElementById("add-todo-button");
const pendingTodosSection = document.getElementById("pending-todos-section");
const pendingTodosList = document.getElementById("pending-todos-list");

addTodoButton.addEventListener("click", addTodo);
todoInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    addTodo();
  }
});
// ===================================================================

// ============待============處============理============提============醒============
// 待處理區塊本身用 CSS 持續呼吸動畫提醒（只要清單不空就會一直緩慢發光，
// 不需要抓準時間點）。這裡只處理分頁切到背景時的標題閃爍：
const ORIGINAL_TITLE = document.title;
let titleFlashOn = false;
let titleFlashTimer = null;

function startTitleFlash() {
  if (titleFlashTimer !== null) return; // 已經在閃了，不用重複啟動

  titleFlashTimer = setInterval(function () {
    if (pendingTodos.length === 0 && pendingGoals.length === 0) {
      stopTitleFlash();
      return;
    }
    titleFlashOn = !titleFlashOn;
    document.title = titleFlashOn ? "⏰ 有未處理事項" : ORIGINAL_TITLE;
  }, 1000);
}
function stopTitleFlash() {
  if (titleFlashTimer !== null) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  document.title = ORIGINAL_TITLE;
}

document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    startTitleFlash();
  } else {
    stopTitleFlash();
  }
});
// ===================================================================

// ============本============週============目============標============
// 這一塊已改成讀寫 Supabase 的 goals 表（登入後），用 status 欄位
// （active/pending/history）區分本週目標／待處理／歷程三種狀態；
// 未登入時走「示範模式」，只在記憶體裡操作，重新整理就恢復原狀。

// 示範模式用的固定範例資料，沿用原本當作預設值的那組介紹性任務。
const DEMO_GOALS = [
  { id: "demo-goal-1", text: "範例：打造建立 LifeOS 系統", done: false },
  { id: "demo-goal-2", text: "範例：整理想法及方向", done: true }
];

async function loadGoalsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("goals")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.log("讀取本週目標失敗", error);
    goals = [];
    return;
  }

  goals = data.map(row => ({
    id: row.id,
    text: row.text,
    done: row.done,
    counted: row.counted,
    completedDate: row.completed_date
  }));
}

async function loadPendingGoalsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("goals")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.log("讀取待處理目標失敗", error);
    pendingGoals = [];
    return;
  }

  pendingGoals = data.map(row => ({ id: row.id, text: row.text, done: row.done }));
}

async function loadGoalHistoryFromSupabase() {
  const { data, error } = await supabaseClient
    .from("goals")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("status", "history")
    .order("completed_date", { ascending: true });

  if (error) {
    console.log("讀取目標歷程失敗", error);
    goalHistory = [];
    return;
  }

  goalHistory = data.map(row => ({ id: row.id, text: row.text, completedDate: row.completed_date }));
}

// 檢查是否跨週：跨週的話，完成的目標搬進 history 狀態永久保留，
// 未完成的目標搬進 pending 狀態等使用者決定去留。
async function checkGoalWeekRolloverCloud() {
  const thisSunday = thisSundayDateString();

  const { data: stats } = await supabaseClient
    .from("user_stats")
    .select("last_goal_week_start")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  const lastSunday = stats && stats.last_goal_week_start ? stats.last_goal_week_start : thisSunday;

  if (lastSunday !== thisSunday) {
    const today = todayDateString();

    const { data: activeGoals, error } = await supabaseClient
      .from("goals")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("status", "active");

    if (!error && activeGoals) {
      const doneIds = activeGoals.filter(g => g.done).map(g => g.id);
      const undoneIds = activeGoals.filter(g => !g.done).map(g => g.id);
      const doneMissingDateIds = activeGoals
        .filter(g => g.done && !g.completed_date)
        .map(g => g.id);

      if (doneMissingDateIds.length > 0) {
        // 理論上打勾當下就會記錄 completed_date，這裡只是保險：
        // 萬一有漏記的舊資料，跨週時用今天補上，避免留空值。
        await supabaseClient
          .from("goals")
          .update({ completed_date: today })
          .in("id", doneMissingDateIds);
      }
      if (doneIds.length > 0) {
        await supabaseClient
          .from("goals")
          .update({ status: "history" })
          .in("id", doneIds);
      }
      if (undoneIds.length > 0) {
        await supabaseClient
          .from("goals")
          .update({ status: "pending" })
          .in("id", undoneIds);
      }
    }

    await supabaseClient
      .from("user_stats")
      .update({ last_goal_week_start: thisSunday })
      .eq("user_id", currentUser.id);
  }
}

// 登入成功後：user_stats 已經在 ensureUserStatsRow 準備好，
// 這裡先檢查跨週，再把雲端資料載入畫面。
async function initGoalsForUser() {
  await checkGoalWeekRolloverCloud();
  await loadGoalsFromSupabase();
  await loadPendingGoalsFromSupabase();
  await loadGoalHistoryFromSupabase();
  renderGoals();
  renderPendingGoals();
  renderGoalHistory();
  updatePlayerPanel();
}

// 未登入：套用示範資料，純記憶體操作，不寫入任何地方。
// 目標歷程未登入時不顯示示範資料，改在 renderGoalHistory 顯示提示文字。
function initGoalsForGuest() {
  goals = DEMO_GOALS.map(item => ({
    id: item.id,
    text: item.text,
    done: item.done,
    counted: !!item.done,
    completedDate: undefined
  }));
  pendingGoals = [];
  totalCompletedGoals = goals.filter(goal => goal.done).length;
  goalHistory = [];
  renderGoals();
  renderPendingGoals();
  renderGoalHistory();
  updatePlayerPanel();
}

function refreshGoals() {
  renderGoals();
  updatePlayerPanel();
}

// options.deleteRemote：true 代表這筆待處理目標要在 Supabase 裡徹底刪除（放棄）；
// false 代表資料庫端已經處理好狀態（例如繼續保留已經把 status 改回 active），
// 這裡只需要更新畫面上的清單。
async function removeFromPendingGoals(id, options) {
  const shouldDeleteRemote = !!(options && options.deleteRemote);

  if (currentUser && shouldDeleteRemote) {
    const { error } = await supabaseClient.from("goals").delete().eq("id", id);
    if (error) {
      console.log("移除待處理目標失敗", error);
      return;
    }
  }

  pendingGoals = pendingGoals.filter(function (item) {
    return item.id !== id;
  });
  renderPendingGoals();
}
function renderPendingGoals() {
  pendingGoalsList.innerHTML = "";

  if (pendingGoals.length === 0) {
    pendingGoalsSection.style.display = "none";
    return;
  }
  pendingGoalsSection.style.display = "block";

  pendingGoals.forEach(function (item) {
    const pendingItem = document.createElement("div");
    pendingItem.className = "pending-item";

    const text = document.createElement("span");
    text.innerText = item.text;

    const keepButton = document.createElement("button");
    keepButton.type = "button";
    keepButton.innerText = "繼續保留";
    keepButton.addEventListener("click", async function () {
      if (currentUser) {
        const { error } = await supabaseClient
          .from("goals")
          .update({ status: "active" })
          .eq("id", item.id);
        if (error) {
          console.log("繼續保留失敗", error);
          return;
        }
      }
      goals.push({ id: item.id, text: item.text, done: false, counted: false });
      await removeFromPendingGoals(item.id, { deleteRemote: false });
      refreshGoals();
    });

    const dropButton = document.createElement("button");
    dropButton.type = "button";
    dropButton.innerText = "放棄";
    dropButton.addEventListener("click", async function () {
      await removeFromPendingGoals(item.id, { deleteRemote: true });
    });

    pendingItem.appendChild(text);
    pendingItem.appendChild(keepButton);
    pendingItem.appendChild(dropButton);
    pendingGoalsList.appendChild(pendingItem);
  });
}
function buildGoalHistoryCard(item) {
  // 重用 .reflection-card 樣式：兩種資料雖然意義不同，
  // 但呈現方式（日期＋內容）一樣，不需要另外寫一份 CSS。
  const card = document.createElement("div");
  card.className = "reflection-card";

  const date = document.createElement("h3");
  date.textContent = item.completedDate;

  const content = document.createElement("p");
  content.textContent = item.text;

  card.appendChild(date);
  card.appendChild(content);
  // 這裡刻意不放刪除按鈕：目標歷程要永久保留，視為人生走過的痕跡，
  // 跟 Todo／pendingGoals 不同，不該有任何方式可以清掉它。
  return card;
}
function renderGoalHistory() {
  goalHistoryList.innerHTML = "";

  if (!currentUser) {
    const hint = document.createElement("p");
    hint.textContent = "登入後即可查看你的目標歷程紀錄。";
    goalHistoryList.appendChild(hint);
    return;
  }

  const sortedHistory = goalHistory.slice().reverse();

  if (sortedHistory.length > 0) {
    goalHistoryList.appendChild(buildGoalHistoryCard(sortedHistory[0]));
  }

  if (sortedHistory.length > 1) {
    const historyButton = document.createElement("button");
    historyButton.className = "history-button";
    historyButton.textContent = `查看歷史紀錄（共 ${sortedHistory.length} 篇）`;
    historyButton.addEventListener("click", function () {
      openGoalHistoryModal();
    });
    goalHistoryList.appendChild(historyButton);
  }
}
function openGoalHistoryModal() {
  activeHistoryModal = "goal";
  const sortedHistory = goalHistory.slice().reverse();

  historyModalTitle.textContent = `🏅 目標歷程（共 ${sortedHistory.length} 篇）`;
  historyModalContent.innerHTML = "";
  sortedHistory.forEach(function (item) {
    historyModalContent.appendChild(buildGoalHistoryCard(item));
  });

  historyModalOverlay.style.display = "flex";
}
function renderGoals() {
  goalList.innerHTML = "";
    
  goals.forEach((goal, index) => {
    const goalItem = document.createElement("div");
    goalItem.className = "goal-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = goal.done;

    checkbox.addEventListener("change", async () => {
      const newDone = checkbox.checked;
      const today = todayDateString();

      if (currentUser) {
        const updatePayload = { done: newDone };
        if (newDone && !goal.counted) {
          updatePayload.counted = true;
          updatePayload.completed_date = today;
        } else if (!newDone && goal.counted) {
          updatePayload.counted = false;
          updatePayload.completed_date = null;
        }

        const { error } = await supabaseClient
          .from("goals")
          .update(updatePayload)
          .eq("id", goal.id);

        if (error) {
          console.log("更新目標狀態失敗", error);
          checkbox.checked = goal.done;
          return;
        }
      }

      if (newDone && !goal.counted) {
        totalCompletedGoals++;
        goal.counted = true;
        goal.completedDate = today;
      } else if (!newDone && goal.counted) {
        totalCompletedGoals--;
        goal.counted = false;
        delete goal.completedDate;
      }

      if (currentUser) {
        await supabaseClient
          .from("user_stats")
          .update({ total_completed_goals: totalCompletedGoals })
          .eq("user_id", currentUser.id);
      }

      goal.done = newDone;
      refreshGoals();
    });

    const text = document.createElement("span");
    text.innerText = goal.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.innerText = "刪除";

    deleteButton.addEventListener("click", () => {
      deleteGoal(goal.id);
    });

    goalItem.appendChild(checkbox);
    goalItem.appendChild(text);
    goalItem.appendChild(deleteButton);
    goalList.appendChild(goalItem);
  });

  updateGoalProgress();
}
async function addGoal() {
  const newGoalText = goalInput.value.trim();

  if (newGoalText === "") {
    return;
  }

  if (currentUser) {
    const { data, error } = await supabaseClient
      .from("goals")
      .insert({
        user_id: currentUser.id,
        text: newGoalText,
        done: false,
        status: "active"
      })
      .select()
      .single();

    if (error) {
      console.log("新增目標失敗", error);
      return;
    }

    goals.push({
      id: data.id,
      text: data.text,
      done: data.done,
      counted: data.counted,
      completedDate: data.completed_date
    });
  } else {
    goals.push({
      id: `demo-goal-${Date.now()}`,
      text: newGoalText,
      done: false,
      counted: false
    });
  }

  goalInput.value = "";
  refreshGoals();
}
async function deleteGoal(id) {
  if (currentUser) {
    const { error } = await supabaseClient.from("goals").delete().eq("id", id);
    if (error) {
      console.log("刪除目標失敗", error);
      return;
    }
  }

  goals = goals.filter(function (goal) {
    return goal.id !== id;
  });

  refreshGoals();
}
function updateGoalProgress() {
  const total = goals.length;
  const completed = goals.filter(goal => goal.done).length;

  goalProgress.innerText = `🏆: ${completed} / ${total}`;
}
let goals = [];
let pendingGoals = [];
let totalCompletedGoals = 0;
let goalHistory = [];
const goalInput = document.getElementById("goal-input");
const goalList = document.getElementById("goal-list");
const goalProgress = document.getElementById("weekly-progress");
const addGoalButton = document.getElementById("add-goal-button");
const pendingGoalsSection = document.getElementById("pending-goals-section");
const pendingGoalsList = document.getElementById("pending-goals-list");
const goalHistoryList = document.getElementById("goal-history-list");

addGoalButton.addEventListener("click", addGoal);
goalInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    addGoal();
  }
});
// ===================================================================

// ============反============思============面============板============
// 這一塊已改成讀寫 Supabase 的 reflections 表（登入後）；
// 未登入時走「示範模式」，只在記憶體裡操作，重新整理就恢復原狀。

// 示範模式用的固定範例資料，date 用今天，讓「今日已儲存」的狀態文字也能正常展示。
const DEMO_REFLECTIONS = [
  { id: "demo-reflection-1", date: todayDateString(), text: "範例：今天最大的收穫，是搞懂 LifeOS 怎麼使用。" }
];

function loadReflection() {
  // 不再讀取舊的 "todayReflection"，改成統一以 reflections 陣列為唯一資料來源，
  // 直接查詢「今天是否已經有反思」來決定狀態文字要顯示什麼。
  const todayReflection = findTodayReflection();

  if (todayReflection !== undefined) {
    reflectionStatus.innerText = `✅ 今日已儲存（${todayReflection.date}）`;
  } else {
    reflectionStatus.innerText = "尚未儲存今日反思";
  }
}
async function saveReflection() {
  const reflectionText = reflectionInput.value.trim();
  if (!reflectionText) return;
  const today = todayDateString();
  const todayReflection = findTodayReflection();

  if (todayReflection === undefined) {
    if (currentUser) {
      const { data, error } = await supabaseClient
        .from("reflections")
        .insert({ user_id: currentUser.id, text: reflectionText, date: today })
        .select()
        .single();

      if (error) {
        console.log("新增反思失敗", error);
        return;
      }

      reflections.push({ id: data.id, date: data.date, text: data.text });
    } else {
      reflections.push({ id: `demo-reflection-${Date.now()}`, date: today, text: reflectionText });
    }
  } else {
    if (currentUser) {
      const { error } = await supabaseClient
        .from("reflections")
        .update({ text: reflectionText })
        .eq("id", todayReflection.id);

      if (error) {
        console.log("更新反思失敗", error);
        return;
      }
    }
    todayReflection.text = reflectionText;
  }

  renderReflections();

  // 儲存 = 完成一個動作：清空輸入框，並立即給予儲存成功的回饋，
  // 不然使用者存了反思，畫面上完全看不出來有沒有存到。
  reflectionInput.value = "";
  reflectionInput.style.height = "";
  reflectionStatus.innerText = `✅ 已儲存（${today}）`;
}
async function loadReflectionsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("reflections")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("date", { ascending: true });

  if (error) {
    console.log("讀取反思失敗", error);
    reflections = [];
    return;
  }

  reflections = data.map(row => ({ id: row.id, date: row.date, text: row.text }));
}
async function initReflectionsForUser() {
  await loadReflectionsFromSupabase();
  renderReflections();
  loadReflection();
}
function initReflectionsForGuest() {
  reflections = DEMO_REFLECTIONS.map(item => ({ id: item.id, date: item.date, text: item.text }));
  renderReflections();
  loadReflection();
}
function buildReflectionCard(reflection) {

    const reflectionCard = document.createElement("div");
    reflectionCard.className = "reflection-card";

    const date = document.createElement("h3");
    date.textContent = reflection.date;

    const content = document.createElement("p");
    content.textContent = reflection.text;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "刪除";

    deleteButton.addEventListener("click", function () {

        deleteReflection(reflection.id);

    });

    reflectionCard.appendChild(date);
    reflectionCard.appendChild(content);
    reflectionCard.appendChild(deleteButton);

    return reflectionCard;

}
function renderReflections() {

    reflectionList.innerHTML = "";

    // 資料本身不變，只在「呈現」這一層把最新的排到最前面。
    const sortedReflections = reflections.slice().reverse();

    if (sortedReflections.length > 0) {
        reflectionList.appendChild(buildReflectionCard(sortedReflections[0]));
    }

    if (sortedReflections.length > 1) {
        const historyButton = document.createElement("button");
        historyButton.className = "history-button";
        historyButton.textContent = `查看歷史紀錄（共 ${sortedReflections.length} 篇）`;

        historyButton.addEventListener("click", function () {
            openReflectionHistoryModal();
        });

        reflectionList.appendChild(historyButton);
    }

}
function openReflectionHistoryModal() {
    activeHistoryModal = "reflection";
    const sortedReflections = reflections.slice().reverse();

    historyModalTitle.textContent = `💭 反思歷程（共 ${sortedReflections.length} 篇）`;
    historyModalContent.innerHTML = "";
    sortedReflections.forEach(function (reflection) {
        historyModalContent.appendChild(buildReflectionCard(reflection));
    });

    historyModalOverlay.style.display = "flex";
}
function findTodayReflection() {

    const today = todayDateString();

    const todayReflection = reflections.find(reflection => {
        return reflection.date === today;
    });

    return todayReflection;
}
async function deleteReflection(id) {

    if (currentUser) {
        const { error } = await supabaseClient.from("reflections").delete().eq("id", id);
        if (error) {
            console.log("刪除反思失敗", error);
            return;
        }
    }

    reflections = reflections.filter(function (reflection) {

        return reflection.id !== id;

    });

    renderReflections();

    if (historyModalOverlay.style.display !== "none" && activeHistoryModal === "reflection") {
        openReflectionHistoryModal();
    }

}

let reflections = [

];
const reflectionInput = document.getElementById("reflection-input");
// ============歷============史============紀============錄============Modal============
// Reflection 跟 Goal History 共用同一個彈窗，只是內容跟標題動態換。
let activeHistoryModal = null; // "reflection" 或 "goal"，用來知道刪除後該刷新哪一種內容
const historyModalOverlay = document.getElementById("history-modal-overlay");
const historyModalTitle = document.getElementById("history-modal-title");
const historyModalClose = document.getElementById("history-modal-close");
const historyModalContent = document.getElementById("history-modal-content");

function closeHistoryModal() {
  historyModalOverlay.style.display = "none";
  activeHistoryModal = null;
}

historyModalClose.addEventListener("click", closeHistoryModal);

// 點視窗外面的空白處也關閉，是常見的 modal 互動慣例。
historyModalOverlay.addEventListener("click", function (event) {
  if (event.target === historyModalOverlay) {
    closeHistoryModal();
  }
});
const reflectionList = document.getElementById("reflection-list");
const reflectionStatus = document.getElementById("reflection-status");
const saveReflectionButton = document.getElementById("save-reflection-button");
// 拿掉手動拉伸後，改成自動長高：文字打到超過目前高度，框框就自動往下擴展。
function autoGrowReflectionInput() {
  reflectionInput.style.height = "auto";
  reflectionInput.style.height = reflectionInput.scrollHeight + "px";
}
reflectionInput.addEventListener("input", autoGrowReflectionInput);

saveReflectionButton.addEventListener("click", saveReflection);
// ===================================================================

// ============玩============家============面============板============(計算玩家能力)
function updatePlayerPanel() {
  const completedGoals = goals.filter(goal => goal.done).length;
  const exp = totalCompletedTodos * 10 + totalCompletedGoals * 100;
  const level = Math.floor(exp / 100) + 1;
  const currentLevelExp = exp % 100;
  const totalGoals = goals.length;
  let healthScore = 0;
    if (health.sleepHours >= 7) {
      healthScore = healthScore + 40;
    }
    if (health.waterCups >= 6) {
      healthScore = healthScore + 30;
    }
    if (health.exercised === true) {
      healthScore = healthScore + 30;
    }

  if (playerLevel) playerLevel.innerText = `等級: Lv.${level}`;
  if (playerExp) playerExp.innerText = `經驗值：${currentLevelExp} / 100 EXP`;
  if (expProgress) expProgress.style.width = `${currentLevelExp}%`;
  if (wealthStat) wealthStat.innerText = `財富：淨資產 $${financeNetWorth.toLocaleString()}`;
  if (healthStat) healthStat.innerText = `健康：${healthScore} / 100`;
  if (goalStat) goalStat.innerText = `目標：${completedGoals} / ${totalGoals}`;
}
const playerLevel = document.getElementById("player-level");
const playerExp = document.getElementById("player-exp");
const wealthStat = document.getElementById("wealth-stat");
const healthStat = document.getElementById("health-stat");
const goalStat = document.getElementById("goal-stat");
const expProgress = document.getElementById("exp-progress");
// ===================================================================

// ============財============富============面============板============
// Phase 1（資產總覽／淨資產快照）：帳戶資料改讀寫 Supabase 的 finance_accounts 表。
// 每個帳戶分「資產」或「負債」（Facts，見 DD #001），並依分類細分類型：
// 資產類型（現金/銀行存款/股票/ETF/基金/保單/加密貨幣/其他）
// 負債類型（信用卡未繳/房貸/車貸/信貸/其他）
// 對應 Development Log #010 決策四十一的分期規劃，分類設計對應 DD #001。
// account_type 欄位本身是純文字，前端用 <input list> + <datalist> 呈現，
// 依目前選的「資產/負債」動態切換要顯示哪一套建議清單，
// 使用者可以直接輸入清單外的新類型，之後這個新類型也會自動出現在建議清單裡。
// 收支記錄、預算比對、現金流拆分屬於 Phase 2/3，這裡先不處理。
let financeAccounts = [];
// 給玩家面板用的即時淨資產（決策：Phase 1 先用「淨資產」取代原本假資料算出的「儲蓄率」，
// 等 Phase 2 有真實收支資料後，只新增儲蓄率顯示，不覆蓋淨資產顯示）。
let financeNetWorth = 0;

// 資產類型／負債類型的預設建議清單，只是 datalist 的起始選項，不是強制限制。
// 依照 DD #001：資產/負債（本質分類）與用途（人生角色）是不同層級，
// 「資產類型」跟「負債類型」也是兩套獨立的語意，不應該共用同一份清單
//（例如信用卡未繳是負債類型，不是資產類型的一種）。
const ASSET_TYPE_PRESETS = ["現金", "銀行存款", "股票", "ETF", "基金", "保單", "加密貨幣", "其他"];
const LIABILITY_TYPE_PRESETS = ["信用卡未繳", "房貸", "車貸", "信貸", "其他"];

const DEMO_FINANCE_ACCOUNTS = [
  { id: "demo-finance-1", name: "示範銀行", purpose: "負責日常生活開銷", category: "asset", account_type: "銀行存款", balance: 50000, display_order: 0 },
  { id: "demo-finance-2", name: "示範券商", purpose: "股票投資帳戶", category: "asset", account_type: "股票", balance: 30000, display_order: 1 },
  { id: "demo-finance-3", name: "示範保單", purpose: "儲蓄險", category: "asset", account_type: "保單", balance: 5000, display_order: 2 },
  { id: "demo-finance-4", name: "示範信用卡", purpose: "信用卡消費", category: "liability", account_type: "信用卡未繳", balance: 3000, display_order: 0 }
];

const financeNameInput = document.getElementById("finance-name-input");
const financePurposeInput = document.getElementById("finance-purpose-input");
const financeCategorySelect = document.getElementById("finance-category-select");
const financeTypeInput = document.getElementById("finance-type-input");
const financeTypeList = document.getElementById("finance-type-list");
const financeBalanceInput = document.getElementById("finance-balance-input");
const financeCountInAvailableInput = document.getElementById("finance-count-in-available-input");
const financeAddButton = document.getElementById("finance-add-button");
const financeAssetsList = document.getElementById("finance-assets-list");
const financeLiabilitiesList = document.getElementById("finance-liabilities-list");
const financeAssetsEmpty = document.getElementById("finance-assets-empty");
const financeLiabilitiesEmpty = document.getElementById("finance-liabilities-empty");
const financeTotalAssetsText = document.getElementById("finance-total-assets");
const financeTotalLiabilitiesText = document.getElementById("finance-total-liabilities");
const financeNetWorthText = document.getElementById("finance-net-worth");

// ---- Phase 2：finance_transactions（記帳） ----
// 決策（本輪交接）：記帳同時自動連動帳戶餘額，不需要使用者事後手動對帳。
// type 分三種：income／expense（單一帳戶）、transfer（來源/目標兩個帳戶）。
// 交易列表中轉帳只顯示一筆「A → B」，底層仍各自增減兩個帳戶餘額（見本輪交接討論）。
let financeTransactions = [];
let financeTxPresets = [];
let selectedTxType = "expense";

const DEMO_FINANCE_TRANSACTIONS = [
  { id: "demo-tx-1", type: "income", account_id: "demo-finance-1", from_account_id: null, to_account_id: null, amount: 52000, category: "薪資", tag: "收入", occurred_on: new Date().toISOString().split("T")[0] },
  { id: "demo-tx-2", type: "expense", account_id: "demo-finance-1", from_account_id: null, to_account_id: null, amount: 3000, category: "日本旅費預留", tag: "旅遊", occurred_on: new Date().toISOString().split("T")[0] },
  { id: "demo-tx-3", type: "transfer", account_id: null, from_account_id: "demo-finance-1", to_account_id: "demo-finance-4", amount: 8200, category: "信用卡結算", tag: "信用卡", occurred_on: new Date().toISOString().split("T")[0] }
];

const financeTxTypeButtons = document.querySelectorAll("#finance-tx-type-toggle .finance-tx-type-button");
const financeTxSingleAccountField = document.getElementById("finance-tx-single-account-field");
const financeTxTransferFields = document.getElementById("finance-tx-transfer-fields");
const financeTxAccountSelect = document.getElementById("finance-tx-account-select");
const financeTxFromSelect = document.getElementById("finance-tx-from-select");
const financeTxToSelect = document.getElementById("finance-tx-to-select");
const financeTxAmountInput = document.getElementById("finance-tx-amount-input");
const financeTxDateInput = document.getElementById("finance-tx-date-input");
const financeTxCategoryInput = document.getElementById("finance-tx-category-input");
const financeTxTagInput = document.getElementById("finance-tx-tag-input");

// 快捷紀錄相關 DOM：主記帳彈窗裡的快捷按鈕列，跟另一個獨立的「快捷設定」彈窗（新增/編輯/刪除快捷本身）。
const financeTxPresetRow = document.getElementById("finance-tx-preset-row");
const financeTxPresetModalOverlay = document.getElementById("finance-tx-preset-modal-overlay");
const financeTxPresetModalClose = document.getElementById("finance-tx-preset-modal-close");
const financeTxPresetTypeButtons = document.querySelectorAll("#finance-tx-preset-type-toggle .finance-tx-type-button");
const financeTxPresetSingleAccountField = document.getElementById("finance-tx-preset-single-account-field");
const financeTxPresetTransferFields = document.getElementById("finance-tx-preset-transfer-fields");
const financeTxPresetAccountSelect = document.getElementById("finance-tx-preset-account-select");
const financeTxPresetFromSelect = document.getElementById("finance-tx-preset-from-select");
const financeTxPresetToSelect = document.getElementById("finance-tx-preset-to-select");
const financeTxPresetLabelInput = document.getElementById("finance-tx-preset-label-input");
const financeTxPresetAmountInput = document.getElementById("finance-tx-preset-amount-input");
const financeTxPresetCategoryInput = document.getElementById("finance-tx-preset-category-input");
const financeTxPresetTagSlot = document.getElementById("finance-tx-preset-tag-slot");
const financeTxPresetSaveButton = document.getElementById("finance-tx-preset-save-button");
const financeTxPresetDeleteButton = document.getElementById("finance-tx-preset-delete-button");
const financeTxTagToggle = document.getElementById("finance-tx-tag-toggle");
const financeTxTagDropdown = document.getElementById("finance-tx-tag-dropdown");
const financeTxAddButton = document.getElementById("finance-tx-add-button");

// ---- Phase 3：finance_budget_items（分配總覽，DD-001 Intentions 層落地） ----
// 一筆 budget_item = 某個帳戶裡「一項規劃好的用途與金額」（例如「玉山銀行·三商壽險保費·10896」）。
// 跟交易的關聯是直接外鍵 budget_item_id，不用 tag 文字比對——
// 因為同一個帳戶底下常常有多筆同類型但用途不同的分配（例如兩張保單都想歸類「保費」），
// tag 文字比對沒辦法分清楚該算給哪一筆，直接關聯才精準（見討論記錄）。
let financeBudgetItems = [];
let selectedFinanceTxBudgetItemId = null; // 記帳表單當下選定/確認的分配項目，送出後隨表單重置

const financeBudgetOpenButton = document.getElementById("finance-budget-open-button");
const financeBudgetModalOverlay = document.getElementById("finance-budget-modal-overlay");
const financeBudgetModalClose = document.getElementById("finance-budget-modal-close");
const financeBudgetAddToggle = document.getElementById("finance-budget-add-toggle");
const financeBudgetAddSection = document.getElementById("finance-budget-add-section");
const financeBudgetAccountSelect = document.getElementById("finance-budget-account-select");
const financeBudgetLabelInput = document.getElementById("finance-budget-label-input");
const financeBudgetAmountInput = document.getElementById("finance-budget-amount-input");
const financeBudgetTagSlot = document.getElementById("finance-budget-tag-slot");
const financeBudgetCycleSelect = document.getElementById("finance-budget-cycle-select");
const financeBudgetSaveButton = document.getElementById("finance-budget-save-button");
const financeBudgetEmpty = document.getElementById("finance-budget-empty");
const financeBudgetList = document.getElementById("finance-budget-list");
let financeBudgetTagPicker = null;
let financeBudgetEditingId = null; // 目前正在編輯的分配項目 id，null 代表是「新增」模式

// 主畫面的可運用資金摘要標籤：平常收合不佔畫面，點一下才展開看三個數字
// （見討論記錄：分配總覽彈窗拆掉之後，這組摘要數字要找地方安置，決定收成隱藏式標籤）。
const financeForecastToggle = document.getElementById("finance-forecast-toggle");
const financeForecastPanel = document.getElementById("finance-forecast-panel");
const financeForecastCurrent = document.getElementById("finance-forecast-current");
const financeForecastMonthly = document.getElementById("finance-forecast-monthly");
const financeForecastAvailable = document.getElementById("finance-forecast-available");

// 主畫面帳戶卡片的展開狀態：記在這個集合裡，renderFinanceAccounts() 每次重畫都會照著這個集合
// 決定哪些卡片要保持展開，避免每次資料一有異動重新渲染，使用者展開的卡片又全部收回去。
const expandedFinanceAccountIds = new Set();

const financeTxBudgetSuggestion = document.getElementById("finance-tx-budget-suggestion");
const financeTxBudgetSuggestionLabel = document.getElementById("finance-tx-budget-suggestion-label");
const financeTxBudgetSuggestionMeta = document.getElementById("finance-tx-budget-suggestion-meta");
const financeTxBudgetSuggestionConfirm = document.getElementById("finance-tx-budget-suggestion-confirm");
const financeTxBudgetSuggestionChange = document.getElementById("finance-tx-budget-suggestion-change");
const financeTxBudgetManualWrap = document.getElementById("finance-tx-budget-manual-wrap");
const financeTxBudgetManualSelect = document.getElementById("finance-tx-budget-manual-select");
let financeTxBudgetSuggestedId = null; // 目前猜出來、還沒被使用者確認的建議項目 id

// 分類標籤建議清單 = 使用者用過的所有標籤（去重），沒有預設清單，純粹從實際使用中累積，
// 跟資產類型的 datalist 是同一套設計邏輯，只是這裡改用自製下拉選單呈現（手機上比 datalist 直覺）。
function getFinanceTxUsedTags() {
  return [...new Set(financeTransactions.map(tx => tx.tag).filter(Boolean))];
}

// 重新命名標籤：批次把所有用過舊標籤名稱的交易，改成新名稱，
// 不用一筆一筆手動改，也不用另外蓋一個標籤資料庫——效果一樣，但不用動資料表結構、風險小很多。
async function renameFinanceTag(oldTag, newTag) {
  const affected = financeTransactions.filter(tx => tx.tag === oldTag);
  if (affected.length === 0) return true;

  if (currentUser) {
    const { error } = await supabaseClient
      .from("finance_transactions")
      .update({ tag: newTag })
      .eq("user_id", currentUser.id)
      .eq("tag", oldTag);

    if (error) {
      console.log("重新命名標籤失敗", error);
      alert("重新命名失敗，請稍後再試一次。");
      return false;
    }
  }

  affected.forEach(function (tx) { tx.tag = newTag; });
  return true;
}

// 依目前輸入框的文字篩選標籤清單（空字串時顯示全部），並畫出下拉選單內容。
function renderFinanceTxTagDropdown() {
  if (!financeTxTagDropdown) return;
  const keyword = financeTxTagInput.value.trim().toLowerCase();
  const usedTags = getFinanceTxUsedTags().filter(tag =>
    !keyword || tag.toLowerCase().includes(keyword)
  );

  financeTxTagDropdown.innerHTML = "";

  if (usedTags.length === 0) {
    const empty = document.createElement("div");
    empty.className = "finance-tx-tag-empty";
    empty.textContent = "還沒有用過的標籤，直接輸入新標籤即可";
    financeTxTagDropdown.appendChild(empty);
    return;
  }

  usedTags.forEach(function (tag) {
    const option = document.createElement("div");
    option.className = "finance-tx-tag-option finance-tx-tag-option-row";

    const label = document.createElement("span");
    label.className = "finance-tx-tag-option-label";
    label.textContent = tag;
    option.appendChild(label);

    // 標籤內容想事後補充/修改，不用把用過這個標籤的每一筆都刪掉重打——
    // 點✏️直接改標籤本身的名稱，所有用過它的交易會一起自動更新。
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "finance-tx-tag-rename-button";
    renameButton.textContent = "✏️";
    renameButton.title = "重新命名這個標籤（會套用到所有用過它的交易）";
    renameButton.addEventListener("click", function (event) {
      event.stopPropagation();
      const newTag = window.prompt("重新命名標籤（會套用到所有用過這個標籤的交易）：", tag);
      if (newTag === null) return;
      const trimmed = newTag.trim();
      if (!trimmed || trimmed === tag) return;

      renameButton.disabled = true;
      renameFinanceTag(tag, trimmed).then(function (ok) {
        if (ok) {
          if (financeTxCurrentTagFilter === tag) financeTxCurrentTagFilter = trimmed;
          renderFinanceTxTagDropdown();
          refreshFinanceTxDetailModal();
        } else {
          renameButton.disabled = false;
        }
      });
    });
    option.appendChild(renameButton);

    option.addEventListener("click", function () {
      financeTxTagInput.value = tag;
      financeTxTagDropdown.style.display = "none";
    });
    financeTxTagDropdown.appendChild(option);
  });
}

function refreshFinanceTxTagSuggestions() {
  renderFinanceTxTagDropdown();
}

if (financeTxTagToggle && financeTxTagDropdown && financeTxTagInput) {
  financeTxTagToggle.addEventListener("click", function () {
    const isOpen = financeTxTagDropdown.style.display !== "none";
    if (isOpen) {
      financeTxTagDropdown.style.display = "none";
    } else {
      renderFinanceTxTagDropdown();
      financeTxTagDropdown.style.display = "block";
    }
  });

  // 使用者自己打字篩選標籤時，即時更新下拉選單內容並保持開啟。
  financeTxTagInput.addEventListener("input", function () {
    renderFinanceTxTagDropdown();
    financeTxTagDropdown.style.display = "block";
  });

  // 點擊/聚焦輸入框本身也直接開啟下拉選單，不用非得精準點到旁邊的 ▾ 按鈕——
  // 單手（尤其走路時用另一隻手）操作時，輸入框本身面積比小按鈕好點很多。
  // 使用者可以繼續打字篩選，也可以直接點清單裡的項目。
  financeTxTagInput.addEventListener("focus", function () {
    renderFinanceTxTagDropdown();
    financeTxTagDropdown.style.display = "block";
  });

  // 點擊標籤輸入區塊以外的地方時自動收合，避免擋住其他表單欄位。
  document.addEventListener("click", function (event) {
    const wrap = document.getElementById("finance-tx-tag-wrap");
    if (wrap && !wrap.contains(event.target)) {
      financeTxTagDropdown.style.display = "none";
    }
  });
}


// 記帳帳戶預設值：記住使用者「支出」「收入」「轉帳來源」「轉帳目標」各自最後一次選了哪個帳戶，
// 下次開記帳視窗自動預選，不用每次手動找（例如支出幾乎都用現金）。純前端記憶，不動資料庫。
function getPreferredAccountStorageKey(role) {
  return `lifeos_finance_tx_preferred_account_${role}`;
}

function applyPreferredAccountDefault(selectEl, role) {
  if (!selectEl) return;
  try {
    const stored = localStorage.getItem(getPreferredAccountStorageKey(role));
    if (stored && Array.from(selectEl.options).some(function (o) { return o.value === stored; })) {
      selectEl.value = stored;
    }
  } catch (e) {
    // 讀不到 localStorage（例如隱私模式）就略過，退回原本行為。
  }
}

function savePreferredAccountDefault(role, accountId) {
  try {
    localStorage.setItem(getPreferredAccountStorageKey(role), accountId);
  } catch (e) {
    // 存不進去就算了，不影響記帳本身。
  }
}

function applyPreferredDefaultsForCurrentType() {
  if (selectedTxType === "transfer") {
    applyPreferredAccountDefault(financeTxFromSelect, "transfer_from");
    applyPreferredAccountDefault(financeTxToSelect, "transfer_to");
  } else {
    applyPreferredAccountDefault(financeTxAccountSelect, selectedTxType);
  }
}

// 類型切換（支出/收入/轉帳）：切換單一帳戶欄位跟轉帳來源/目標欄位的顯示，
// 並套用這個類型上次記住的預設帳戶。
financeTxTypeButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    selectedTxType = button.dataset.txType;
    financeTxTypeButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn === button);
    });
    const isTransfer = selectedTxType === "transfer";
    financeTxSingleAccountField.style.display = isTransfer ? "none" : "";
    financeTxTransferFields.style.display = isTransfer ? "flex" : "none";
    applyPreferredDefaultsForCurrentType();
    resetFinanceTxBudgetSuggestion();
    updateFinanceTxBudgetSuggestion();
  });
});

// 記帳表單的帳戶下拉選單，直接動態抓目前所有帳戶（不維護固定清單），
// 新增/刪除/編輯帳戶後都會重新呼叫這個函式同步（見 renderFinanceAccounts）。
function refreshFinanceTxAccountOptions() {
  [financeTxAccountSelect, financeTxFromSelect, financeTxToSelect].forEach(function (selectEl) {
    if (!selectEl) return;
    const previousValue = selectEl.value;
    selectEl.innerHTML = "";
    financeAccounts.forEach(function (account) {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = account.name;
      selectEl.appendChild(option);
    });
    if (previousValue && financeAccounts.some(function (a) { return a.id === previousValue; })) {
      selectEl.value = previousValue;
    }
  });
}

// 日期欄位預設帶入今天，仍可手動編輯（供事後補登用）。
function setFinanceTxDateToday() {
  if (!financeTxDateInput) return;
  financeTxDateInput.value = new Date().toISOString().split("T")[0];
}

async function loadFinanceAccountsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("finance_accounts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("display_order", { ascending: true });

  if (error) {
    console.log("讀取財務帳戶失敗", error);
    financeAccounts = [];
    return;
  }

  financeAccounts = data.map(row => ({
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    category: row.category,
    account_type: row.account_type,
    balance: Number(row.balance),
    display_order: row.display_order,
    count_in_available: row.count_in_available
  }));
}

async function loadFinanceTransactionsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("finance_transactions")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.log("讀取交易紀錄失敗", error);
    financeTransactions = [];
    return;
  }

  financeTransactions = data.map(row => ({
    id: row.id,
    type: row.type,
    account_id: row.account_id,
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    amount: Number(row.amount),
    category: row.category,
    tag: row.tag,
    occurred_on: row.occurred_on,
    budget_item_id: row.budget_item_id
  }));
}

// 快捷紀錄：把常用的固定支出/收入/轉帳存成範本，記帳時一鍵帶入不用重打。
// 這是給「記一筆」表單用的輔助資料，跟 finance_transactions（真正的交易紀錄）是不同的表，
// 刪除或改動快捷本身，完全不影響已經記過的歷史交易。
async function loadFinanceTxPresetsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("finance_tx_presets")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.log("讀取快捷紀錄失敗", error);
    financeTxPresets = [];
    return;
  }

  financeTxPresets = data.map(row => ({
    id: row.id,
    label: row.label,
    type: row.type,
    account_id: row.account_id,
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    amount: Number(row.amount),
    category: row.category,
    tag: row.tag
  }));
}

async function loadFinanceBudgetItemsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("finance_budget_items")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.log("讀取分配項目失敗", error);
    financeBudgetItems = [];
    return;
  }

  financeBudgetItems = data.map(row => ({
    id: row.id,
    account_id: row.account_id,
    tag: row.tag,
    label: row.label,
    planned_amount: Number(row.planned_amount),
    cycle: row.cycle,
    active: row.active,
    accumulated_amount: Number(row.accumulated_amount || 0)
  }));
}

async function addFinanceBudgetItem(item) {
  if (currentUser) {
    const { data, error } = await supabaseClient
      .from("finance_budget_items")
      .insert({
        user_id: currentUser.id,
        account_id: item.accountId,
        tag: item.tag,
        label: item.label,
        planned_amount: item.plannedAmount,
        cycle: item.cycle,
        active: true,
        sort_order: financeBudgetItems.length
      })
      .select()
      .single();

    if (error) {
      console.log("新增分配項目失敗", error);
      alert("新增失敗，請稍後再試一次。");
      return false;
    }

    financeBudgetItems.push({
      id: data.id,
      account_id: data.account_id,
      tag: data.tag,
      label: data.label,
      planned_amount: Number(data.planned_amount),
      cycle: data.cycle,
      active: data.active,
      accumulated_amount: Number(data.accumulated_amount || 0)
    });
  } else {
    financeBudgetItems.push({
      id: `demo-budget-${Date.now()}`,
      account_id: item.accountId,
      tag: item.tag,
      label: item.label,
      planned_amount: item.plannedAmount,
      cycle: item.cycle,
      active: true,
      accumulated_amount: 0
    });
  }
  return true;
}

async function updateFinanceBudgetItem(id, updates) {
  if (currentUser) {
    const { error } = await supabaseClient
      .from("finance_budget_items")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.log("更新分配項目失敗", error);
      alert("更新失敗，請稍後再試一次。");
      return false;
    }
  }

  const item = financeBudgetItems.find(b => b.id === id);
  if (item) Object.assign(item, updates);
  return true;
}

async function deleteFinanceBudgetItem(id) {
  if (currentUser) {
    const { error } = await supabaseClient.from("finance_budget_items").delete().eq("id", id);
    if (error) {
      console.log("刪除分配項目失敗", error);
      alert("刪除失敗，請稍後再試一次。");
      return false;
    }
  }

  financeBudgetItems = financeBudgetItems.filter(b => b.id !== id);
  return true;
}

// 累積儲蓄型的 accumulated_amount 只能透過這裡調整——連結交易的新增/編輯/刪除都呼叫這個函式，
// 統一處理金額怎麼反映到累積進度上，避免各處各自加減、之後兜不起來（見討論記錄的教訓：
// 文件寫「已同步」不代表真的有同步，這裡直接讓所有異動路徑共用同一個函式，從結構上避免這個坑）。
// 每月固定型不會受影響（cycle !== "once" 直接跳過），那種類型的進度本來就是即時算的，不用存快取。
async function adjustBudgetItemAccumulated(budgetItemId, delta) {
  if (!budgetItemId || !delta) return;
  const item = financeBudgetItems.find(b => b.id === budgetItemId);
  if (!item || item.cycle !== "once") return;
  const nextAmount = Math.max((item.accumulated_amount || 0) + delta, 0);
  await updateFinanceBudgetItem(budgetItemId, { accumulated_amount: nextAmount });
}

// 分配總覽彈窗如果剛好開著，交易異動後要跟著刷新，避免顯示舊資料
// （跟記帳明細用同一個「有開才刷新」的判斷方式）。
function refreshFinanceBudgetModalIfOpen() {
  if (financeBudgetModalOverlay && financeBudgetModalOverlay.style.display !== "none") {
    renderFinanceBudgetModal();
  }
}

// 這筆分配項目「已經支付」多少——只對 monthly（每月固定）型有意義，直接加總這個月
// 關聯到這個 budget_item_id 的交易，跨月會自動歸零重新算（原本沒做日期篩選，
// 等於每個月的錢會一直往上疊加，變成付第二次就永久顯示超支，這裡是修正我的疏漏）。
// income 類型視為「還款/沖銷」，從已支付金額扣回去，其餘（expense/transfer）都算已支付。
//
// 累積儲蓄型（once）不會呼叫這個函式——那種類型的錢實際上沒有離開帳戶（只是心裡劃定用途），
// 記一筆交易反而會讓帳戶顯示餘額跟銀行 App 對不起來，所以改成獨立的 accumulated_amount
// 欄位追蹤，透過「存入」動作直接更新，完全不經過記帳流程（見討論記錄的修正）。
function getBudgetItemPaidAmount(item) {
  const linked = financeTransactions.filter(tx => tx.budget_item_id === item.id);
  const scoped = linked.filter(tx => (tx.occurred_on || "").slice(0, 7) === getCurrentYearMonth());
  return scoped.reduce((sum, tx) => sum + (tx.type === "income" ? -tx.amount : tx.amount), 0);
}

function getCurrentYearMonth() {
  return new Date().toISOString().slice(0, 7);
}

// 這個帳戶裡，「已經被劃定用途、不算自由的錢」一共多少，兩種型態算法不一樣：
//
// - monthly（每月固定，例如房租）：算「還沒付」的部分 max(應分配-這個月已付,0)——
//   這種錢就算還沒付，也已經是跑不掉的義務，該先從可運用金額扣掉。
// - once（累積儲蓄，例如紅包）：算「已經存入」的部分 accumulated_amount——
//   雖然錢還留在帳戶裡，但已經被你劃定用途，不是自由的錢；還沒存到的目標金額不算，
//   那只是未來計畫，不是現在的負債（見討論記錄：不能把年度目標當成現在就要扣的義務）。
function getAccountOutstandingCommitment(accountId) {
  return financeBudgetItems
    .filter(b => b.account_id === accountId && b.active)
    .reduce((sum, b) => {
      if (b.cycle === "monthly") {
        return sum + Math.max(b.planned_amount - getBudgetItemPaidAmount(b), 0);
      }
      return sum + (b.accumulated_amount || 0);
    }, 0);
}

// 帳戶可運用金額 = 帳戶實際餘額 － 這個帳戶「已經被劃定用途、不算自由」的錢（見上方定義）。
// 只對資產帳戶有意義，負債帳戶維持顯示欠款金額本身，不套用這套邏輯。
function getAccountAvailable(account) {
  if (account.category !== "asset") return account.balance;
  return account.balance - getAccountOutstandingCommitment(account.id);
}

// 次月預覽／可運用資金：本月結存（所有「計入可運用資金池」的資產帳戶可運用金額加總）－ 下月固定分配，
// 不需要手動輸入任何數字。count_in_available 預設 true，只有使用者自己關掉的帳戶才會被排除
//（決策：不用帳戶類型文字猜測要不要排除，因為 account_type 是自由輸入，猜不準——
// 使用者自己決定「這筆錢這個月算不算可以動用」，例如投資型保單這種只出不進的帳戶）。
function computeAvailableFundsForecast() {
  const currentClosing = financeAccounts
    .filter(a => a.category === "asset" && a.count_in_available !== false)
    .reduce((sum, a) => sum + getAccountAvailable(a), 0);

  const nextMonthFixed = financeBudgetItems
    .filter(b => b.cycle === "monthly" && b.active)
    .reduce((sum, b) => sum + b.planned_amount, 0);

  return {
    currentClosing,
    nextMonthFixed,
    available: currentClosing - nextMonthFixed
  };
}

async function addFinanceTxPreset(preset) {
  if (currentUser) {
    const { data, error } = await supabaseClient
      .from("finance_tx_presets")
      .insert({
        user_id: currentUser.id,
        label: preset.label,
        type: preset.type,
        account_id: preset.accountId,
        from_account_id: preset.fromAccountId,
        to_account_id: preset.toAccountId,
        amount: preset.amount,
        category: preset.category,
        tag: preset.tag,
        sort_order: financeTxPresets.length
      })
      .select()
      .single();

    if (error) {
      console.log("新增快捷失敗", error);
      alert("新增快捷失敗，請稍後再試一次。");
      return false;
    }

    financeTxPresets.push({
      id: data.id,
      label: data.label,
      type: data.type,
      account_id: data.account_id,
      from_account_id: data.from_account_id,
      to_account_id: data.to_account_id,
      amount: Number(data.amount),
      category: data.category,
      tag: data.tag
    });
  } else {
    financeTxPresets.push({
      id: `demo-preset-${Date.now()}`,
      label: preset.label,
      type: preset.type,
      account_id: preset.accountId,
      from_account_id: preset.fromAccountId,
      to_account_id: preset.toAccountId,
      amount: preset.amount,
      category: preset.category,
      tag: preset.tag
    });
  }
  return true;
}

async function updateFinanceTxPreset(id, preset) {
  const updates = {
    label: preset.label,
    type: preset.type,
    account_id: preset.accountId,
    from_account_id: preset.fromAccountId,
    to_account_id: preset.toAccountId,
    amount: preset.amount,
    category: preset.category,
    tag: preset.tag
  };

  if (currentUser) {
    const { error } = await supabaseClient
      .from("finance_tx_presets")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.log("更新快捷失敗", error);
      alert("更新快捷失敗，請稍後再試一次。");
      return false;
    }
  }

  const existing = financeTxPresets.find(p => p.id === id);
  if (existing) {
    existing.label = updates.label;
    existing.type = updates.type;
    existing.account_id = updates.account_id;
    existing.from_account_id = updates.from_account_id;
    existing.to_account_id = updates.to_account_id;
    existing.amount = updates.amount;
    existing.category = updates.category;
    existing.tag = updates.tag;
  }
  return true;
}

async function deleteFinanceTxPreset(id) {
  if (currentUser) {
    const { error } = await supabaseClient
      .from("finance_tx_presets")
      .delete()
      .eq("id", id);

    if (error) {
      console.log("刪除快捷失敗", error);
      alert("刪除快捷失敗，請稍後再試一次。");
      return false;
    }
  }
  financeTxPresets = financeTxPresets.filter(p => p.id !== id);
  return true;
}

// 快捷按鈕列：畫出所有已存的快捷 + 一顆「新增快捷」。
// 點按鈕本身＝直接送出這筆記帳（今天日期），旁邊的✏️才會打開設定彈窗去編輯這個快捷範本。
function renderFinanceTxPresetButtons() {
  if (!financeTxPresetRow) return;
  financeTxPresetRow.innerHTML = "";

  financeTxPresets.forEach(function (preset) {
    const wrap = document.createElement("div");
    wrap.className = "finance-tx-preset-button-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "finance-tx-preset-button";
    button.textContent = preset.label;
    button.addEventListener("click", async function () {
      button.disabled = true;
      await submitFinanceTransaction({
        type: preset.type,
        accountId: preset.account_id,
        fromAccountId: preset.from_account_id,
        toAccountId: preset.to_account_id,
        amount: preset.amount,
        category: preset.category,
        tag: preset.tag,
        occurredOn: new Date().toISOString().split("T")[0]
      });
      button.disabled = false;
    });

    const editIcon = document.createElement("button");
    editIcon.type = "button";
    editIcon.className = "finance-tx-preset-edit-icon";
    editIcon.textContent = "✏️";
    editIcon.title = "編輯這個快捷";
    editIcon.addEventListener("click", function () {
      openFinanceTxPresetModal(preset);
    });

    wrap.appendChild(button);
    wrap.appendChild(editIcon);
    financeTxPresetRow.appendChild(wrap);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "finance-tx-preset-add-button";
  addButton.textContent = "➕ 新增快捷";
  addButton.addEventListener("click", function () {
    openFinanceTxPresetModal(null);
  });
  financeTxPresetRow.appendChild(addButton);
}

// 快捷設定彈窗的類型切換（跟主記帳表單同一套邏輯，只是欄位換成快捷專用的一組）。
let financeTxPresetSelectedType = "expense";
let financeTxPresetEditingId = null;
let financeTxPresetTagPicker = null;

function refreshFinanceTxPresetAccountOptions() {
  [financeTxPresetAccountSelect, financeTxPresetFromSelect, financeTxPresetToSelect].forEach(function (selectEl) {
    if (!selectEl) return;
    const previousValue = selectEl.value;
    selectEl.innerHTML = "";
    financeAccounts.forEach(function (account) {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = account.name;
      selectEl.appendChild(option);
    });
    if (previousValue && financeAccounts.some(function (a) { return a.id === previousValue; })) {
      selectEl.value = previousValue;
    }
  });
}

function setFinanceTxPresetType(type) {
  financeTxPresetSelectedType = type;
  financeTxPresetTypeButtons.forEach(function (btn) {
    btn.classList.toggle("is-active", btn.dataset.txType === type);
  });
  const isTransfer = type === "transfer";
  financeTxPresetSingleAccountField.style.display = isTransfer ? "none" : "";
  financeTxPresetTransferFields.style.display = isTransfer ? "flex" : "none";
}

financeTxPresetTypeButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    setFinanceTxPresetType(button.dataset.txType);
  });
});

// 開啟快捷設定彈窗：preset 為 null 代表「新增」，帶入一個既有物件代表「編輯」。
function openFinanceTxPresetModal(preset) {
  refreshFinanceTxPresetAccountOptions();
  financeTxPresetEditingId = preset ? preset.id : null;

  financeTxPresetLabelInput.value = preset ? preset.label : "";
  financeTxPresetAmountInput.value = preset ? preset.amount : "";
  financeTxPresetCategoryInput.value = preset ? (preset.category || "") : "";

  // 標籤欄位每次開啟都重新建立一個乾淨的挑選元件，避免重複開關累積出多個下拉選單。
  financeTxPresetTagSlot.innerHTML = "";
  financeTxPresetTagPicker = buildFinanceTagPicker(preset ? (preset.tag || "") : "");
  financeTxPresetTagSlot.appendChild(financeTxPresetTagPicker.wrap);

  setFinanceTxPresetType(preset ? preset.type : "expense");
  if (preset) {
    if (preset.type === "transfer") {
      financeTxPresetFromSelect.value = preset.from_account_id || "";
      financeTxPresetToSelect.value = preset.to_account_id || "";
    } else {
      financeTxPresetAccountSelect.value = preset.account_id || "";
    }
  }

  financeTxPresetDeleteButton.style.display = preset ? "" : "none";
  financeTxPresetModalOverlay.style.display = "flex";
}

function closeFinanceTxPresetModal() {
  financeTxPresetModalOverlay.style.display = "none";
  financeTxPresetEditingId = null;
}

financeTxPresetModalClose.addEventListener("click", closeFinanceTxPresetModal);

financeTxPresetSaveButton.addEventListener("click", async function () {
  const label = financeTxPresetLabelInput.value.trim();
  const amountRaw = financeTxPresetAmountInput.value.trim();

  if (!label) {
    alert("請輸入快捷名稱。");
    financeTxPresetLabelInput.focus();
    return;
  }
  if (amountRaw === "" || isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
    alert("請輸入大於 0 的金額。");
    financeTxPresetAmountInput.focus();
    return;
  }

  const type = financeTxPresetSelectedType;
  let accountId = null, fromAccountId = null, toAccountId = null;

  if (type === "transfer") {
    fromAccountId = financeTxPresetFromSelect.value;
    toAccountId = financeTxPresetToSelect.value;
    if (!fromAccountId || !toAccountId) {
      alert("請選擇轉帳的來源與目標帳戶。");
      return;
    }
    if (fromAccountId === toAccountId) {
      alert("來源帳戶跟目標帳戶不能相同。");
      return;
    }
  } else {
    accountId = financeTxPresetAccountSelect.value;
    if (!accountId) {
      alert("請先建立至少一個帳戶，才能設定快捷。");
      return;
    }
  }

  const presetData = {
    label,
    type,
    accountId,
    fromAccountId,
    toAccountId,
    amount: Number(amountRaw),
    category: financeTxPresetCategoryInput.value.trim(),
    tag: financeTxPresetTagPicker.input.value.trim()
  };

  financeTxPresetSaveButton.disabled = true;
  const ok = financeTxPresetEditingId
    ? await updateFinanceTxPreset(financeTxPresetEditingId, presetData)
    : await addFinanceTxPreset(presetData);
  financeTxPresetSaveButton.disabled = false;

  if (!ok) return;
  renderFinanceTxPresetButtons();
  closeFinanceTxPresetModal();
});

financeTxPresetDeleteButton.addEventListener("click", async function () {
  if (!financeTxPresetEditingId) return;
  if (!window.confirm("確定要刪除這個快捷嗎？不會影響已經記過的歷史交易。")) return;

  financeTxPresetDeleteButton.disabled = true;
  const ok = await deleteFinanceTxPreset(financeTxPresetEditingId);
  financeTxPresetDeleteButton.disabled = false;

  if (!ok) return;
  renderFinanceTxPresetButtons();
  closeFinanceTxPresetModal();
});

async function initFinanceForUser() {
  await loadFinanceAccountsFromSupabase();
  await loadFinanceTransactionsFromSupabase();
  await loadFinanceTxPresetsFromSupabase();
  await loadFinanceBudgetItemsFromSupabase();
  setFinanceTxDateToday();
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
  renderFinanceTxPresetButtons();
}

function initFinanceForGuest() {
  financeAccounts = DEMO_FINANCE_ACCOUNTS.map(item => ({ ...item }));
  financeTransactions = DEMO_FINANCE_TRANSACTIONS.map(item => ({ ...item }));
  financeTxPresets = [];
  // 訪客模式先不放示範分配項目：分配總覽是這輪新功能，示範資料的呈現效果還沒驗證過（沿用既有原則），
  // 訪客點開分配總覽會看到空狀態，不影響其他既有示範資料的呈現。
  financeBudgetItems = [];
  setFinanceTxDateToday();
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
  renderFinanceTxPresetButtons();
}

// 資產類型／負債類型建議清單 = 該分類的預設清單 + 使用者自己在「同一個分類」下輸入過、
// 目前仍在用的類型（去重）。依照 DD #001，資產類型跟負債類型是兩套不同語意，
// 不互相混用建議清單，所以要依照目前選的「資產/負債」分開組合。
// 每次帳戶資料變動（新增/刪除/編輯/重新載入），或使用者切換「資產/負債」下拉選單時，都會重建一次。
function refreshAccountTypeSuggestions(category) {
  if (!financeTypeList || !financeTypeInput) return;

  const presets = category === "liability" ? LIABILITY_TYPE_PRESETS : ASSET_TYPE_PRESETS;
  const usedTypes = financeAccounts
    .filter(account => account.category === category)
    .map(account => account.account_type)
    .filter(Boolean);
  const suggestions = [...new Set([...presets, ...usedTypes])];

  financeTypeList.innerHTML = "";
  suggestions.forEach(function (type) {
    const option = document.createElement("option");
    option.value = type;
    financeTypeList.appendChild(option);
  });

  financeTypeInput.placeholder = category === "liability"
    ? "負債類型（可輸入新類型）"
    : "資產類型（可輸入新類型）";
}

financeCategorySelect.addEventListener("change", function () {
  refreshAccountTypeSuggestions(financeCategorySelect.value);
});

// 記帳同時連動帳戶餘額（本輪交接決策）。direction: 1 = 套用（新增交易時），
// -1 = 還原（刪除交易時，把餘額變動加回去）。income/expense 只影響一個帳戶，
// transfer 影響來源/目標兩個帳戶，方向剛好相反。
async function applyTransactionBalanceChange(type, accountId, fromAccountId, toAccountId, amount, direction) {
  const changes = [];

  // rawSign 是「錢離開/進入這個帳戶」的資產式方向，跟決策五十二一致：
  // 支出/轉出 = -1（錢變少的方向），收入/轉入 = +1（錢變多的方向）。
  if (type === "income") {
    changes.push({ id: accountId, rawSign: 1 });
  } else if (type === "expense") {
    changes.push({ id: accountId, rawSign: -1 });
  } else if (type === "transfer") {
    changes.push({ id: fromAccountId, rawSign: -1 });
    changes.push({ id: toAccountId, rawSign: 1 });
  }

  for (const change of changes) {
    const account = financeAccounts.find(a => a.id === change.id);
    if (!account) continue;

    // 負債帳戶的餘額慣例是「正數代表欠款金額」，跟資產帳戶的方向剛好相反：
    // 支出/轉出（例如刷卡消費）要讓欠款增加，收入/轉入（例如還款匯入）要讓欠款減少。
    // 這裡把 rawSign 反轉一次，讓負債帳戶自動套用正確方向。
    const effectiveSign = account.category === "liability" ? -change.rawSign : change.rawSign;
    const delta = effectiveSign * amount * direction;
    const newBalance = account.balance + delta;

    if (currentUser) {
      const { error } = await supabaseClient
        .from("finance_accounts")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", change.id);

      if (error) {
        console.log("更新帳戶餘額失敗", error);
        alert("交易已記錄，但更新帳戶餘額時發生錯誤，請手動確認一下帳戶餘額。");
        continue;
      }
    }
    account.balance = newBalance;
  }
}

// 送出一筆交易的核心邏輯：寫入資料庫（或訪客模式的本機陣列）+ 連動帳戶餘額 + 更新畫面。
// 記帳表單跟快捷按鈕都呼叫這個函式，差別只在於「資料從表單讀」還是「直接帶入快捷存的值」。
async function submitFinanceTransaction({ type, accountId, fromAccountId, toAccountId, amount, category, tag, occurredOn, budgetItemId }) {
  if (currentUser) {
    const { data, error } = await supabaseClient
      .from("finance_transactions")
      .insert({
        user_id: currentUser.id,
        type,
        account_id: accountId,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        category,
        tag,
        occurred_on: occurredOn,
        budget_item_id: budgetItemId || null
      })
      .select()
      .single();

    if (error) {
      console.log("新增交易失敗", error);
      alert("新增失敗，請稍後再試一次。");
      return false;
    }

    financeTransactions.unshift({
      id: data.id,
      type: data.type,
      account_id: data.account_id,
      from_account_id: data.from_account_id,
      to_account_id: data.to_account_id,
      amount: Number(data.amount),
      category: data.category,
      tag: data.tag,
      occurred_on: data.occurred_on,
      budget_item_id: data.budget_item_id
    });
  } else {
    financeTransactions.unshift({
      id: `demo-tx-${Date.now()}`,
      type, account_id: accountId, from_account_id: fromAccountId, to_account_id: toAccountId,
      amount, category, tag, occurred_on: occurredOn, budget_item_id: budgetItemId || null
    });
  }

  // 記住這次選用的帳戶，下次同類型記帳時自動預選（見本輪交接：帳戶預設值）。
  if (type === "transfer") {
    savePreferredAccountDefault("transfer_from", fromAccountId);
    savePreferredAccountDefault("transfer_to", toAccountId);
  } else {
    savePreferredAccountDefault(type, accountId);
  }

  await applyTransactionBalanceChange(type, accountId, fromAccountId, toAccountId, amount, 1);

  // 這筆交易如果連結到累積儲蓄型項目，代表這是一筆「存入」的錢（收入/轉入該帳戶），
  // 要把累積進度加上去，不用你事後再去分配總覽補記一次「存入」
  // （見討論記錄：土地銀行轉玉山銀行後想直接歸類，不想被迫多開一個彈窗重打一次金額）。
  await adjustBudgetItemAccumulated(budgetItemId, amount);

  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
  refreshFinanceTxDetailModal();
  refreshFinanceBudgetModalIfOpen();
  return true;
}

async function addFinanceTransaction() {
  const type = selectedTxType;
  const amountRaw = financeTxAmountInput.value.trim();
  const occurredOn = financeTxDateInput.value || new Date().toISOString().split("T")[0];
  const category = financeTxCategoryInput.value.trim();
  const tag = financeTxTagInput.value.trim();
  // 支出可能連結「每月固定」型分配項目（付房租）；收入／轉帳可能連結「累積儲蓄」型
  // （存入紅包基金）——兩種方向不同，但都可能有連結，這裡統一交給
  // updateFinanceTxBudgetSuggestion() 依當下的類型去判斷該offer哪一種（見討論記錄的修正，
  // 原本轉帳整個被排除在外，但轉帳存入才是使用者實際想要連動的主要情境）。
  const budgetItemId = selectedFinanceTxBudgetItemId || (financeTxBudgetManualSelect.value || null);

  if (amountRaw === "" || isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
    alert("請輸入大於 0 的金額。");
    financeTxAmountInput.focus();
    return;
  }
  const amount = Number(amountRaw);

  let accountId = null;
  let fromAccountId = null;
  let toAccountId = null;

  if (type === "transfer") {
    fromAccountId = financeTxFromSelect.value;
    toAccountId = financeTxToSelect.value;

    if (!fromAccountId || !toAccountId) {
      alert("請選擇轉帳的來源與目標帳戶。");
      return;
    }
    if (fromAccountId === toAccountId) {
      alert("來源帳戶跟目標帳戶不能相同。");
      return;
    }
  } else {
    accountId = financeTxAccountSelect.value;
    if (!accountId) {
      alert("請先建立至少一個帳戶，才能開始記帳。");
      return;
    }
  }

  const ok = await submitFinanceTransaction({ type, accountId, fromAccountId, toAccountId, amount, category, tag, occurredOn, budgetItemId });
  if (!ok) return;

  financeTxAmountInput.value = "";
  financeTxCategoryInput.value = "";
  financeTxTagInput.value = "";
  setFinanceTxDateToday();
  resetFinanceTxBudgetSuggestion();
}

async function saveFinanceTransactionEdits(id, updates) {
  if (currentUser) {
    const { error } = await supabaseClient
      .from("finance_transactions")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.log("更新交易失敗", error);
      alert("更新失敗，請稍後再試一次。");
      return false;
    }
  }

  const tx = financeTransactions.find(item => item.id === id);
  if (tx) Object.assign(tx, updates);
  return true;
}

async function deleteFinanceTransaction(id) {
  if (!confirm("確定要刪除這筆交易紀錄嗎？相關帳戶餘額會自動還原。")) return;

  const tx = financeTransactions.find(t => t.id === id);
  if (!tx) return;

  if (currentUser) {
    const { error } = await supabaseClient.from("finance_transactions").delete().eq("id", id);
    if (error) {
      console.log("刪除交易失敗", error);
      alert("刪除失敗，請稍後再試一次。");
      return;
    }
  }

  await applyTransactionBalanceChange(tx.type, tx.account_id, tx.from_account_id, tx.to_account_id, tx.amount, -1);

  // 刪除的交易如果連結到累積儲蓄型項目，要把當初加上去的金額扣回來，
  // 不然刪掉一筆存入紀錄之後，累積進度會留著「幽靈金額」，跟真實存入的錢對不上。
  if (tx.budget_item_id) {
    await adjustBudgetItemAccumulated(tx.budget_item_id, -tx.amount);
  }

  financeTransactions = financeTransactions.filter(t => t.id !== id);
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
  refreshFinanceTxDetailModal();
  refreshFinanceBudgetModalIfOpen();
}

function getFinanceAccountName(id) {
  const account = financeAccounts.find(a => a.id === id);
  return account ? account.name : "（帳戶已刪除）";
}

// 標籤選擇元件（可重複建立多份，不依賴固定 id）：輸入框 + ▾ 按鈕 + 下拉選單，
// 跟記帳彈窗那個標籤欄位是同一套邏輯，抽出來讓「編輯交易」的表單也能用同樣的挑選方式，
// 不用每次編輯都得手動打字，忘記原本用過的標籤名稱長怎樣。
function buildFinanceTagPicker(initialValue) {
  const wrap = document.createElement("div");
  wrap.className = "finance-tx-tag-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "分類標籤";
  input.value = initialValue || "";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "finance-tx-tag-toggle";
  toggleButton.textContent = "▾";
  toggleButton.title = "選擇曾用過的標籤";
  toggleButton.setAttribute("aria-label", "選擇曾用過的標籤");

  const dropdown = document.createElement("div");
  dropdown.className = "finance-tx-tag-dropdown";
  dropdown.style.display = "none";

  function renderDropdown() {
    const keyword = input.value.trim().toLowerCase();
    const usedTags = getFinanceTxUsedTags().filter(tag => !keyword || tag.toLowerCase().includes(keyword));
    dropdown.innerHTML = "";
    if (usedTags.length === 0) {
      const empty = document.createElement("div");
      empty.className = "finance-tx-tag-empty";
      empty.textContent = "還沒有用過的標籤，直接輸入新標籤即可";
      dropdown.appendChild(empty);
      return;
    }
    usedTags.forEach(function (tag) {
      const option = document.createElement("div");
      option.className = "finance-tx-tag-option";
      option.textContent = tag;
      option.addEventListener("click", function () {
        input.value = tag;
        dropdown.style.display = "none";
      });
      dropdown.appendChild(option);
    });
  }

  toggleButton.addEventListener("click", function () {
    const isOpen = dropdown.style.display !== "none";
    if (isOpen) {
      dropdown.style.display = "none";
    } else {
      renderDropdown();
      dropdown.style.display = "block";
    }
  });
  input.addEventListener("input", function () {
    renderDropdown();
    dropdown.style.display = "block";
  });
  input.addEventListener("focus", function () {
    renderDropdown();
    dropdown.style.display = "block";
  });
  document.addEventListener("click", function (event) {
    if (!wrap.contains(event.target)) dropdown.style.display = "none";
  });

  wrap.appendChild(input);
  wrap.appendChild(toggleButton);
  wrap.appendChild(dropdown);

  return { wrap, input };
}

// ---- Phase 3：記帳表單智慧預填（規則式，不是 AI，見討論記錄的分階段決定） ----
// 規則：同帳戶＋金額落在該分配項目應分配金額的 ±5% 內，猜這筆屬於該分配項目。
// 猜錯或猜不到都不影響原本記帳流程，只是少了一次點擊，多選項時挑金額差距最小的那個。
//
// 依目前選的交易類型，決定要跟哪個帳戶、哪種週期的分配項目做比對：
// - 支出：錢從 financeTxAccountSelect 這個帳戶流出，比對「每月固定」型（付房租）
// - 收入：錢流進 financeTxAccountSelect 這個帳戶，比對「累積儲蓄」型（獎金直接存進紅包基金）
// - 轉帳：錢流進 financeTxToSelect（轉入帳戶），比對「累積儲蓄」型
//   （見討論記錄：土地銀行轉玉山銀行後想直接歸類到玉山銀行的紅包項目，這是主要情境）
function getFinanceTxBudgetContext() {
  if (selectedTxType === "expense") {
    return { accountId: financeTxAccountSelect.value, cycle: "monthly" };
  }
  if (selectedTxType === "income") {
    return { accountId: financeTxAccountSelect.value, cycle: "once" };
  }
  if (selectedTxType === "transfer") {
    return { accountId: financeTxToSelect.value, cycle: "once" };
  }
  return { accountId: null, cycle: null };
}

// 每月固定型：金額落在應分配金額 ±5% 內才猜（房租這種金額固定的類型，金額比對很準）。
// 累積儲蓄型：存入金額每次可能都不一樣（這個月存 1700、下個月可能存 2000），金額比對沒有意義，
// 改成「這個帳戶目前只有一個進行中的累積儲蓄項目」才主動建議，有兩個以上就不猜、交給手動選，
// 避免把要存紅包的錢誤猜成存到儲蓄目標（見討論記錄：不能因為猜得快就犧牲猜得準）。
function suggestBudgetItemForAccount(accountId, amount, cycle) {
  if (!accountId || !cycle) return null;
  const candidates = financeBudgetItems.filter(function (b) {
    return b.account_id === accountId && b.active && b.cycle === cycle;
  });

  if (cycle === "monthly") {
    if (!amount) return null;
    const matched = candidates.filter(function (b) {
      return Math.abs(b.planned_amount - amount) <= b.planned_amount * 0.05;
    });
    if (matched.length === 0) return null;
    matched.sort(function (a, b) {
      return Math.abs(a.planned_amount - amount) - Math.abs(b.planned_amount - amount);
    });
    return matched[0];
  }

  return candidates.length === 1 ? candidates[0] : null;
}

function populateFinanceTxBudgetManualSelect(accountId, cycle) {
  if (!financeTxBudgetManualSelect) return;
  financeTxBudgetManualSelect.innerHTML = "";
  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "不歸類到任何分配項目";
  financeTxBudgetManualSelect.appendChild(noneOption);

  financeBudgetItems
    .filter(function (b) { return b.account_id === accountId && b.active && b.cycle === cycle; })
    .forEach(function (b) {
      const option = document.createElement("option");
      option.value = b.id;
      option.textContent = b.label;
      financeTxBudgetManualSelect.appendChild(option);
    });
}

function resetFinanceTxBudgetSuggestion() {
  selectedFinanceTxBudgetItemId = null;
  financeTxBudgetSuggestedId = null;
  if (financeTxBudgetSuggestion) financeTxBudgetSuggestion.style.display = "none";
  if (financeTxBudgetManualWrap) financeTxBudgetManualWrap.style.display = "none";
}

// 帳戶或金額變動時重新計算：猜到就顯示建議條，猜不到就安靜地什麼都不顯示
// （不強迫使用者每筆都要處理分配項目，這是這個功能能不能撐住「陪伴」精神的關鍵）。
function updateFinanceTxBudgetSuggestion() {
  const context = getFinanceTxBudgetContext();
  if (!context.accountId) {
    resetFinanceTxBudgetSuggestion();
    return;
  }
  const amount = Number(financeTxAmountInput.value);
  populateFinanceTxBudgetManualSelect(context.accountId, context.cycle);

  // 這個帳戶底下有沒有相關週期的分配項目——不管系統猜不猜得出來，只要有候選，
  // 一定要讓你連得到手動選單。原本的漏洞是：猜不出來就整個藏起來，
  // 而手動選單的唯一入口是建議條上的按鈕，等於猜不出來就完全打不開手動選單
  // （這正是玉山銀行有兩個以上累積儲蓄項目時完全沒反應的原因，不是快取或部署問題）。
  const hasCandidates = financeBudgetItems.some(function (b) {
    return b.account_id === context.accountId && b.active && b.cycle === context.cycle;
  });
  if (!hasCandidates) {
    resetFinanceTxBudgetSuggestion();
    return;
  }

  const match = suggestBudgetItemForAccount(context.accountId, amount, context.cycle);
  if (!match) {
    // 猜不出來（候選不只一個，或每月固定型金額對不上）：直接打開手動選單讓你自己選，
    // 不要整個藏起來卡死。
    financeTxBudgetSuggestedId = null;
    financeTxBudgetSuggestion.style.display = "none";
    financeTxBudgetManualWrap.style.display = "block";
    financeTxBudgetManualSelect.value = "";
    return;
  }

  financeTxBudgetSuggestedId = match.id;
  selectedFinanceTxBudgetItemId = null;
  financeTxBudgetSuggestionLabel.textContent = context.cycle === "monthly"
    ? `系統判斷這筆屬於「${match.label}」`
    : `系統判斷這筆要存入「${match.label}」`;
  const account = financeAccounts.find(function (a) { return a.id === context.accountId; });
  financeTxBudgetSuggestionMeta.textContent = `${account ? account.name : ""} · $${amount.toLocaleString()}`;
  financeTxBudgetSuggestion.style.display = "flex";
  financeTxBudgetManualWrap.style.display = "none";
}

[financeTxAccountSelect, financeTxToSelect].forEach(function (el) {
  if (el) el.addEventListener("change", updateFinanceTxBudgetSuggestion);
});
if (financeTxAmountInput) financeTxAmountInput.addEventListener("input", updateFinanceTxBudgetSuggestion);

if (financeTxBudgetSuggestionConfirm) {
  financeTxBudgetSuggestionConfirm.addEventListener("click", function () {
    selectedFinanceTxBudgetItemId = financeTxBudgetSuggestedId;
    financeTxBudgetSuggestion.style.display = "none";
  });
}

if (financeTxBudgetSuggestionChange) {
  financeTxBudgetSuggestionChange.addEventListener("click", function () {
    financeTxBudgetSuggestion.style.display = "none";
    financeTxBudgetManualWrap.style.display = "block";
    financeTxBudgetManualSelect.value = financeTxBudgetSuggestedId || "";
  });
}

if (financeTxBudgetManualSelect) {
  financeTxBudgetManualSelect.addEventListener("change", function () {
    selectedFinanceTxBudgetItemId = financeTxBudgetManualSelect.value || null;
  });
}

// 交易就地編輯：金額打錯、備註/標籤要補充，直接改這一筆，不用刪除重打。
// 刻意不讓「類型」「帳戶」可以編輯——換類型或換帳戶會讓餘額連動的方向整個改變，
// 風險比修正金額/日期/備註/標籤高很多，這次先只開放安全的那幾個欄位。
// 儲存時：先把舊金額對餘額的影響退回去，寫入新的欄位，再套用新金額的影響——
// 這跟刪除交易時的還原邏輯是同一套 applyTransactionBalanceChange，只是中間多了「馬上補回新的」這一步。
function buildFinanceTransactionEditForm(tx, onCancel) {
  const form = document.createElement("div");
  form.className = "finance-item finance-item-editing";

  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.value = tx.amount;

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = tx.occurred_on;

  const categoryInput = document.createElement("input");
  categoryInput.type = "text";
  categoryInput.placeholder = "用途備註（自由輸入）";
  categoryInput.value = tx.category || "";

  const tagPicker = buildFinanceTagPicker(tx.tag || "");
  const tagInput = tagPicker.input;

  const saveButton = document.createElement("button");
  saveButton.textContent = "儲存";
  saveButton.addEventListener("click", async function () {
    const amountRaw = amountInput.value.trim();
    if (amountRaw === "" || isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
      alert("請輸入大於 0 的金額。");
      amountInput.focus();
      return;
    }
    if (!dateInput.value) {
      alert("請選擇日期。");
      dateInput.focus();
      return;
    }

    const newAmount = Number(amountRaw);
    const oldAmount = tx.amount; // 一定要在 saveFinanceTransactionEdits 之前先記下來——
    // 那個函式會直接 Object.assign 改掉這個 tx 物件本身（同一個參照），呼叫完 tx.amount 已經是新值，
    // 太晚抓的話差額會算成 0，累積進度就不會同步（這是我寫的時候一開始沒注意到的地雷）。
    const newOccurredOn = dateInput.value;
    const newCategory = categoryInput.value.trim();
    const newTag = tagInput.value.trim();

    saveButton.disabled = true;

    // 先退回舊金額對帳戶餘額的影響，再套用新金額，帳戶跟類型完全不變，
    // 所以只有「金額」這個數字會影響餘額，其他欄位（日期/備註/標籤）純粹是紀錄本身的修正。
    await applyTransactionBalanceChange(tx.type, tx.account_id, tx.from_account_id, tx.to_account_id, tx.amount, -1);
    await applyTransactionBalanceChange(tx.type, tx.account_id, tx.from_account_id, tx.to_account_id, newAmount, 1);

    const ok = await saveFinanceTransactionEdits(tx.id, {
      amount: newAmount,
      occurred_on: newOccurredOn,
      category: newCategory,
      tag: newTag
    });

    if (!ok) {
      // 更新交易本身失敗的話，把餘額異動退回去，避免帳戶餘額跟交易紀錄兜不起來。
      await applyTransactionBalanceChange(tx.type, tx.account_id, tx.from_account_id, tx.to_account_id, newAmount, -1);
      await applyTransactionBalanceChange(tx.type, tx.account_id, tx.from_account_id, tx.to_account_id, tx.amount, 1);
      saveButton.disabled = false;
      return;
    }

    // 這筆交易如果連結到累積儲蓄型項目，金額改了，累積進度也要跟著調整差額，
    // 不然「金額打錯改一改」會讓累積進度跟真實存入金額脫鉤（見討論記錄：這正是這輪要修的問題）。
    if (tx.budget_item_id) {
      await adjustBudgetItemAccumulated(tx.budget_item_id, newAmount - oldAmount);
    }

    renderFinanceAccounts();
    refreshFinanceTxTagSuggestions();
    refreshFinanceTxDetailModal();
    refreshFinanceBudgetModalIfOpen();
  });

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", onCancel);

  [amountInput, dateInput, categoryInput, tagInput].forEach(function (input) {
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") saveButton.click();
    });
  });

  form.appendChild(amountInput);
  form.appendChild(dateInput);
  form.appendChild(categoryInput);
  form.appendChild(tagPicker.wrap);
  form.appendChild(saveButton);
  form.appendChild(cancelButton);

  return form;
}

function buildFinanceTransactionItem(tx) {
  const item = document.createElement("div");
  item.className = "finance-item";

  const info = document.createElement("div");
  info.className = "finance-item-info";

  const title = document.createElement("div");
  title.className = "finance-item-name";
  const typeLabel = { income: "⬆️", expense: "⬇️", transfer: "🔁" }[tx.type] || "";
  const defaultLabel = { income: "收入", expense: "支出", transfer: "轉帳" }[tx.type] || "";
  title.textContent = `${typeLabel} ${tx.category || defaultLabel}`;

  const meta = document.createElement("div");
  meta.className = "finance-item-meta";
  const accountPart = tx.type === "transfer"
    ? `${getFinanceAccountName(tx.from_account_id)} → ${getFinanceAccountName(tx.to_account_id)}`
    : getFinanceAccountName(tx.account_id);
  meta.textContent = tx.tag
    ? `${accountPart} · ${tx.occurred_on} · #${tx.tag}`
    : `${accountPart} · ${tx.occurred_on}`;

  info.appendChild(title);
  info.appendChild(meta);

  const amount = document.createElement("div");
  amount.className = "finance-item-balance";
  const sign = tx.type === "expense" ? "-" : tx.type === "income" ? "+" : "";
  amount.textContent = `${sign}$${tx.amount.toLocaleString()}`;

  const actions = document.createElement("div");
  actions.className = "finance-item-actions";

  const editButton = document.createElement("button");
  editButton.textContent = "編輯";
  editButton.addEventListener("click", function () {
    const editForm = buildFinanceTransactionEditForm(tx, function () {
      editForm.replaceWith(item);
    });
    item.replaceWith(editForm);
  });

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "刪除";
  deleteButton.addEventListener("click", function () {
    deleteFinanceTransaction(tx.id);
  });

  actions.appendChild(editButton);
  actions.appendChild(deleteButton);

  item.appendChild(info);
  item.appendChild(amount);
  item.appendChild(actions);

  return item;
}

// 主畫面帳戶卡片展開後的內容：只做「看進度、存入」，新增/編輯/刪除/歸零這種不常用的操作
// 留在 🎯 管理分配項目彈窗（見討論記錄的分工決定：這裡負責日常快速查看跟操作，
// 彈窗負責調整規劃結構，兩邊不重複維護同一組按鈕）。
function buildFinanceAccountBudgetPanel(account, items) {
  const panel = document.createElement("div");
  panel.className = "finance-item-budget-panel";

  items.forEach(function (budgetItem) {
    const progress = getBudgetItemProgress(budgetItem);

    const row = document.createElement("div");
    row.className = "finance-budget-item";

    const topRow = document.createElement("div");
    topRow.className = "finance-budget-item-row";

    const label = document.createElement("span");
    label.textContent = budgetItem.label;

    const statusWrap = document.createElement("div");
    statusWrap.style.display = "flex";
    statusWrap.style.alignItems = "center";
    statusWrap.style.gap = "8px";

    const status = document.createElement("span");
    if (progress.isOver) {
      if (budgetItem.cycle === "monthly") {
        status.className = "finance-budget-item-status is-over";
        status.textContent = `超支 $${Math.round(progress.paid - budgetItem.planned_amount).toLocaleString()}`;
      } else {
        status.className = "finance-budget-item-status is-done";
        status.textContent = `已存超過目標 $${Math.round(progress.paid - budgetItem.planned_amount).toLocaleString()}`;
      }
    } else if (progress.isDone) {
      status.className = "finance-budget-item-status is-done";
      status.textContent = "已完成";
    } else {
      status.className = "finance-budget-item-status";
      status.textContent = `$${Math.round(progress.paid).toLocaleString()} / $${Math.round(budgetItem.planned_amount).toLocaleString()}`;
    }
    statusWrap.appendChild(status);

    if (budgetItem.cycle !== "monthly") {
      const depositBtn = document.createElement("button");
      depositBtn.type = "button";
      depositBtn.textContent = "存入";
      depositBtn.addEventListener("click", async function () {
        const raw = window.prompt(`要存入多少到「${budgetItem.label}」？（要更正可以輸入負數）`, "");
        if (raw === null) return;
        const delta = Number(raw);
        if (isNaN(delta) || delta === 0) {
          alert("請輸入不是 0 的數字。");
          return;
        }
        const nextAmount = Math.max((budgetItem.accumulated_amount || 0) + delta, 0);
        if (!window.confirm(`目前累積 $${Math.round(budgetItem.accumulated_amount || 0).toLocaleString()}，加上這筆後會變成 $${Math.round(nextAmount).toLocaleString()}，確定嗎？`)) return;
        const ok = await updateFinanceBudgetItem(budgetItem.id, { accumulated_amount: nextAmount });
        if (!ok) return;
        expandedFinanceAccountIds.add(account.id); // 存完之後重畫整個畫面，這裡確保這張卡片還是展開的
        renderFinanceAccounts();
      });
      statusWrap.appendChild(depositBtn);
    }

    topRow.appendChild(label);
    topRow.appendChild(statusWrap);

    const progressBar = document.createElement("div");
    progressBar.className = "finance-budget-progress";
    const progressFill = document.createElement("div");
    progressFill.className = "finance-budget-progress-fill" + (progress.isOver && budgetItem.cycle === "monthly" ? " is-over" : "");
    progressFill.style.width = `${Math.round(progress.ratio * 100)}%`;
    progressBar.appendChild(progressFill);

    row.appendChild(topRow);
    row.appendChild(progressBar);
    panel.appendChild(row);
  });

  return panel;
}

// ---- 記帳明細（獨立彈窗，含月份/標籤篩選） ----
// 決策（本輪交接）：快速記帳彈窗只留表單，明細是另一個獨立彈窗，
// 因為記帳要求「快」，明細是復盤才會查看，兩者混在一起會顯得雜亂。
// 篩選改用「分類標籤」而不是「用途備註」——備註是自由描述細節，天生不重複，
// 拿來篩選沒有意義；標籤才是負責分組的欄位（見本輪交接：DD-001 Purpose vs Tags）。
function getFinanceTxMonthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : "";
}

function formatFinanceTxMonthLabel(monthKey) {
  const parts = monthKey.split("-");
  return `${parts[0]}年${Number(parts[1])}月`;
}

const financeTxFilterMonth = document.getElementById("finance-tx-filter-month");
const financeTxFilterAccount = document.getElementById("finance-tx-filter-account");
const financeTxFilterTagButton = document.getElementById("finance-tx-filter-tag-button");
const financeTxFilterTagDropdown = document.getElementById("finance-tx-filter-tag-dropdown");
const financeTxDetailList = document.getElementById("finance-tx-detail-list");
const financeTxDetailEmpty = document.getElementById("finance-tx-detail-empty");

// 標籤篩選目前選到的值，"all" 代表全部標籤，跟原本 <select>.value 是同一個概念，
// 只是換成自己維護一個變數（因為改成自製下拉選單，不再有原生 <select> 可以讀 value）。
let financeTxCurrentTagFilter = "all";

// 一筆交易「牽涉到」哪些帳戶——支出/收入只有一個帳戶，轉帳有來源跟目的地兩個都算。
// 這是為了讓「查某個帳戶的所有紀錄」這件事，不用先猜分類標籤才能反推帳戶。
function getFinanceTxRelatedAccountIds(tx) {
  const ids = [];
  if (tx.account_id) ids.push(tx.account_id);
  if (tx.from_account_id) ids.push(tx.from_account_id);
  if (tx.to_account_id) ids.push(tx.to_account_id);
  return ids;
}

function refreshFinanceTxFilterOptions() {
  const months = [...new Set(financeTransactions.map(tx => getFinanceTxMonthKey(tx.occurred_on)).filter(Boolean))]
    .sort(function (a, b) { return b.localeCompare(a); });
  const tags = [...new Set(financeTransactions.map(tx => tx.tag).filter(Boolean))];

  // 每次打開記帳明細，月份直接預選「這個月」，不用先點掉「全部月份」才看得到當月資料——
  // 想看其他月份或全部，使用者自己再切換即可（這是使用者明確要的行為：每次打開都重置回當月，
  // 不是「記住上次選過哪個月」）。
  financeTxFilterMonth.innerHTML = "";
  const allMonthOption = document.createElement("option");
  allMonthOption.value = "all";
  allMonthOption.textContent = "全部月份";
  financeTxFilterMonth.appendChild(allMonthOption);
  months.forEach(function (monthKey) {
    const option = document.createElement("option");
    option.value = monthKey;
    option.textContent = formatFinanceTxMonthLabel(monthKey);
    financeTxFilterMonth.appendChild(option);
  });
  const todayMonthKey = getFinanceTxMonthKey(new Date().toISOString().split("T")[0]);
  financeTxFilterMonth.value = months.includes(todayMonthKey) ? todayMonthKey : "all";

  // 帳戶篩選清單直接用目前的 financeAccounts（資產+負債都算），
  // 不是只列有出現過交易的帳戶，這樣就算某帳戶這個月剛好沒記帳也還是選得到。
  const previousAccount = financeTxFilterAccount.value;
  financeTxFilterAccount.innerHTML = "";
  const allAccountOption = document.createElement("option");
  allAccountOption.value = "all";
  allAccountOption.textContent = "全部帳戶";
  financeTxFilterAccount.appendChild(allAccountOption);
  financeAccounts.forEach(function (account) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    financeTxFilterAccount.appendChild(option);
  });
  const accountIds = financeAccounts.map(a => a.id);
  financeTxFilterAccount.value = (previousAccount && accountIds.includes(previousAccount)) ? previousAccount : "all";

  // 如果目前選的標籤已經不存在了（例如那筆交易被刪掉），自動退回「全部標籤」。
  if (financeTxCurrentTagFilter !== "all" && !tags.includes(financeTxCurrentTagFilter)) {
    financeTxCurrentTagFilter = "all";
  }
  financeTxFilterTagButton.textContent = financeTxCurrentTagFilter === "all" ? "全部標籤" : financeTxCurrentTagFilter;
  renderFinanceTxFilterTagDropdown(tags);
}

// 畫出「標籤篩選」自製下拉選單的內容，跟記帳彈窗的標籤選單共用同一套樣式，
// 差別是這裡每個選項是「篩選條件」，選中的那個要標示出來（is-active）。
function renderFinanceTxFilterTagDropdown(tags) {
  financeTxFilterTagDropdown.innerHTML = "";

  const allOption = document.createElement("div");
  allOption.className = "finance-tx-tag-option" + (financeTxCurrentTagFilter === "all" ? " is-active" : "");
  allOption.textContent = "全部標籤";
  allOption.addEventListener("click", function () {
    financeTxCurrentTagFilter = "all";
    financeTxFilterTagButton.textContent = "全部標籤";
    financeTxFilterTagDropdown.style.display = "none";
    renderFinanceTransactionDetailList();
  });
  financeTxFilterTagDropdown.appendChild(allOption);

  tags.forEach(function (tag) {
    const option = document.createElement("div");
    option.className = "finance-tx-tag-option" + (financeTxCurrentTagFilter === tag ? " is-active" : "");
    option.textContent = tag;
    option.addEventListener("click", function () {
      financeTxCurrentTagFilter = tag;
      financeTxFilterTagButton.textContent = tag;
      financeTxFilterTagDropdown.style.display = "none";
      renderFinanceTransactionDetailList();
    });
    financeTxFilterTagDropdown.appendChild(option);
  });
}

financeTxFilterTagButton.addEventListener("click", function () {
  const isOpen = financeTxFilterTagDropdown.style.display !== "none";
  financeTxFilterTagDropdown.style.display = isOpen ? "none" : "block";
});

document.addEventListener("click", function (event) {
  const wrap = document.getElementById("finance-tx-filter-tag-wrap");
  if (wrap && !wrap.contains(event.target)) {
    financeTxFilterTagDropdown.style.display = "none";
  }
});

function renderFinanceTransactionDetailList() {
  const monthFilter = financeTxFilterMonth.value || "all";
  const accountFilter = financeTxFilterAccount.value || "all";
  const tagFilter = financeTxCurrentTagFilter || "all";

  const filtered = financeTransactions.filter(function (tx) {
    const monthMatch = monthFilter === "all" || getFinanceTxMonthKey(tx.occurred_on) === monthFilter;
    const accountMatch = accountFilter === "all" || getFinanceTxRelatedAccountIds(tx).includes(accountFilter);
    const tagMatch = tagFilter === "all" || tx.tag === tagFilter;
    return monthMatch && accountMatch && tagMatch;
  });

  // 目前篩選結果的小計，只是把畫面上已經看得到的這幾筆加起來，
  // 不是 Phase 3 那種「跟預算比較」的功能，單純省掉手動計算的麻煩。
  // 轉帳不算花費也不算收入（只是自己帳戶之間搬錢），所以分開列，不跟支出/收入加在一起。
  let expenseTotal = 0;
  let incomeTotal = 0;
  let transferTotal = 0;
  filtered.forEach(function (tx) {
    if (tx.type === "expense") expenseTotal += tx.amount;
    else if (tx.type === "income") incomeTotal += tx.amount;
    else if (tx.type === "transfer") transferTotal += tx.amount;
  });

  const summaryEl = document.getElementById("finance-tx-detail-summary");
  if (summaryEl) {
    if (filtered.length === 0) {
      summaryEl.innerHTML = "";
    } else {
      const lineParts = [];
      if (expenseTotal > 0) lineParts.push("支出合計：$" + expenseTotal.toLocaleString());
      if (incomeTotal > 0) lineParts.push("收入合計：$" + incomeTotal.toLocaleString());
      const firstLine = lineParts.join("　");
      const secondLine = transferTotal > 0 ? "轉帳合計：$" + transferTotal.toLocaleString() : "";

      summaryEl.innerHTML = "";
      if (firstLine) {
        const row1 = document.createElement("div");
        row1.textContent = firstLine;
        summaryEl.appendChild(row1);
      }
      if (secondLine) {
        const row2 = document.createElement("div");
        row2.textContent = secondLine;
        summaryEl.appendChild(row2);
      }
    }
  }

  financeTxDetailList.innerHTML = "";
  let lastMonthKey = null;
  filtered.forEach(function (tx) {
    const monthKey = getFinanceTxMonthKey(tx.occurred_on);
    if (monthFilter === "all" && monthKey !== lastMonthKey) {
      const header = document.createElement("div");
      header.className = "finance-tx-month-group-header";
      header.textContent = formatFinanceTxMonthLabel(monthKey);
      financeTxDetailList.appendChild(header);
      lastMonthKey = monthKey;
    }
    financeTxDetailList.appendChild(buildFinanceTransactionItem(tx));
  });

  financeTxDetailEmpty.style.display = filtered.length > 0 ? "none" : "block";
}

function refreshFinanceTxDetailModal() {
  refreshFinanceTxFilterOptions();
  renderFinanceTransactionDetailList();
}

financeTxFilterMonth.addEventListener("change", renderFinanceTransactionDetailList);
financeTxFilterAccount.addEventListener("change", renderFinanceTransactionDetailList);


financeTxAddButton.addEventListener("click", addFinanceTransaction);

// 懸浮按鈕：只開快速記帳表單（不含明細），符合「記帳要快」的訴求。
const financeTxFab = document.getElementById("finance-tx-fab");
const financeTxModalOverlay = document.getElementById("finance-tx-modal-overlay");
const financeTxModalClose = document.getElementById("finance-tx-modal-close");

financeTxFab.addEventListener("click", function () {
  financeTxModalOverlay.style.display = "flex";
  applyPreferredDefaultsForCurrentType();
  updateFinanceTxBudgetSuggestion();
});

function closeFinanceTxModal() {
  financeTxModalOverlay.style.display = "none";
  resetFinanceTxBudgetSuggestion();
}

financeTxModalClose.addEventListener("click", closeFinanceTxModal);

financeTxModalOverlay.addEventListener("click", function (event) {
  if (event.target === financeTxModalOverlay) {
    closeFinanceTxModal();
  }
});

// 「查看記帳明細」：獨立彈窗，開啟時才重建篩選清單跟列表（復盤情境，不用即時同步）。
const financeTxDetailOpenButton = document.getElementById("finance-tx-detail-open-button");
const financeTxDetailModalOverlay = document.getElementById("finance-tx-detail-modal-overlay");
const financeTxDetailModalClose = document.getElementById("finance-tx-detail-modal-close");

financeTxDetailOpenButton.addEventListener("click", function () {
  refreshFinanceTxDetailModal();
  financeTxDetailModalOverlay.style.display = "flex";
});

function closeFinanceTxDetailModal() {
  financeTxDetailModalOverlay.style.display = "none";
}

financeTxDetailModalClose.addEventListener("click", closeFinanceTxDetailModal);

financeTxDetailModalOverlay.addEventListener("click", function (event) {
  if (event.target === financeTxDetailModalOverlay) {
    closeFinanceTxDetailModal();
  }
});

// 「分配總覽」：獨立彈窗，全部帳戶攤平顯示（方案B，見討論記錄——
// 分配總覽主要在電腦作業情境使用，不用像手機那樣為了精簡而摺疊）。
financeBudgetOpenButton.addEventListener("click", function () {
  renderFinanceBudgetModal();
  financeBudgetModalOverlay.style.display = "flex";
});

function closeFinanceBudgetModal() {
  financeBudgetModalOverlay.style.display = "none";
  financeBudgetAddSection.style.display = "none";
  financeBudgetEditingId = null;
}

financeBudgetModalClose.addEventListener("click", closeFinanceBudgetModal);

financeBudgetModalOverlay.addEventListener("click", function (event) {
  if (event.target === financeBudgetModalOverlay) {
    closeFinanceBudgetModal();
  }
});

// 可運用資金摘要：平常收合，點一下展開，再點一下收回去。數字本身在 renderFinanceAccounts()
// 裡就會同步更新，這裡只負責顯示/隱藏的開關（見討論記錄：拆掉分配總覽彈窗之後，
// 這組數字要找地方安置，決定做成不佔畫面空間的收合標籤）。
if (financeForecastToggle) {
  financeForecastToggle.addEventListener("click", function () {
    const isHidden = financeForecastPanel.style.display === "none";
    financeForecastPanel.style.display = isHidden ? "block" : "none";
    financeForecastToggle.classList.toggle("is-open", isHidden);
  });
}

function refreshFinanceForecastPanel() {
  if (!financeForecastCurrent) return;
  const forecast = computeAvailableFundsForecast();
  financeForecastCurrent.textContent = `$${Math.round(forecast.currentClosing).toLocaleString()}`;
  financeForecastMonthly.textContent = `-$${Math.round(forecast.nextMonthFixed).toLocaleString()}`;
  financeForecastAvailable.textContent = `$${Math.round(forecast.available).toLocaleString()}`;
}

financeBudgetAddToggle.addEventListener("click", function () {
  financeBudgetEditingId = null;
  const isHidden = financeBudgetAddSection.style.display === "none";
  if (isHidden) resetFinanceBudgetAddForm();
  financeBudgetAddSection.style.display = isHidden ? "" : "none";
});

function resetFinanceBudgetAddForm() {
  financeBudgetLabelInput.value = "";
  financeBudgetAmountInput.value = "";
  financeBudgetCycleSelect.value = "monthly";
  financeBudgetTagSlot.innerHTML = "";
  financeBudgetTagPicker = buildFinanceTagPicker("");
  financeBudgetTagSlot.appendChild(financeBudgetTagPicker.wrap);

  financeBudgetAccountSelect.innerHTML = "";
  financeAccounts.filter(function (a) { return a.category === "asset"; }).forEach(function (a) {
    const option = document.createElement("option");
    option.value = a.id;
    option.textContent = a.name;
    financeBudgetAccountSelect.appendChild(option);
  });

  financeBudgetSaveButton.textContent = "新增";
}

financeBudgetSaveButton.addEventListener("click", async function () {
  const accountId = financeBudgetAccountSelect.value;
  const label = financeBudgetLabelInput.value.trim();
  const amountRaw = financeBudgetAmountInput.value.trim();
  const cycle = financeBudgetCycleSelect.value;
  const tag = financeBudgetTagPicker ? financeBudgetTagPicker.input.value.trim() : "";

  if (!accountId) {
    alert("請先建立至少一個資產帳戶。");
    return;
  }
  if (!label) {
    alert("請輸入用途名稱。");
    financeBudgetLabelInput.focus();
    return;
  }
  if (amountRaw === "" || isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
    alert("請輸入大於 0 的應分配金額。");
    financeBudgetAmountInput.focus();
    return;
  }
  const plannedAmount = Number(amountRaw);

  financeBudgetSaveButton.disabled = true;
  let ok;
  if (financeBudgetEditingId) {
    ok = await updateFinanceBudgetItem(financeBudgetEditingId, {
      account_id: accountId, label, planned_amount: plannedAmount, cycle, tag
    });
  } else {
    ok = await addFinanceBudgetItem({ accountId, label, plannedAmount, cycle, tag });
  }
  financeBudgetSaveButton.disabled = false;

  if (!ok) return;
  financeBudgetEditingId = null;
  financeBudgetAddSection.style.display = "none";
  renderFinanceBudgetModal();
  renderFinanceAccounts();
});

// 每個分配項目的「已完成／進行中／超支」狀態文字與進度條寬度，統一算在這裡，
// 渲染跟之後其他地方要用同一套判斷邏輯時都呼叫這個，避免各處各自算一次容易兜不齊。
function getBudgetItemProgress(item) {
  const paid = item.cycle === "monthly" ? getBudgetItemPaidAmount(item) : (item.accumulated_amount || 0);
  const ratio = item.planned_amount > 0 ? paid / item.planned_amount : 0;
  const isOver = paid > item.planned_amount;
  const isDone = !isOver && ratio >= 1;
  return { paid, ratio: Math.min(ratio, 1), isOver, isDone };
}

// 分配總覽全部攤平：每個有分配項目的資產帳戶一個區塊，區塊內項目由上而下列出，
// 不用下拉切換帳戶（決策：方案B，見討論記錄——分配總覽主要在電腦上用，一次看到全部比較重要）。
// 分配總覽彈窗現在只負責「調整規劃結構」（新增/編輯/刪除/歸零），全部帳戶攤平顯示
// （方案B，見討論記錄——分配總覽主要在電腦作業情境使用）。日常查看進度、快速存入
// 已經搬到資產總覽主畫面的帳戶卡片展開區（見 buildFinanceAccountBudgetPanel），
// 這裡不重複顯示進度條，避免兩個地方要維護同一組畫面、之後改一邊忘了改另一邊。
function renderFinanceBudgetModal() {
  financeBudgetList.innerHTML = "";

  const accountIds = [...new Set(financeBudgetItems.map(function (b) { return b.account_id; }))];
  if (accountIds.length === 0) {
    financeBudgetEmpty.style.display = "";
    return;
  }
  financeBudgetEmpty.style.display = "none";

  accountIds.forEach(function (accountId) {
    const account = financeAccounts.find(function (a) { return a.id === accountId; });
    if (!account) return;

    const group = document.createElement("div");
    group.className = "finance-budget-account-group";

    const header = document.createElement("div");
    header.className = "finance-budget-account-header";
    const headerName = document.createElement("span");
    headerName.className = "finance-budget-account-header-name";
    headerName.textContent = account.name;
    header.appendChild(headerName);
    group.appendChild(header);

    financeBudgetItems
      .filter(function (b) { return b.account_id === accountId; })
      .forEach(function (item) {
        const row = document.createElement("div");
        row.className = "finance-budget-item";

        const topRow = document.createElement("div");
        topRow.className = "finance-budget-item-row";

        const label = document.createElement("span");
        label.textContent = item.label;

        const meta = document.createElement("span");
        meta.className = "finance-budget-item-status";
        meta.textContent = `目標 $${Math.round(item.planned_amount).toLocaleString()} · ${item.cycle === "monthly" ? "每月固定" : "累積儲蓄"}`;

        const actions = document.createElement("div");
        actions.className = "finance-budget-item-actions";

        if (item.cycle !== "monthly") {
          const resetBtn = document.createElement("button");
          resetBtn.type = "button";
          resetBtn.textContent = "歸零";
          resetBtn.addEventListener("click", async function () {
            if (!window.confirm(`確定要把「${item.label}」的累積進度歸零嗎？（目前是 $${Math.round(item.accumulated_amount || 0).toLocaleString()}）`)) return;
            const ok = await updateFinanceBudgetItem(item.id, { accumulated_amount: 0 });
            if (!ok) return;
            renderFinanceBudgetModal();
            renderFinanceAccounts();
          });
          actions.appendChild(resetBtn);
        }

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "編輯";
        editBtn.addEventListener("click", function () {
          financeBudgetEditingId = item.id;
          resetFinanceBudgetAddForm();
          financeBudgetAccountSelect.value = item.account_id;
          financeBudgetLabelInput.value = item.label;
          financeBudgetAmountInput.value = item.planned_amount;
          financeBudgetCycleSelect.value = item.cycle;
          financeBudgetTagPicker.input.value = item.tag || "";
          financeBudgetSaveButton.textContent = "儲存修改";
          financeBudgetAddSection.style.display = "";
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "刪除";
        deleteBtn.addEventListener("click", async function () {
          if (!window.confirm(`確定要刪除「${item.label}」這個分配項目嗎？已經記過的交易不會被刪除，只是會失去對應的分配項目。`)) return;
          const ok = await deleteFinanceBudgetItem(item.id);
          if (!ok) return;
          renderFinanceBudgetModal();
          renderFinanceAccounts();
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        topRow.appendChild(label);
        topRow.appendChild(meta);

        row.appendChild(topRow);
        row.appendChild(actions);
        group.appendChild(row);
      });

    financeBudgetList.appendChild(group);
  });
}

// 新增帳戶表單預設收合（建好之後很少會再用到），點按鈕才展開/收回。
const financeAddAccountToggle = document.getElementById("finance-add-account-toggle");
const financeAddAccountSection = document.getElementById("finance-add-account-section");

financeAddAccountToggle.addEventListener("click", function () {
  const isHidden = financeAddAccountSection.style.display === "none";
  financeAddAccountSection.style.display = isHidden ? "" : "none";
});

// 管理帳戶開關：平常隱藏拖曳把手／編輯／刪除，減少版面占用，
// 只有確認要調整順序或修改帳戶時才切進管理模式。
const financeAccountsManageToggle = document.getElementById("finance-accounts-manage-toggle");
financeAccountsManageToggle.addEventListener("click", function () {
  financeAccountsManageMode = !financeAccountsManageMode;
  financeAccountsManageToggle.textContent = financeAccountsManageMode ? "✅" : "🔧";
  financeAccountsManageToggle.title = financeAccountsManageMode ? "完成管理" : "管理帳戶";
  financeAccountsManageToggle.setAttribute("aria-label", financeAccountsManageMode ? "完成管理" : "管理帳戶");
  renderFinanceAccounts();
});

async function addFinanceAccount() {
  const name = financeNameInput.value.trim();
  const purpose = financePurposeInput.value.trim();
  const category = financeCategorySelect.value;
  const accountType = financeTypeInput.value.trim();
  const balanceRaw = financeBalanceInput.value.trim();
  // 是否算進「本月可運用資金池」（次月預覽的加總基礎）。預設打勾＝計入，
  // 使用者自己決定要不要關掉（例如投資型保單這種只出不進的帳戶），不用系統猜測帳戶類型
  // （見討論記錄：account_type 是自由輸入文字，用文字猜測「該不該排除」猜不準）。
  const countInAvailable = financeCountInAvailableInput.checked;

  if (!name) {
    alert("請輸入帳戶名稱。");
    financeNameInput.focus();
    return;
  }

  if (!accountType) {
    alert("請輸入或選擇資產類型。");
    financeTypeInput.focus();
    return;
  }

  if (balanceRaw !== "" && isNaN(Number(balanceRaw))) {
    alert("金額請輸入數字。");
    financeBalanceInput.focus();
    return;
  }

  const balance = balanceRaw === "" ? 0 : Number(balanceRaw);

  if (currentUser) {
    const { data, error } = await supabaseClient
      .from("finance_accounts")
      .insert({
        user_id: currentUser.id,
        name,
        purpose,
        category,
        account_type: accountType,
        balance,
        display_order: financeAccounts.length,
        count_in_available: countInAvailable
      })
      .select()
      .single();

    if (error) {
      console.log("新增財務帳戶失敗", error);
      alert("新增失敗，請稍後再試一次。");
      return;
    }

    financeAccounts.push({
      id: data.id,
      name: data.name,
      purpose: data.purpose,
      category: data.category,
      account_type: data.account_type,
      balance: Number(data.balance),
      display_order: data.display_order,
      count_in_available: data.count_in_available
    });
  } else {
    financeAccounts.push({
      id: `demo-finance-${Date.now()}`,
      name,
      purpose,
      category,
      account_type: accountType,
      balance,
      display_order: financeAccounts.length,
      count_in_available: countInAvailable
    });
  }

  financeNameInput.value = "";
  financePurposeInput.value = "";
  financeTypeInput.value = "";
  financeBalanceInput.value = "";
  financeCountInAvailableInput.checked = true;
  financeAddAccountSection.style.display = "none";
  renderFinanceAccounts();
}

async function deleteFinanceAccount(id) {
  if (!confirm("確定要刪除這個帳戶嗎？")) return;

  if (currentUser) {
    const { error } = await supabaseClient.from("finance_accounts").delete().eq("id", id);
    if (error) {
      console.log("刪除財務帳戶失敗", error);
      return;
    }
  }

  financeAccounts = financeAccounts.filter(account => account.id !== id);
  renderFinanceAccounts();
}

const CATEGORY_OPTIONS = [
  { value: "asset", label: "資產" },
  { value: "liability", label: "負債" }
];

async function saveFinanceAccountEdits(id, updates) {
  if (currentUser) {
    const { error } = await supabaseClient
      .from("finance_accounts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.log("更新財務帳戶失敗", error);
      alert("更新失敗，請稍後再試一次。");
      return false;
    }
  }

  const account = financeAccounts.find(item => item.id === id);
  if (account) Object.assign(account, updates);
  return true;
}

// 就地編輯：點「編輯」把整列換成輸入框（名稱／用途／分類／類型／金額都能改），
// 「儲存」或 Enter 存檔，「取消」還原，不用刪除重加。
function buildFinanceAccountEditForm(account, onCancel) {
  const form = document.createElement("div");
  form.className = "finance-item finance-item-editing";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = account.name;

  const purposeInput = document.createElement("input");
  purposeInput.type = "text";
  purposeInput.value = account.purpose || "";

  const categorySelect = document.createElement("select");
  CATEGORY_OPTIONS.forEach(function (opt) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === account.category) option.selected = true;
    categorySelect.appendChild(option);
  });

  const typeInput = document.createElement("input");
  typeInput.type = "text";
  typeInput.setAttribute("list", "finance-type-list");
  typeInput.value = account.account_type || "";

  // 編輯表單開啟時，先依這個帳戶目前的分類（資產/負債）重建共用建議清單，
  // 之後在表單內切換分類，也同步重建，維持跟新增表單一致的行為。
  refreshAccountTypeSuggestions(account.category);
  categorySelect.addEventListener("change", function () {
    refreshAccountTypeSuggestions(categorySelect.value);
  });

  const balanceInput = document.createElement("input");
  balanceInput.type = "number";
  balanceInput.value = account.balance;

  const countInAvailableLabel = document.createElement("label");
  countInAvailableLabel.className = "finance-count-in-available-label";
  const countInAvailableInput = document.createElement("input");
  countInAvailableInput.type = "checkbox";
  countInAvailableInput.checked = account.count_in_available !== false;
  countInAvailableLabel.appendChild(countInAvailableInput);
  countInAvailableLabel.appendChild(document.createTextNode("計入本月可運用資金"));

  const saveButton = document.createElement("button");
  saveButton.textContent = "儲存";
  saveButton.addEventListener("click", function () {
    const trimmedName = nameInput.value.trim();
    const balanceRaw = balanceInput.value.trim();

    const trimmedType = typeInput.value.trim();

    if (!trimmedName) {
      alert("帳戶名稱不能留空。");
      nameInput.focus();
      return;
    }

    if (!trimmedType) {
      alert("請輸入或選擇資產類型。");
      typeInput.focus();
      return;
    }

    if (balanceRaw !== "" && isNaN(Number(balanceRaw))) {
      alert("金額請輸入數字。");
      balanceInput.focus();
      return;
    }

    const updates = {
      name: trimmedName,
      purpose: purposeInput.value.trim(),
      category: categorySelect.value,
      account_type: trimmedType,
      balance: balanceRaw === "" ? 0 : Number(balanceRaw),
      count_in_available: countInAvailableInput.checked
    };
    saveFinanceAccountEdits(account.id, updates).then(function (ok) {
      if (ok) renderFinanceAccounts();
    });
  });

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", function () {
    refreshAccountTypeSuggestions(financeCategorySelect.value);
    onCancel();
  });

  [nameInput, purposeInput].forEach(function (input) {
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") saveButton.click();
    });
  });

  form.appendChild(nameInput);
  form.appendChild(purposeInput);
  form.appendChild(categorySelect);
  form.appendChild(typeInput);
  form.appendChild(balanceInput);
  form.appendChild(countInAvailableLabel);
  form.appendChild(saveButton);
  form.appendChild(cancelButton);

  return form;
}

// 帳戶管理模式：平常畫面只顯示名稱/用途/金額，確認無誤後很少用到的
// 拖曳排序／編輯／刪除，收在「管理帳戶」開關後面才出現，避免一直占版面。
let financeAccountsManageMode = false;

function buildFinanceAccountItem(account, manageMode) {
  const item = document.createElement("div");
  item.className = "finance-item";
  item.dataset.accountId = account.id;

  const info = document.createElement("div");
  info.className = "finance-item-info";

  const nameRow = document.createElement("div");
  nameRow.className = "finance-item-name-row";

  const name = document.createElement("span");
  name.className = "finance-item-name";
  name.textContent = account.name;

  // 主數字顯示可運用金額（餘額－這個帳戶還沒付完的分配項目），沒有進行中分配項目時
  // 可運用＝餘額，畫面跟改版前完全一樣；只有兩者不同時才會多顯示一顆餘額徽章（見討論記錄）。
  const available = getAccountAvailable(account);
  const balance = document.createElement("span");
  balance.className = "finance-item-balance";
  balance.textContent = `$${Math.round(available).toLocaleString()}`;

  nameRow.appendChild(name);
  nameRow.appendChild(balance);

  const meta = document.createElement("div");
  meta.className = "finance-item-meta";
  const metaText = [account.purpose, account.account_type].filter(Boolean).join(" · ");
  meta.textContent = metaText;

  if (available !== account.balance) {
    const balanceBadge = document.createElement("span");
    balanceBadge.className = "finance-item-balance-badge";
    balanceBadge.textContent = `餘額 $${Math.round(account.balance).toLocaleString()}`;
    meta.appendChild(balanceBadge);
  }

  if (account.category === "asset" && account.count_in_available === false) {
    const excludedBadge = document.createElement("span");
    excludedBadge.className = "finance-item-excluded-badge";
    excludedBadge.textContent = "不計入本月結存";
    meta.appendChild(excludedBadge);
  }

  info.appendChild(nameRow);
  info.appendChild(meta);

  item.appendChild(info);

  // 只有資產帳戶、且底下有進行中分配項目時，才需要展開/收合這個機制——
  // 沒有分配項目的帳戶完全不受影響，畫面跟改版前一樣（見討論記錄的一貫原則）。
  const accountBudgetItems = financeBudgetItems.filter(function (b) {
    return b.account_id === account.id && b.active;
  });

  if (account.category === "asset" && accountBudgetItems.length > 0) {
    const isExpanded = expandedFinanceAccountIds.has(account.id);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "finance-item-expand-toggle" + (isExpanded ? " is-open" : "");
    toggleButton.textContent = "▾";
    toggleButton.setAttribute("aria-label", "展開分配項目");
    nameRow.appendChild(toggleButton);

    const panel = buildFinanceAccountBudgetPanel(account, accountBudgetItems);
    panel.style.display = isExpanded ? "block" : "none";
    item.appendChild(panel);

    toggleButton.addEventListener("click", function () {
      const nowExpanded = panel.style.display === "none";
      panel.style.display = nowExpanded ? "block" : "none";
      toggleButton.classList.toggle("is-open", nowExpanded);
      if (nowExpanded) expandedFinanceAccountIds.add(account.id);
      else expandedFinanceAccountIds.delete(account.id);
    });
  }

  if (manageMode) {
    const actions = document.createElement("div");
    actions.className = "finance-item-actions";

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "finance-drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.title = "按住拖曳排序";
    dragHandle.setAttribute("aria-label", "按住拖曳排序");
    attachFinanceAccountDragHandlers(dragHandle, item, account);

    const editButton = document.createElement("button");
    editButton.textContent = "編輯";
    editButton.addEventListener("click", function () {
      const editForm = buildFinanceAccountEditForm(account, function () {
        editForm.replaceWith(item);
      });
      item.replaceWith(editForm);
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", function () {
      deleteFinanceAccount(account.id);
    });

    actions.appendChild(dragHandle);
    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    item.appendChild(actions);
  }

  return item;
}

// 拖曳排序：
// 1. 支援上下左右（因為桌面版是多欄 Grid，只判斷上下不夠，要用「離哪個項目最近」來判斷）
// 2. 拖曳中即時標示「放開後會插進哪裡」，不是放開才知道結果
// 3. 拖到螢幕邊緣時自動捲動（解決手機版拖到最下面卡住、超出範圍看不到的問題）
//
// 核心判斷邏輯（pickInsertionTarget）：算出離目前拖曳點最近的項目，
// 如果跟那個項目大致同一列（垂直距離小於半個項目高度），比左右；
// 不同列就比上下。這樣不管是單欄（手機直排）還是多欄（桌面 Grid）都適用。
function pickFinanceAccountInsertionTarget(container, item, pointX, pointY) {
  const siblings = Array.from(container.children).filter(function (el) { return el !== item; });
  if (siblings.length === 0) return null;

  let closest = null;
  let closestDist = Infinity;

  siblings.forEach(function (sibling) {
    const rect = sibling.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(pointX - cx, pointY - cy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = { el: sibling, rect, cx, cy };
    }
  });

  if (!closest) return null;

  const rowTolerance = closest.rect.height / 2;
  const sameRow = Math.abs(pointY - closest.cy) < rowTolerance;
  const insertBefore = sameRow ? (pointX < closest.cx) : (pointY < closest.cy);

  return insertBefore ? closest.el : closest.el.nextSibling;
}

// 靠近視窗上下邊緣時自動捲動頁面，讓拖曳可以超出目前畫面看得到的範圍。
let financeAccountAutoScrollRAF = null;

function startFinanceAccountAutoScroll(getPointerY) {
  const EDGE = 70;
  const MAX_SPEED = 18;

  function step() {
    const y = getPointerY();
    if (y === null) {
      financeAccountAutoScrollRAF = null;
      return;
    }
    const viewportHeight = window.innerHeight;
    if (y < EDGE) {
      window.scrollBy(0, -MAX_SPEED * (1 - y / EDGE));
    } else if (y > viewportHeight - EDGE) {
      window.scrollBy(0, MAX_SPEED * (1 - (viewportHeight - y) / EDGE));
    }
    financeAccountAutoScrollRAF = requestAnimationFrame(step);
  }

  if (!financeAccountAutoScrollRAF) {
    financeAccountAutoScrollRAF = requestAnimationFrame(step);
  }
}

function stopFinanceAccountAutoScroll() {
  if (financeAccountAutoScrollRAF) {
    cancelAnimationFrame(financeAccountAutoScrollRAF);
    financeAccountAutoScrollRAF = null;
  }
}

function attachFinanceAccountDragHandlers(handle, item, account) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let dropTargetEl = null;

  function clearDropTargetHighlight() {
    if (dropTargetEl) {
      dropTargetEl.classList.remove("finance-item-drop-before", "finance-item-drop-after");
      dropTargetEl = null;
    }
  }

  function updateDropTargetHighlight(container) {
    clearDropTargetHighlight();
    const target = pickFinanceAccountInsertionTarget(container, item, lastPointerX, lastPointerY);
    if (target && target !== item) {
      target.classList.add("finance-item-drop-before");
      dropTargetEl = target;
    } else if (!target && container.lastElementChild && container.lastElementChild !== item) {
      container.lastElementChild.classList.add("finance-item-drop-after");
      dropTargetEl = container.lastElementChild;
    }
  }

  handle.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    item.classList.add("finance-item-dragging");
    startFinanceAccountAutoScroll(function () { return dragging ? lastPointerY : null; });
  });

  handle.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    item.style.transform = `translate(${lastPointerX - startX}px, ${lastPointerY - startY}px)`;

    const container = item.parentElement;
    if (container) updateDropTargetHighlight(container);
  });

  handle.addEventListener("pointerup", function () {
    if (!dragging) return;
    dragging = false;
    stopFinanceAccountAutoScroll();

    item.style.transform = "";
    item.classList.remove("finance-item-dragging");
    clearDropTargetHighlight();

    const container = item.parentElement;
    if (container) {
      const insertBeforeEl = pickFinanceAccountInsertionTarget(container, item, lastPointerX, lastPointerY);
      if (insertBeforeEl) {
        container.insertBefore(item, insertBeforeEl);
      } else {
        container.appendChild(item);
      }
    }

    finalizeFinanceAccountReorder(account.category);
  });

  handle.addEventListener("pointercancel", function () {
    dragging = false;
    stopFinanceAccountAutoScroll();
    item.style.transform = "";
    item.classList.remove("finance-item-dragging");
    clearDropTargetHighlight();
  });
}

// 放開拖曳後，照目前 DOM 上的實際順序，重新配給該分類（資產／負債各自）
// 連續的 display_order（0, 1, 2...），並只把真的有變動的帳戶寫回 Supabase。
async function finalizeFinanceAccountReorder(category) {
  const container = category === "asset" ? financeAssetsList : financeLiabilitiesList;
  const orderedIds = Array.from(container.children)
    .map(function (el) { return el.dataset ? el.dataset.accountId : null; })
    .filter(Boolean);

  const changed = [];
  orderedIds.forEach(function (id, index) {
    const account = financeAccounts.find(a => a.id === id);
    if (account && account.display_order !== index) {
      account.display_order = index;
      changed.push(account);
    }
  });

  if (changed.length === 0) return;

  if (currentUser) {
    for (const account of changed) {
      const { error } = await supabaseClient
        .from("finance_accounts")
        .update({ display_order: account.display_order })
        .eq("id", account.id);
      if (error) {
        console.log("更新排序失敗", error);
        alert("排序更新失敗，請稍後再試一次。");
      }
    }
  }

  renderFinanceAccounts();
}

function renderFinanceAccounts() {
  // 排序要回寫到主資料陣列本身（financeAccounts），不能只在這個函式裡臨時排序，
  // 不然記帳表單的帳戶下拉選單（refreshFinanceTxAccountOptions 直接讀 financeAccounts）
  // 會跟畫面上的順序對不起來。
  financeAccounts.sort((a, b) => a.display_order - b.display_order);

  refreshAccountTypeSuggestions(financeCategorySelect.value);
  refreshFinanceTxAccountOptions();

  const assets = financeAccounts.filter(account => account.category === "asset");
  const liabilities = financeAccounts.filter(account => account.category === "liability");

  financeAssetsList.innerHTML = "";
  assets.forEach(function (account) {
    financeAssetsList.appendChild(buildFinanceAccountItem(account, financeAccountsManageMode));
  });
  financeAssetsEmpty.style.display = assets.length > 0 ? "none" : "block";

  financeLiabilitiesList.innerHTML = "";
  liabilities.forEach(function (account) {
    financeLiabilitiesList.appendChild(buildFinanceAccountItem(account, financeAccountsManageMode));
  });
  financeLiabilitiesEmpty.style.display = liabilities.length > 0 ? "none" : "block";

  const totalAssets = assets.reduce((sum, account) => sum + account.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, account) => sum + account.balance, 0);
  financeNetWorth = totalAssets - totalLiabilities;

  financeTotalAssetsText.innerText = `總資產：$${totalAssets.toLocaleString()}`;
  financeTotalLiabilitiesText.innerText = `總負債：$${totalLiabilities.toLocaleString()}`;
  financeNetWorthText.innerText = `淨資產：$${financeNetWorth.toLocaleString()}`;

  updatePlayerPanel();
  refreshFinanceForecastPanel();
}

financeAddButton.addEventListener("click", addFinanceAccount);
// ===================================================================

// ============健============康============面============板============
const health = {
  sleepHours: 7,
  waterCups: 8,
  exercised: false
};
// ===================================================================
// LifeOS 初始化
// ===================================================================
// Todo／Goal／Reflection 初始化改由登入狀態決定
// （見上方 onAuthStateChange／getSession），這裡不再需要任何呼叫。
updatePlayerPanel();