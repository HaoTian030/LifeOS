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
const authUserEmail = document.getElementById("auth-user-email");
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
  authUserEmail.innerText = `👤 已登入：${user.email}`;
  authStatus.innerText = "";
  closeAuthModal();
  await initTodosForUser(user);
  await initGoalsForUser();
  await initReflectionsForUser();
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
  if (wealthStat) wealthStat.innerText = `財富：儲蓄率 ${savingRate}%`;
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
const finance = {
  cash: 1074,
  investment: 50000,
  crypto: 3000,
  income: 35000,
  expense: 33000,
};
const totalAsset = finance.cash + finance.investment + finance.crypto;
const saving = finance.income - finance.expense;
const savingRate = ((saving / finance.income) * 100).toFixed(1);

// 加上元素存在檢查：如果這張卡片沒出現在目前這份 HTML 裡（例如朋友測試版只留 4 張卡），
// 就跳過不寫，避免整支 script 因為 null.innerText 而中斷，影響到後面 Todo/Goal/Reflection 的初始化。
function setTextIfExists(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerText = text;
  }
}

setTextIfExists("cash", `💵 現金：$${finance.cash}`);
setTextIfExists("investment", `💹 股票：$${finance.investment}`);
setTextIfExists("crypto", `🪙 加密貨幣：$${finance.crypto}`);
setTextIfExists("income", `🏧 收入：$${finance.income}`);
setTextIfExists("expense", `🧾 支出：$${finance.expense}`);
setTextIfExists("finance", `💰 總資產：$${totalAsset}`);
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