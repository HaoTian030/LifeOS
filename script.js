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
const financeTxTagList = document.getElementById("finance-tx-tag-list");
const financeTxAddButton = document.getElementById("finance-tx-add-button");

// 分類標籤建議清單 = 使用者用過的所有標籤（去重），沒有預設清單，純粹從實際使用中累積，
// 跟資產類型的 datalist 是同一套設計邏輯。
function refreshFinanceTxTagSuggestions() {
  if (!financeTxTagList) return;
  const usedTags = [...new Set(financeTransactions.map(tx => tx.tag).filter(Boolean))];
  financeTxTagList.innerHTML = "";
  usedTags.forEach(function (tag) {
    const option = document.createElement("option");
    option.value = tag;
    financeTxTagList.appendChild(option);
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
    display_order: row.display_order
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
    occurred_on: row.occurred_on
  }));
}

async function initFinanceForUser() {
  await loadFinanceAccountsFromSupabase();
  await loadFinanceTransactionsFromSupabase();
  setFinanceTxDateToday();
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
}

function initFinanceForGuest() {
  financeAccounts = DEMO_FINANCE_ACCOUNTS.map(item => ({ ...item }));
  financeTransactions = DEMO_FINANCE_TRANSACTIONS.map(item => ({ ...item }));
  setFinanceTxDateToday();
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
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

  if (type === "income") {
    changes.push({ id: accountId, delta: amount * direction });
  } else if (type === "expense") {
    changes.push({ id: accountId, delta: -amount * direction });
  } else if (type === "transfer") {
    changes.push({ id: fromAccountId, delta: -amount * direction });
    changes.push({ id: toAccountId, delta: amount * direction });
  }

  for (const change of changes) {
    const account = financeAccounts.find(a => a.id === change.id);
    if (!account) continue;
    const newBalance = account.balance + change.delta;

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

async function addFinanceTransaction() {
  const type = selectedTxType;
  const amountRaw = financeTxAmountInput.value.trim();
  const occurredOn = financeTxDateInput.value || new Date().toISOString().split("T")[0];
  const category = financeTxCategoryInput.value.trim();
  const tag = financeTxTagInput.value.trim();

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
        occurred_on: occurredOn
      })
      .select()
      .single();

    if (error) {
      console.log("新增交易失敗", error);
      alert("新增失敗，請稍後再試一次。");
      return;
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
      occurred_on: data.occurred_on
    });
  } else {
    financeTransactions.unshift({
      id: `demo-tx-${Date.now()}`,
      type, account_id: accountId, from_account_id: fromAccountId, to_account_id: toAccountId,
      amount, category, tag, occurred_on: occurredOn
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

  financeTxAmountInput.value = "";
  financeTxCategoryInput.value = "";
  financeTxTagInput.value = "";
  setFinanceTxDateToday();
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
  refreshFinanceTxDetailModal();
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

  financeTransactions = financeTransactions.filter(t => t.id !== id);
  renderFinanceAccounts();
  refreshFinanceTxTagSuggestions();
  refreshFinanceTxDetailModal();
}

function getFinanceAccountName(id) {
  const account = financeAccounts.find(a => a.id === id);
  return account ? account.name : "（帳戶已刪除）";
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

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "刪除";
  deleteButton.addEventListener("click", function () {
    deleteFinanceTransaction(tx.id);
  });

  item.appendChild(info);
  item.appendChild(amount);
  item.appendChild(deleteButton);

  return item;
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
const financeTxFilterTag = document.getElementById("finance-tx-filter-tag");
const financeTxDetailList = document.getElementById("finance-tx-detail-list");
const financeTxDetailEmpty = document.getElementById("finance-tx-detail-empty");

function refreshFinanceTxFilterOptions() {
  const months = [...new Set(financeTransactions.map(tx => getFinanceTxMonthKey(tx.occurred_on)).filter(Boolean))]
    .sort(function (a, b) { return b.localeCompare(a); });
  const tags = [...new Set(financeTransactions.map(tx => tx.tag).filter(Boolean))];

  const previousMonth = financeTxFilterMonth.value;
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
  financeTxFilterMonth.value = (previousMonth && months.includes(previousMonth)) ? previousMonth : "all";

  const previousTag = financeTxFilterTag.value;
  financeTxFilterTag.innerHTML = "";
  const allTagOption = document.createElement("option");
  allTagOption.value = "all";
  allTagOption.textContent = "全部標籤";
  financeTxFilterTag.appendChild(allTagOption);
  tags.forEach(function (tag) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    financeTxFilterTag.appendChild(option);
  });
  financeTxFilterTag.value = (previousTag && tags.includes(previousTag)) ? previousTag : "all";
}

function renderFinanceTransactionDetailList() {
  const monthFilter = financeTxFilterMonth.value || "all";
  const tagFilter = financeTxFilterTag.value || "all";

  const filtered = financeTransactions.filter(function (tx) {
    const monthMatch = monthFilter === "all" || getFinanceTxMonthKey(tx.occurred_on) === monthFilter;
    const tagMatch = tagFilter === "all" || tx.tag === tagFilter;
    return monthMatch && tagMatch;
  });

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
financeTxFilterTag.addEventListener("change", renderFinanceTransactionDetailList);

financeTxAddButton.addEventListener("click", addFinanceTransaction);

// 懸浮按鈕：只開快速記帳表單（不含明細），符合「記帳要快」的訴求。
const financeTxFab = document.getElementById("finance-tx-fab");
const financeTxModalOverlay = document.getElementById("finance-tx-modal-overlay");
const financeTxModalClose = document.getElementById("finance-tx-modal-close");

financeTxFab.addEventListener("click", function () {
  financeTxModalOverlay.style.display = "flex";
  applyPreferredDefaultsForCurrentType();
});

function closeFinanceTxModal() {
  financeTxModalOverlay.style.display = "none";
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
        display_order: financeAccounts.length
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
      display_order: data.display_order
    });
  } else {
    financeAccounts.push({
      id: `demo-finance-${Date.now()}`,
      name,
      purpose,
      category,
      account_type: accountType,
      balance,
      display_order: financeAccounts.length
    });
  }

  financeNameInput.value = "";
  financePurposeInput.value = "";
  financeTypeInput.value = "";
  financeBalanceInput.value = "";
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
      balance: balanceRaw === "" ? 0 : Number(balanceRaw)
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

  const balance = document.createElement("span");
  balance.className = "finance-item-balance";
  balance.textContent = `$${account.balance.toLocaleString()}`;

  nameRow.appendChild(name);
  nameRow.appendChild(balance);

  const meta = document.createElement("div");
  meta.className = "finance-item-meta";
  meta.textContent = [account.purpose, account.account_type].filter(Boolean).join(" · ");

  info.appendChild(nameRow);
  info.appendChild(meta);

  item.appendChild(info);

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

// 拖曳排序：改成「放開時一次判定最終位置」，不是拖曳過程中即時交換。
// 拖曳中，項目本身只是用 transform 跟著手指/滑鼠垂直飄動，其他項目完全不動；
// 放開的瞬間，用當下的最終位置去跟所有項目的中線比一次，直接決定該插進哪個位置。
// 這樣不管拖多遠、拖多快、中途改變方向都沒問題，因為只判斷一次，不會有中間狀態累積出錯的空間
// （先前「拖曳中即時交換」的寫法在快速/來回拖曳時容易卡住、只能一格一格動，就是這個原因）。
function attachFinanceAccountDragHandlers(handle, item, account) {
  let dragging = false;
  let startY = 0;
  let startRect = null;

  handle.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    startY = e.clientY;
    startRect = item.getBoundingClientRect();
    item.classList.add("finance-item-dragging");
  });

  handle.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const deltaY = e.clientY - startY;
    item.style.transform = `translateY(${deltaY}px)`;
  });

  handle.addEventListener("pointerup", function (e) {
    if (!dragging) return;
    dragging = false;

    const deltaY = e.clientY - startY;
    const draggedCenterY = startRect.top + startRect.height / 2 + deltaY;

    item.style.transform = "";
    item.classList.remove("finance-item-dragging");

    const container = item.parentElement;
    if (container) {
      const siblings = Array.from(container.children).filter(function (el) { return el !== item; });
      let insertBeforeEl = null;

      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (draggedCenterY < midpoint) {
          insertBeforeEl = sibling;
          break;
        }
      }

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
    item.style.transform = "";
    item.classList.remove("finance-item-dragging");
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