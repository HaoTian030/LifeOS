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

// 記著剛剛是對哪個 email 寄的驗證碼，等一下驗證那一步要用。
let pendingAuthEmail = "";

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

function showLoggedIn(user) {
  authLoggedOut.style.display = "none";
  authOtpRow.style.display = "none";
  authLoggedIn.style.display = "flex";
  authUserEmail.innerText = `👤 已登入：${user.email}`;
  authStatus.innerText = "";
}

function showLoggedOut() {
  authLoggedOut.style.display = "flex";
  authOtpRow.style.display = "none";
  authLoggedIn.style.display = "none";
  authStatus.innerText = "";
  authOtpInput.value = "";
  pendingAuthEmail = "";
}

async function logout() {
  await supabaseClient.auth.signOut();
}

authSendLinkButton.addEventListener("click", sendOtp);
authVerifyOtpButton.addEventListener("click", verifyOtp);
authLogoutButton.addEventListener("click", logout);

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
function loadTodos() {
  todos = loadFromStorage("todos", []);
}
function saveTodos() {
  saveToStorage("todos", todos);
}
function loadPendingTodos() {
  pendingTodos = loadFromStorage("pendingTodos", []);
}
function savePendingTodos() {
  saveToStorage("pendingTodos", pendingTodos);
}
function loadTotalCompletedTodos() {
  totalCompletedTodos = loadFromStorage("totalCompletedTodos", 0);
}
function saveTotalCompletedTodos() {
  saveToStorage("totalCompletedTodos", totalCompletedTodos);
}
// 檢查今天日期是否跟上次不同：
// 不同的話，今天代辦清單重新開始，未完成的項目搬進「待處理」等你決定，
// 已完成的項目直接捨棄（完成次數已經算進 totalCompletedTodos，不用再保留）。
function checkTodoDayRollover() {
  const today = new Date().toLocaleDateString("zh-TW");
  const lastDate = loadFromStorage("lastTodoDate", today);

  if (lastDate !== today) {
    const stillUnfinished = todos.filter(todo => !todo.done);
    pendingTodos = pendingTodos.concat(stillUnfinished);
    todos = [];
    saveTodos();
    savePendingTodos();
  }

  saveToStorage("lastTodoDate", today);
}
function refreshTodos() {
  saveTodos();
  renderTodos();
  updatePlayerPanel();
}
function removeFromPending(id) {
  pendingTodos = pendingTodos.filter(function (item) {
    return item.id !== id;
  });
  savePendingTodos();
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
    toTodayButton.addEventListener("click", function () {
      todos.push({ id: Date.now(), text: item.text, done: false });
      removeFromPending(item.id);
      refreshTodos();
    });

    const toGoalButton = document.createElement("button");
    toGoalButton.type = "button";
    toGoalButton.innerText = "加入本週目標";
    toGoalButton.addEventListener("click", function () {
      goals.push({ text: item.text, done: false });
      removeFromPending(item.id);
      refreshGoals();
    });

    const dropButton = document.createElement("button");
    dropButton.type = "button";
    dropButton.innerText = "放棄";
    dropButton.addEventListener("click", function () {
      removeFromPending(item.id);
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

    checkbox.addEventListener("change",function () {
      if (checkbox.checked && !todo.done) {
        totalCompletedTodos++;
        saveTotalCompletedTodos();
      } else if (!checkbox.checked && todo.done) {
        totalCompletedTodos--;
        saveTotalCompletedTodos();
      }
      todo.done = checkbox.checked;
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
function addTodo() {
  const newTodoText = todoInput.value.trim();

  if (newTodoText === "") return;

  todos.push({
    id: Date.now(),
    text: newTodoText,
    done: false
  });

  todoInput.value = "";
  refreshTodos();
}
function deleteTodo(id) {

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
function loadGoals() {
  goals = loadFromStorage("goals", [
    { id: 1, text: "初始階段1:打造建立 LifeOS 系統", done: false },
    { id: 2, text: "初始階段2:整理想法及方向", done: false },
    { id: 3, text: "初始階段3:優化構造及LifeOS", done: false },
    { id: 4, text: "成熟階段1:持續打造LifeOS及時續優化", done: false },
    { id: 5, text: "成熟階段2:提供親友試用及試錯調整", done: false },
    { id: 6, text: "未來主線1:LifeOS 歷史紀錄系統(可將資料封存)", done: false },
    { id: 7, text: "未來主線2:將打造 LifeOS 歷程拍成一部小影片", done: false },
    { id: 8, text: "未來主線3:分享他人使用 LifeOS", done: false }
  ]);
}
function saveGoals() {
  saveToStorage("goals", goals);
}
function loadPendingGoals() {
  pendingGoals = loadFromStorage("pendingGoals", []);
}
function savePendingGoals() {
  saveToStorage("pendingGoals", pendingGoals);
}
function loadTotalCompletedGoals() {
  totalCompletedGoals = loadFromStorage("totalCompletedGoals", 0);
}
function saveTotalCompletedGoals() {
  saveToStorage("totalCompletedGoals", totalCompletedGoals);
}
function loadGoalHistory() {
  goalHistory = loadFromStorage("goalHistory", []);
}
function saveGoalHistory() {
  saveToStorage("goalHistory", goalHistory);
}
// 算出「本週週日」的日期字串，當作這一週的身分證字號。
// 只要這個字串跟上次記錄的不一樣，就代表跨週了。
function getThisSundayDate() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = 週日
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  return sunday.toLocaleDateString("zh-TW");
}
// 檢查是否跨週：跨週的話，完成的目標連同完成日期一起搬進 goalHistory 永久保留，
// 未完成的目標搬進 pendingGoals 等你決定去留，本週目標清單重新開始。
function checkGoalWeekRollover() {
  const thisSunday = getThisSundayDate();
  const lastSunday = loadFromStorage("lastGoalWeekStart", thisSunday);

  if (lastSunday !== thisSunday) {
    const today = new Date().toLocaleDateString("zh-TW");

    goals.forEach(function (goal, index) {
      if (!goal.id) {
        // 相容舊資料：之前存的目標沒有 id，這裡補一個，
        // 確保待處理清單之後能正確辨識「是哪一筆」。
        goal.id = Date.now() + index;
      }
      if (goal.done) {
        goalHistory.push({
          id: goal.id,
          text: goal.text,
          completedDate: goal.completedDate || today
        });
      } else {
        pendingGoals.push(goal);
      }
    });

    goals = [];
    saveGoals();
    saveGoalHistory();
    savePendingGoals();
  }

  saveToStorage("lastGoalWeekStart", thisSunday);
}
// 一次性遷移：把「已完成、但從沒被計數器算過」的舊資料補記進去。
// 之後每個目標一旦被算過就會標記 counted=true，這段邏輯自然只會對每筆資料生效一次。
function migrateLegacyCompletedGoals() {
  let changed = false;

  goals.forEach(function (goal) {
    if (goal.done && !goal.counted) {
      totalCompletedGoals++;
      goal.counted = true;
      if (!goal.completedDate) {
        // 沒辦法知道當初確切的完成日期，先用今天代替。
        goal.completedDate = new Date().toLocaleDateString("zh-TW");
      }
      changed = true;
    }
  });

  if (changed) {
    saveGoals();
    saveTotalCompletedGoals();
  }
}
function refreshGoals() {
  saveGoals();
  renderGoals();
  updatePlayerPanel();
}
function removeFromPendingGoals(id) {
  pendingGoals = pendingGoals.filter(function (item) {
    return item.id !== id;
  });
  savePendingGoals();
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
    keepButton.addEventListener("click", function () {
      goals.push({ id: item.id, text: item.text, done: false });
      removeFromPendingGoals(item.id);
      refreshGoals();
    });

    const dropButton = document.createElement("button");
    dropButton.type = "button";
    dropButton.innerText = "放棄";
    dropButton.addEventListener("click", function () {
      removeFromPendingGoals(item.id);
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

    checkbox.addEventListener("change", () => {
      if (checkbox.checked && !goal.counted) {
        totalCompletedGoals++;
        saveTotalCompletedGoals();
        goal.counted = true;
        // 完成當下就記錄日期，不要等到跨週才回頭補，
        // 這樣才不怕使用者忘記或提早關網頁。
        goal.completedDate = new Date().toLocaleDateString("zh-TW");
      } else if (!checkbox.checked && goal.counted) {
        totalCompletedGoals--;
        saveTotalCompletedGoals();
        goal.counted = false;
        delete goal.completedDate;
      }
      goal.done = checkbox.checked;
      refreshGoals();
    });

    const text = document.createElement("span");
    text.innerText = goal.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.innerText = "刪除";

    deleteButton.addEventListener("click", () => {
      goals.splice(index, 1);
      refreshGoals();
    });

    goalItem.appendChild(checkbox);
    goalItem.appendChild(text);
    goalItem.appendChild(deleteButton);
    goalList.appendChild(goalItem);
  });

  updateGoalProgress();
}
function addGoal() {
  const newGoalText = goalInput.value.trim();

  if (newGoalText === "") {
    return;
  }

  goals.push({
    id: Date.now(),
    text: newGoalText,
    done: false
  });

  goalInput.value = "";
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
function saveReflection() {
  const reflectionText = reflectionInput.value.trim();
  if (!reflectionText) return;
  const today = new Date().toLocaleDateString("zh-TW");
  const todayReflection = findTodayReflection();

  if (todayReflection === undefined) {
    const reflection = {
      id: Date.now(),
      date: today,
      text: reflectionText
    };
  
    reflections.push(reflection);

  } else {
    todayReflection.text = reflectionText;
  }

  saveReflections();
  renderReflections();

  // 儲存 = 完成一個動作：清空輸入框，並立即給予儲存成功的回饋，
  // 不然使用者存了反思，畫面上完全看不出來有沒有存到。
  reflectionInput.value = "";
  reflectionInput.style.height = "";
  reflectionStatus.innerText = `✅ 已儲存（${today}）`;
}
function loadReflections() {
  reflections = loadFromStorage("reflections", []);
}
function saveReflections() {
  saveToStorage("reflections", reflections);
}
// function renderReflections() {

//     reflectionList.innerHTML = "";

//     reflections.forEach(reflection => {

//         const item = document.createElement("div");

//         item.innerHTML =
//             `<strong>${reflection.date}</strong>
//             <p>${reflection.text}</p>
//             <hr>`;

//         reflectionList.appendChild(item);

//     });

// }
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

    const today = new Date().toLocaleDateString("zh-TW");

    const todayReflection = reflections.find(reflection => {
        return reflection.date === today;
    });

    return todayReflection;
}
// function deleteReflection() {
//     const today = new Date().toLocaleDateString("zh-TW");

//     const newReflections = reflections.filter(reflection => {
//         return reflection.date !== today;
//     });
//     reflections = newReflections;
//     reflectionCard.appendChild(deleteButton);
//     saveReflections();
//     renderReflections();
// }
function deleteReflection(id) {

    reflections = reflections.filter(function (reflection) {

        return reflection.id !== id;

    });

    saveReflections();

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

  playerLevel.innerText =  `等級: Lv.${level}`;
  playerExp.innerText = `經驗值：${currentLevelExp} / 100 EXP`;
  expProgress.style.width = `${currentLevelExp}%`;
  wealthStat.innerText = `財富：儲蓄率 ${savingRate}%`;
  healthStat.innerText = `健康：${healthScore} / 100`;
  goalStat.innerText = `目標：${completedGoals} / ${totalGoals}`;
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

document.getElementById("cash").innerText = `💵 現金：$${finance.cash}`;
document.getElementById("investment").innerText = `💹 股票：$${finance.investment}`;
document.getElementById("crypto").innerText = `🪙 加密貨幣：$${finance.crypto}`;
document.getElementById("income").innerText = `🏧 收入：$${finance.income}`;
document.getElementById("expense").innerText = `🧾 支出：$${finance.expense}`;
document.getElementById("finance").innerText = `💰 總資產：$${totalAsset}`;
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
loadTodos();
loadPendingTodos();
loadTotalCompletedTodos();
checkTodoDayRollover();
renderTodos();
renderPendingTodos();
loadGoals();
loadPendingGoals();
loadTotalCompletedGoals();
loadGoalHistory();
migrateLegacyCompletedGoals();
checkGoalWeekRollover();
renderGoals();
renderPendingGoals();
renderGoalHistory();
loadReflections();
loadReflection();
renderReflections();
updatePlayerPanel();

//alert() 及 console.log()  可以協助自己來找出問題
// alert("LifeOS啟動成功");
// console.log("checkbox數量:", checkboxes.length);
// console.log("progress物件:", progress);