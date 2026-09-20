"use strict";

/* =========================================================
   FOCUSLAB GLOBAL DATA
========================================================= */

let tasks = [];
let currentFilter = "All";

let activeTimerTaskId = null;
let globalTimerInterval = null;

let breakInterval = null;
let breakSeconds = 0;

let currentMusicAudioEl = null;
let musicPositionSaveInterval = null;


/* =========================================================
   HELPERS
========================================================= */

function isTasksPage() {
    return !!document.getElementById("tasksListContainer");
}

/*
 * True when the current file lives inside /pages/
 * (e.g. pages/tasks.html), false for the root index.html.
 * Used so the same script can resolve "images/..." paths
 * correctly no matter which page loaded it.
 */
function isInPagesFolder() {
    return window.location.pathname.includes("/pages/");
}

function getTasks() {
    try {
        const stored = localStorage.getItem("focusLab_tasks");
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveTasks() {
    localStorage.setItem("focusLab_tasks", JSON.stringify(tasks));
}

function createTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatSeconds(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0")
    );
}

function getAssetPath(path) {

    const fallback =
        isInPagesFolder()
            ? "../images/avatars/avatar1.jpeg"
            : "images/avatars/avatar1.jpeg";

    if (!path) return fallback;

    if (
        path.startsWith("http://") ||
        path.startsWith("https://") ||
        path.startsWith("data:")
    ) {
        return path;
    }

    /*
     * Normalize whatever was stored ("images/...",
     * "../images/...", "/images/...") down to a clean
     * "images/..." form, then prefix correctly for
     * whichever page is currently resolving it.
     */
    let clean = path.replace(/^(\.\.\/)+/, "").replace(/^\//, "");

    if (!clean.startsWith("images/")) {
        return path;
    }

    return isInPagesFolder() ? "../" + clean : clean;
}


/* =========================================================
   MIGRATION
========================================================= */

function normalizeTasks() {

    let changed = false;

    tasks = tasks.map(task => {

        const normalized = {
            id: task.id || createTaskId(),
            text: task.text || "Untitled Task",
            focusTime:
                task.focusTime === null ||
                task.focusTime === undefined ||
                task.focusTime === ""
                    ? null
                    : Number(task.focusTime),

            breakTime:
                task.breakTime === null ||
                task.breakTime === undefined ||
                task.breakTime === ""
                    ? null
                    : Number(task.breakTime),

            priority: task.priority || "Normal",
            completed: Boolean(task.completed),

            timerRunning: Boolean(task.timerRunning),
            timerEndAt: task.timerEndAt || null,
            timerFinished: Boolean(task.timerFinished),
            timerNotified: Boolean(task.timerNotified),

            /*
             * Remaining seconds kept aside while the
             * timer is manually paused via the toggle button.
             */
            pausedRemaining:
                task.pausedRemaining === null ||
                task.pausedRemaining === undefined
                    ? null
                    : Number(task.pausedRemaining)
        };

        /*
         * Older tasks do not have timer state.
         * We deliberately DO NOT start old tasks automatically.
         * Only newly created tasks start automatically.
         */

        if (
            normalized.timerRunning &&
            normalized.timerEndAt &&
            Date.now() >= normalized.timerEndAt
        ) {
            normalized.timerRunning = false;
            normalized.timerEndAt = null;
            normalized.timerFinished = true;
        }

        if (
            normalized.id !== task.id ||
            normalized.timerRunning !== Boolean(task.timerRunning)
        ) {
            changed = true;
        }

        return normalized;
    });

    if (changed) {
        saveTasks();
    }
}


/* =========================================================
   USER / AVATAR
========================================================= */

function loadUserInfo() {

    const firstName =
        localStorage.getItem("focusLab_firstName") || "Focus";

    const lastName =
        localStorage.getItem("focusLab_lastName") || "User";

    const avatar =
        localStorage.getItem("focusLab_avatarSrc") ||
        "images/avatars/avatar1.jpeg";

    const fullName = `${firstName} ${lastName}`.trim();

    const homeName = document.getElementById("homeUserName");
    if (homeName) {
        homeName.textContent = fullName;
    }

    const homeAvatar = document.getElementById("homeAvatar");
    if (homeAvatar) {
        homeAvatar.src = getAssetPath(avatar);
    }

    const sidebarName = document.getElementById("sidebar-user-name");
    if (sidebarName) {
        sidebarName.textContent = fullName;
    }

    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) {
        sidebarAvatar.src = getAssetPath(avatar);
    }

    const headerAvatar = document.getElementById("user-avatar-display");
    if (headerAvatar) {
        headerAvatar.src = getAssetPath(avatar);
    }
}


/* =========================================================
   SIGN IN / HOME — now ONE file (index.html).
   Signing in no longer navigates anywhere: it just swaps
   which section of the page is visible.
========================================================= */

let selectedSigninAvatar = null;

function isSignedIn() {
    return localStorage.getItem("focusLab_signedIn") === "true";
}

function showHomeView() {
    document.documentElement.classList.remove("is-guest");
    document.documentElement.classList.add("is-signed-in");
}

function showSigninView() {
    document.documentElement.classList.remove("is-signed-in");
    document.documentElement.classList.add("is-guest");
}

function applyAuthView() {

    /* Only relevant on the merged index.html page. */
    if (!document.getElementById("signinView")) return;

    if (isSignedIn()) {
        showHomeView();
    } else {
        showSigninView();
    }
}

function selectSigninAvatar(button) {

    document
        .querySelectorAll("#signinAvatarGrid .background-option")
        .forEach(option => option.classList.remove("selected"));

    button.classList.add("selected");
    selectedSigninAvatar = button.dataset.avatar;
}


/* =========================================================
   AVATAR PHOTO UPLOAD
   Lets the person pick their own photo instead of one of the
   four built-in code-drawn avatars. The photo is cropped to a
   square and downsized on a canvas, then kept as a small data
   URL — so it works with the exact same storage key
   (focusLab_avatarSrc) as the built-in avatars.
========================================================= */

const AVATAR_PHOTO_SIZE = 240;

function processAvatarFile(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {

            const img = new Image();

            img.onload = () => {

                const size = AVATAR_PHOTO_SIZE;
                const canvas = document.createElement("canvas");

                canvas.width = size;
                canvas.height = size;

                const ctx = canvas.getContext("2d");

                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;

                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

                resolve(canvas.toDataURL("image/jpeg", 0.87));
            };

            img.onerror = () => reject(new Error("Could not read that image."));

            img.src = reader.result;
        };

        reader.onerror = () => reject(new Error("Could not read that file."));

        reader.readAsDataURL(file);
    });
}

/* --- Used inside the sign-in avatar grid (5th "Add" tile) --- */

function triggerSigninAvatarUpload() {

    const input = document.getElementById("signinAvatarFileInput");

    if (input) input.click();
}

async function handleSigninAvatarFileSelected(event) {

    const file = event.target.files && event.target.files[0];

    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
    }

    try {

        const dataUrl = await processAvatarFile(file);

        const addButton = document.getElementById("signinAvatarAddBtn");

        if (addButton) {

            addButton.innerHTML = `<img src="${dataUrl}" alt="Your photo">`;
            addButton.dataset.avatar = dataUrl;

            selectSigninAvatar(addButton);
        }

    } catch {
        alert("Couldn't use that photo. Please try another image.");
    }
}

/* --- Used for changing the avatar from inside the app
       (click your avatar in the header or sidebar) --- */

function openAvatarEditModal() {

    /* Only available once signed in. */
    if (!isSignedIn()) return;

    const modal = document.getElementById("avatarEditModal");

    if (modal) {
        modal.classList.add("active");
    }

    markSelectedAvatarInEditGrid();
}

function closeAvatarEditModal() {

    const modal = document.getElementById("avatarEditModal");

    if (modal) {
        modal.classList.remove("active");
    }
}

function markSelectedAvatarInEditGrid() {

    const current = localStorage.getItem("focusLab_avatarSrc") || "";

    document
        .querySelectorAll("#avatarEditGrid .background-option[data-avatar]")
        .forEach(button => {
            button.classList.toggle("selected", button.dataset.avatar === current);
        });

    const addButton = document.getElementById("avatarEditAddBtn");

    if (!addButton) return;

    if (current.startsWith("data:")) {

        addButton.innerHTML = `<img src="${current}" alt="Your photo">`;
        addButton.classList.add("selected");

    } else {

        addButton.innerHTML = `
            <span class="avatar-add-icon">+</span>
            <span class="avatar-add-label">Add</span>
        `;

        addButton.classList.remove("selected");
    }
}

function applyAvatarChoice(button) {

    const avatar = button.dataset.avatar;

    if (!avatar) return;

    localStorage.setItem("focusLab_avatarSrc", avatar);

    loadUserInfo();

    closeAvatarEditModal();
}

function triggerAvatarEditUpload() {

    const input = document.getElementById("avatarEditFileInput");

    if (input) input.click();
}

async function handleAvatarEditFileSelected(event) {

    const file = event.target.files && event.target.files[0];

    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
    }

    try {

        const dataUrl = await processAvatarFile(file);

        localStorage.setItem("focusLab_avatarSrc", dataUrl);

        loadUserInfo();

        closeAvatarEditModal();

    } catch {
        alert("Couldn't use that photo. Please try another image.");
    }
}

function submitSignin() {

    const firstName = document.getElementById("signinFirstName")?.value.trim();
    const lastName = document.getElementById("signinLastName")?.value.trim();
    const email = document.getElementById("signinEmail")?.value.trim();
    const password = document.getElementById("signinPassword")?.value.trim();
    const errorText = document.getElementById("signinError");

    if (!firstName || !lastName || !email || !password || !selectedSigninAvatar) {

        if (errorText) {
            errorText.classList.add("active");
        }

        return;
    }

    if (errorText) {
        errorText.classList.remove("active");
    }

    localStorage.setItem("focusLab_firstName", firstName);
    localStorage.setItem("focusLab_lastName", lastName);
    localStorage.setItem("focusLab_email", email);
    localStorage.setItem("focusLab_avatarSrc", selectedSigninAvatar);
    localStorage.setItem("focusLab_signedIn", "true");

    showHomeView();
    loadUserInfo();
}

function signOut() {

    localStorage.removeItem("focusLab_signedIn");
    showSigninView();
}


/* =========================================================
   SIDEBAR
========================================================= */

function toggleSidebar() {

    const sidebar = document.getElementById("sidebar");

    if (!sidebar) return;

    if (window.innerWidth <= 800) {
        sidebar.classList.toggle("open");
    } else {

        sidebar.classList.toggle("closed");

        /*
         * Desktop only: when the sidebar is closed, the main
         * board + footer smoothly expand to fill the freed-up
         * space (via the ".sidebar-collapsed" CSS rules).
         * Reopening the sidebar removes the class, so the
         * same transition plays in reverse.
         */
        const appScreen = document.getElementById("app-screen");

        if (appScreen) {
            appScreen.classList.toggle(
                "sidebar-collapsed",
                sidebar.classList.contains("closed")
            );
        }
    }
}


/* =========================================================
   ADD TASK MODAL
========================================================= */

function openAddTaskModal() {

    const modal = document.getElementById("addTaskModal");

    if (!modal) return;

    modal.classList.add("active");

    setTimeout(() => {
        const input = document.getElementById("taskTextInput");
        if (input) input.focus();
    }, 100);
}

function closeAddTaskModal() {

    const modal = document.getElementById("addTaskModal");

    if (modal) {
        modal.classList.remove("active");
    }
}


/* =========================================================
   CREATE TASK
   TIMER STARTS AUTOMATICALLY
========================================================= */

function createTask() {

    const textInput = document.getElementById("taskTextInput");
    const focusInput = document.getElementById("focusTimeInput");
    const breakInput = document.getElementById("breakTimeInput");
    const priorityInput = document.getElementById("priorityInput");

    if (!textInput) return;

    const text = textInput.value.trim();

    if (!text) {
        textInput.focus();
        return;
    }

    const focusValue = focusInput
        ? Number(focusInput.value)
        : 0;

    const breakValue = breakInput
        ? Number(breakInput.value)
        : 0;

    const focusTime =
        Number.isFinite(focusValue) && focusValue > 0
            ? focusValue
            : null;

    const breakTime =
        Number.isFinite(breakValue) && breakValue > 0
            ? breakValue
            : null;

    const newTask = {

        id: createTaskId(),

        text: text,

        focusTime: focusTime,

        breakTime: breakTime,

        priority:
            priorityInput?.value ||
            "Normal",

        completed: false,

        /*
         * IMPORTANT:
         * The timer starts at the exact moment
         * the task is created.
         */
        timerRunning: Boolean(focusTime),

        timerEndAt:
            focusTime
                ? Date.now() + focusTime * 60 * 1000
                : null,

        timerFinished: false,

        timerNotified: false,

        pausedRemaining: null
    };

    tasks.unshift(newTask);

    saveTasks();

    closeAddTaskModal();

    clearTaskForm();

    loadTasks();

    if (newTask.timerRunning) {
        startGlobalTimerUpdater();
    }
}

function clearTaskForm() {

    const taskInput = document.getElementById("taskTextInput");
    const focusInput = document.getElementById("focusTimeInput");
    const breakInput = document.getElementById("breakTimeInput");
    const priorityInput = document.getElementById("priorityInput");

    if (taskInput) taskInput.value = "";
    if (focusInput) focusInput.value = "";
    if (breakInput) breakInput.value = "";

    if (priorityInput) {
        priorityInput.value = "Normal";
    }
}


/* =========================================================
   TIMER TOGGLE ICONS
   A simple round control: a triangle to play,
   two bars to pause — used for both task timers
   and the music player.
========================================================= */

const PLAY_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M8 5.5V18.5L19 12L8 5.5Z"
              stroke="currentColor" stroke-width="1.6"
              stroke-linejoin="round" fill="currentColor"/>
    </svg>
`;

const PAUSE_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M8 5.5V18.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M16 5.5V18.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    </svg>
`;


/* =========================================================
   LOAD TASKS
========================================================= */

/*
 * Builds one task row exactly as it appears in the Tasks
 * list — name, priority, focus/break labels, the timer
 * button + play/pause toggle, the complete button, and the
 * delete button. Shared by the Tasks page and by the "task
 * you're working on" card pinned inside the video player, so
 * both are always identical and both stay in sync through the
 * same update functions (updateAllTaskTimerButtons, etc.).
 */
function buildTaskItemElement(task, targetTaskId = null) {

    const item = document.createElement("div");

    item.className = "task-item";

    item.dataset.taskId = task.id;

    if (task.completed) {
        item.classList.add("completed");
    }

    if (targetTaskId === task.id) {
        item.classList.add("task-search-highlight");
    }

    const priorityClass =
        task.priority === "Important"
            ? "important"
            : task.priority === "Study"
                ? "study"
                : "";

    let timerHTML = "";

    if (
        task.focusTime &&
        task.focusTime > 0
    ) {

        const remaining =
            getTaskRemainingSeconds(task);

        let timerText =
            formatSeconds(remaining);

        let timerClass = "";

        if (task.timerRunning) {
            timerClass = "timer-running";
        }

        if (task.timerFinished) {
            timerClass = "timer-finished";
            timerText = "00:00";
        }

        timerHTML = `
            <button
                class="task-timer-btn ${timerClass}"
                onclick="handleTimerButtonClick('${task.id}')"
                ${task.completed ? "disabled" : ""}
            >
                ${timerText}
            </button>

            <button
                class="task-timer-toggle-btn"
                onclick="toggleTaskTimerRunning('${task.id}')"
                aria-label="${task.timerRunning ? "Pause timer" : "Start timer"}"
                ${task.completed || task.timerFinished ? "disabled" : ""}
            >
                ${task.timerRunning ? PAUSE_ICON_SVG : PLAY_ICON_SVG}
            </button>
        `;
    }

    item.innerHTML = `

        <button
            class="task-check-button"
            onclick="toggleTaskDone('${task.id}')"
            aria-label="Complete task"
        >
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M6 12.5L10 16.5L18 8"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </button>

        <div class="task-info">

            <div class="task-name">
                ${escapeHTML(task.text)}
            </div>

            <div class="task-meta">

                <span class="task-priority ${priorityClass}">
                    ${escapeHTML(task.priority)}
                </span>

                ${
                    task.focusTime
                        ? `<span class="task-focus-label">
                            ${task.focusTime} min focus
                           </span>`
                        : ""
                }

                ${
                    task.breakTime
                        ? `<span class="task-focus-label">
                            ${task.breakTime} min break
                           </span>`
                        : ""
                }

            </div>

        </div>

        ${timerHTML}

        <button
            class="task-delete-btn"
            onclick="deleteTask('${task.id}')"
            aria-label="Delete task"
        >
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M4 7H20"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
                <path
                    d="M9 7V5H15V7"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
                <path
                    d="M7 7L8 20H16L17 7"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
                <path
                    d="M10 11V16M14 11V16"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        </button>
    `;

    return item;
}

function loadTasks(targetTaskId = null) {

    if (!isTasksPage()) return;

    const container =
        document.getElementById("tasksListContainer");

    const empty =
        document.getElementById("emptyTasksState");

    const countText =
        document.getElementById("tasksCountText");

    if (!container) return;

    let visibleTasks = tasks.filter(task => {

        if (currentFilter === "All") return true;

        if (currentFilter === "Completed") return task.completed === true;

        return task.priority === currentFilter;
    });

    /*
     * Search from Home:
     * selected task goes FIRST.
     */
    if (targetTaskId) {

        const targetIndex =
            visibleTasks.findIndex(
                task => task.id === targetTaskId
            );

        if (targetIndex > -1) {

            const targetTask =
                visibleTasks.splice(targetIndex, 1)[0];

            visibleTasks.unshift(targetTask);
        }
    }

    container.innerHTML = "";

    if (countText) {
        countText.textContent =
            `${visibleTasks.length} ${
                visibleTasks.length === 1
                    ? "task"
                    : "tasks"
            }`;
    }

    if (!visibleTasks.length) {

        if (empty) {
            empty.classList.add("active");
        }

        return;

    } else {

        if (empty) {
            empty.classList.remove("active");
        }
    }

    visibleTasks.forEach(task => {

        const item = buildTaskItemElement(task, targetTaskId);

        container.appendChild(item);
    });

    updateAllTaskTimerButtons();

    if (targetTaskId) {

        setTimeout(() => {

            const target =
                container.querySelector(
                    `[data-task-id="${targetTaskId}"]`
                );

            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }

        }, 100);
    }
}


/* =========================================================
   TIMER
========================================================= */

function getTaskRemainingSeconds(task) {

    if (!task) return 0;

    if (
        task.timerRunning &&
        task.timerEndAt
    ) {
        return Math.max(
            0,
            Math.ceil(
                (task.timerEndAt - Date.now()) / 1000
            )
        );
    }

    if (task.timerFinished) {
        return 0;
    }

    if (
        task.pausedRemaining !== null &&
        task.pausedRemaining !== undefined
    ) {
        return task.pausedRemaining;
    }

    if (
        task.focusTime &&
        task.focusTime > 0
    ) {
        return task.focusTime * 60;
    }

    return 0;
}


function startGlobalTimerUpdater() {

    if (globalTimerInterval) return;

    globalTimerInterval =
        setInterval(() => {

            updateAllTaskTimers();

        }, 250);
}


function stopGlobalTimerUpdaterIfUnused() {

    const running =
        tasks.some(
            task =>
                task.timerRunning &&
                task.timerEndAt
        );

    if (!running && globalTimerInterval) {

        clearInterval(globalTimerInterval);

        globalTimerInterval = null;
    }
}


function updateAllTaskTimers() {

    let changed = false;

    tasks.forEach(task => {

        if (
            !task.timerRunning ||
            !task.timerEndAt
        ) {
            return;
        }

        const remaining =
            getTaskRemainingSeconds(task);

        if (remaining <= 0) {

            task.timerRunning = false;
            task.timerEndAt = null;
            task.timerFinished = true;
            task.pausedRemaining = null;

            changed = true;

            /*
             * Show failure animation ONLY ONCE.
             */
            if (!task.timerNotified && !task.completed) {

                task.timerNotified = true;

                showTaskResultAnimation(
                    "failure",
                    task
                );
            }
        }
    });

    if (changed) {
        saveTasks();
    }

    updateAllTaskTimerButtons();
    updateOpenTimerDisplay();

    stopGlobalTimerUpdaterIfUnused();
}


function updateAllTaskTimerButtons() {

    tasks.forEach(task => {

        const item =
            document.querySelector(
                `.task-item[data-task-id="${task.id}"]`
            );

        if (!item) return;

        const button =
            item.querySelector(".task-timer-btn");

        if (button) {

            const remaining =
                getTaskRemainingSeconds(task);

            button.textContent =
                formatSeconds(remaining);

            button.classList.toggle(
                "timer-running",
                Boolean(task.timerRunning)
            );

            button.classList.toggle(
                "timer-finished",
                Boolean(task.timerFinished)
            );
        }

        const toggleButton =
            item.querySelector(".task-timer-toggle-btn");

        if (toggleButton) {

            toggleButton.innerHTML =
                task.timerRunning
                    ? PAUSE_ICON_SVG
                    : PLAY_ICON_SVG;

            toggleButton.disabled =
                Boolean(task.completed || task.timerFinished);
        }
    });
}


/* =========================================================
   TIMER TOGGLE BUTTON
   Starts / pauses the countdown by hand.
   Does nothing else.
========================================================= */

function toggleTaskTimerRunning(taskId) {

    const task =
        tasks.find(
            item => item.id === taskId
        );

    if (
        !task ||
        task.completed ||
        task.timerFinished ||
        !task.focusTime
    ) {
        return;
    }

    if (task.timerRunning) {

        /*
         * PAUSE: freeze the remaining time.
         */
        const remaining =
            getTaskRemainingSeconds(task);

        task.timerRunning = false;
        task.timerEndAt = null;
        task.pausedRemaining = remaining;

    } else {

        /*
         * RESUME / START from where it left off.
         */
        const remaining =
            task.pausedRemaining !== null &&
            task.pausedRemaining !== undefined
                ? task.pausedRemaining
                : task.focusTime * 60;

        task.timerRunning = true;
        task.timerEndAt = Date.now() + remaining * 1000;
        task.pausedRemaining = null;

        startGlobalTimerUpdater();
    }

    saveTasks();

    updateAllTaskTimerButtons();

    if (activeTimerTaskId === taskId) {
        updateOpenTimerDisplay();
    }
}


/* =========================================================
   TIMER BUTTON
   Clicking it only OPENS the timer.
   It does NOT start/restart it.
========================================================= */

function handleTimerButtonClick(taskId) {

    const task =
        tasks.find(
            item => item.id === taskId
        );

    if (!task) return;

    openFocusTimer(taskId);
}


function openFocusTimer(taskId) {

    const task =
        tasks.find(
            item => item.id === taskId
        );

    if (!task) return;

    activeTimerTaskId = taskId;

    const modal =
        document.getElementById("focusTimerModal");

    const title =
        document.getElementById("timerTaskTitle");

    const status =
        document.getElementById("timerStatusText");

    if (title) {
        title.textContent = task.text;
    }

    if (status) {

        if (task.completed) {
            status.textContent = "Task completed.";
        } else if (task.timerFinished) {
            status.textContent = "Time is up.";
        } else if (!task.timerRunning) {
            status.textContent = "Timer is paused.";
        } else {
            status.textContent =
                "Your timer is running automatically.";
        }
    }

    if (modal) {
        modal.classList.add("active");
    }

    updateOpenTimerDisplay();
}


function updateOpenTimerDisplay() {

    if (!activeTimerTaskId) return;

    const task =
        tasks.find(
            item => item.id === activeTimerTaskId
        );

    if (!task) return;

    const display =
        document.getElementById("timerDisplay");

    const status =
        document.getElementById("timerStatusText");

    if (display) {

        display.textContent =
            formatSeconds(
                getTaskRemainingSeconds(task)
            );
    }

    if (status) {

        if (task.completed) {
            status.textContent =
                "Task completed.";
        } else if (task.timerFinished) {
            status.textContent =
                "Time is up.";
        } else if (!task.timerRunning) {
            status.textContent =
                "Timer is paused.";
        } else {
            status.textContent =
                "Your timer is running automatically.";
        }
    }
}


function closeFocusTimer() {

    const modal =
        document.getElementById("focusTimerModal");

    if (modal) {
        modal.classList.remove("active");
    }

    activeTimerTaskId = null;
}


/* =========================================================
   DONE
   Stops timer immediately.
   Shows success.
   Starts break afterwards.
========================================================= */

function toggleTaskDone(taskId) {

    const task =
        tasks.find(
            item => item.id === taskId
        );

    if (!task) return;

    /*
     * Already completed:
     * do nothing.
     */
    if (task.completed) return;

    task.completed = true;

    /*
     * STOP TIMER IMMEDIATELY.
     */
    task.timerRunning = false;
    task.timerEndAt = null;
    task.pausedRemaining = null;

    saveTasks();

    if (activeTimerTaskId === taskId) {
        closeFocusTimer();
    }

    updateAllTaskTimerButtons();

    refreshVideoPinnedTaskIfNeeded(taskId);

    showTaskResultAnimation(
        "success",
        task,
        () => {

            loadTasks();

            if (
                task.breakTime &&
                task.breakTime > 0
            ) {
                startBreak(task.breakTime);
            }
        }
    );
}


/* =========================================================
   SUCCESS / FAILURE
========================================================= */

function showTaskResultAnimation(
    type,
    task,
    callback = null
) {

    const overlay =
        document.getElementById("taskResultOverlay");

    const circle =
        document.getElementById("taskResultCircle");

    const title =
        document.getElementById("taskResultTitle");

    const subtitle =
        document.getElementById("taskResultSubtitle");

    const svg =
        document.getElementById("taskResultSvg");

    const path =
        document.getElementById("taskResultPath");

    if (
        !overlay ||
        !circle ||
        !title ||
        !subtitle ||
        !svg ||
        !path
    ) {
        if (callback) callback();
        return;
    }

    circle.classList.remove(
        "success",
        "failure"
    );

    if (type === "success") {

        circle.classList.add("success");

        title.textContent =
            "Task Complete!";

        subtitle.textContent =
            "Great job. Keep going.";

        svg.setAttribute(
            "viewBox",
            "0 0 64 64"
        );

        path.setAttribute(
            "d",
            "M18 33L27 42L47 21"
        );

        /*
         * Confetti.
         */
        if (typeof confetti === "function") {

            setTimeout(() => {

                confetti({
                    particleCount: 170,
                    spread: 100,
                    startVelocity: 38,
                    origin: {
                        x: 0.5,
                        y: 0.52
                    }
                });

            }, 120);

            setTimeout(() => {

                confetti({
                    particleCount: 90,
                    spread: 65,
                    startVelocity: 30,
                    origin: {
                        x: 0.2,
                        y: 0.6
                    }
                });

                confetti({
                    particleCount: 90,
                    spread: 65,
                    startVelocity: 30,
                    origin: {
                        x: 0.8,
                        y: 0.6
                    }
                });

            }, 350);
        }

    } else {

        circle.classList.add("failure");

        title.textContent =
            "Time's Up";

        subtitle.textContent =
            "The focus time ended before you finished.";

        path.setAttribute(
            "d",
            "M20 20L44 44M44 20L20 44"
        );
    }

    /*
     * Restart animation.
     */
    const animation =
        circle.animate(
            [
                {
                    transform: "scale(.2)",
                    opacity: 0
                },
                {
                    transform: "scale(1.12)",
                    opacity: 1
                },
                {
                    transform: "scale(1)",
                    opacity: 1
                }
            ],
            {
                duration: 650,
                easing: "cubic-bezier(.17,.89,.32,1.4)"
            }
        );

    overlay.classList.add("active");

    const duration =
        type === "success"
            ? 1900
            : 1700;

    setTimeout(() => {

        overlay.classList.remove("active");

        if (callback) {
            callback();
        }

    }, duration);
}


/* =========================================================
   BREAK TIMER
========================================================= */

function startBreak(minutes) {

    const overlay =
        document.getElementById("breakOverlay");

    const display =
        document.getElementById("breakDisplay");

    if (!overlay || !display) return;

    breakSeconds =
        Math.max(
            1,
            Math.round(Number(minutes) * 60)
        );

    overlay.classList.add("active");

    updateBreakDisplay();

    clearInterval(breakInterval);

    breakInterval =
        setInterval(() => {

            breakSeconds--;

            updateBreakDisplay();

            if (breakSeconds <= 0) {

                finishBreak();

            }

        }, 1000);
}


function updateBreakDisplay() {

    const display =
        document.getElementById("breakDisplay");

    if (display) {
        display.textContent =
            formatSeconds(breakSeconds);
    }
}


function finishBreak() {

    clearInterval(breakInterval);

    breakInterval = null;
    breakSeconds = 0;

    const overlay =
        document.getElementById("breakOverlay");

    if (overlay) {
        overlay.classList.remove("active");
    }
}


function skipBreak() {

    finishBreak();
}


/* =========================================================
   DELETE
========================================================= */

function deleteTask(taskId) {

    const task =
        tasks.find(
            item => item.id === taskId
        );

    if (!task) return;

    const confirmed =
        confirm(
            `Delete "${task.text}"?`
        );

    if (!confirmed) return;

    if (activeTimerTaskId === taskId) {
        closeFocusTimer();
    }

    tasks =
        tasks.filter(
            item => item.id !== taskId
        );

    saveTasks();

    loadTasks();

    refreshVideoPinnedTaskIfNeeded(taskId);

    stopGlobalTimerUpdaterIfUnused();
}


function deleteAllTasks() {

    if (!tasks.length) {
        alert("There are no tasks to delete.");
        return;
    }

    const confirmed =
        confirm(
            "Delete ALL tasks?\n\nThis cannot be undone."
        );

    if (!confirmed) return;

    closeFocusTimer();
    skipBreak();

    tasks = [];

    saveTasks();

    loadTasks();

    clearVideoActiveTask();

    stopGlobalTimerUpdaterIfUnused();
}


/* =========================================================
   FILTERS
========================================================= */

function filterTasksByCategory(category) {

    currentFilter = category;

    document
        .querySelectorAll(".filter-item")
        .forEach(button => {
            button.classList.remove("active");
        });

    const buttons =
        document.querySelectorAll(".filter-item");

    buttons.forEach(button => {

        if (
            button.textContent
                .trim()
                .toLowerCase()
                .startsWith(
                    category === "All"
                        ? "all"
                        : category.toLowerCase()
                )
        ) {
            button.classList.add("active");
        }
    });

    const title =
        document.getElementById("tasksPageTitle");

    if (title) {

        title.textContent =
            category === "All"
                ? "My Tasks"
                : category + " Tasks";
    }

    loadTasks();

    if (window.innerWidth <= 800) {

        const sidebar =
            document.getElementById("sidebar");

        if (sidebar) {
            sidebar.classList.remove("open");
        }
    }
}


/* =========================================================
   TASK SEARCH (shared by the home hero search
   AND the header nav search)
========================================================= */

function setupTaskSearchInput(inputId, suggestionsId) {

    const input =
        document.getElementById(inputId);

    const suggestions =
        document.getElementById(suggestionsId);

    if (!input || !suggestions) return;

    input.addEventListener(
        "input",
        function () {

            const query =
                this.value
                    .trim()
                    .toLowerCase();

            suggestions.innerHTML = "";

            if (query.length < 2) {

                suggestions.classList.remove("active");

                return;
            }

            const allTasks =
                getTasks();

            const matches =
                allTasks
                    .filter(task =>
                        String(task.text)
                            .toLowerCase()
                            .includes(query)
                    )
                    .slice(0, 7);

            if (!matches.length) {

                suggestions.innerHTML = `
                    <div class="home-search-result">
                        <div class="home-search-result-icon">
                            <svg viewBox="0 0 24 24" fill="none">
                                <circle cx="11" cy="11" r="6.5"
                                    stroke="currentColor"
                                    stroke-width="1.7"/>
                                <path d="M16 16L21 21"
                                    stroke="currentColor"
                                    stroke-width="1.7"
                                    stroke-linecap="round"/>
                            </svg>
                        </div>
                        <div class="home-search-result-text">
                            <strong>No matching tasks</strong>
                            <small>Try another search</small>
                        </div>
                    </div>
                `;

                suggestions.classList.add("active");

                return;
            }

            matches.forEach(task => {

                const result =
                    document.createElement("button");

                result.type = "button";

                result.className =
                    "home-search-result";

                result.innerHTML = `

                    <div class="home-search-result-icon">
                        <svg viewBox="0 0 24 24" fill="none">
                            <rect x="5" y="3" width="14" height="18" rx="3"
                                stroke="currentColor"
                                stroke-width="1.6"/>
                            <path d="M8 9L10 11L13 8"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"
                                stroke-linejoin="round"/>
                            <path d="M8 15H16"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"/>
                        </svg>
                    </div>

                    <div class="home-search-result-text">
                        <strong>
                            ${escapeHTML(task.text)}
                        </strong>
                        <small>
                            ${escapeHTML(task.priority || "Normal")}
                        </small>
                    </div>
                `;

                result.addEventListener(
                    "click",
                    () => {

                        const targetHref =
                            isTasksPage()
                                ? "?taskId=" + encodeURIComponent(task.id)
                                : "pages/tasks.html?taskId=" + encodeURIComponent(task.id);

                        window.location.href = targetHref;

                    }
                );

                suggestions.appendChild(result);
            });

            suggestions.classList.add("active");
        }
    );

    document.addEventListener(
        "click",
        event => {

            if (
                !event.target.closest(`#${inputId}`) &&
                !event.target.closest(`#${suggestionsId}`)
            ) {
                suggestions.classList.remove(
                    "active"
                );
            }
        }
    );
}


/* =========================================================
   TASK PAGE SEARCH
========================================================= */

function searchTasksOnPage(value) {

    const query =
        String(value || "")
            .trim()
            .toLowerCase();

    document
        .querySelectorAll(".task-item")
        .forEach(item => {

            const name =
                item
                    .querySelector(".task-name")
                    ?.textContent
                    .toLowerCase() || "";

            item.style.display =
                !query ||
                name.includes(query)
                    ? ""
                    : "none";
        });
}


/* =========================================================
   HOME -> TASKS TARGET
========================================================= */

function loadTargetTaskFromURL() {

    if (!isTasksPage()) return;

    const params =
        new URLSearchParams(
            window.location.search
        );

    const taskId =
        params.get("taskId");

    if (!taskId) {
        loadTasks();
        return;
    }

    loadTasks(taskId);
}


/* =========================================================
   BACKGROUNDS
   Four built-in wallpapers, plus an "Add" tile so the person
   can upload as many of their own background photos as they
   like. Custom photos are kept in IndexedDB (falls back to a
   session-only in-memory list if that isn't available) and
   the gallery scrolls so every background stays reachable no
   matter how many have been added.
========================================================= */

const BACKGROUND_THEMES = {

    aurora: {
        label: "Aurora",
        file: "images/backgrounds/aurora.jpg"
    },

    nebula: {
        label: "Nebula",
        file: "images/backgrounds/nebula.jpg"
    },

    sunset: {
        label: "Sunset",
        file: "images/backgrounds/sunset.jpg"
    },

    ocean: {
        label: "Ocean",
        file: "images/backgrounds/ocean.jpg"
    },

    forest: {
        label: "Forest",
        file: "images/backgrounds/forest.jpeg"
    },

    cosmic: {
        label: "Cosmic",
        file: "images/backgrounds/cosmic.jpeg"
    },

    ember: {
        label: "Ember",
        file: "images/backgrounds/ember.jpeg"
    },

    arctic: {
        label: "Arctic",
        file: "images/backgrounds/arctic.jpeg"
    }
};

const BG_DB_NAME = "focusLabAssetsDB";
const BG_DB_VERSION = 1;
const BG_STORE = "customBackgrounds";

let bgDBPromise = null;
let bgDBFailed = false;
let inMemoryBackgrounds = [];
let currentCustomBgObjectURL = null;
let customBgThumbnailURLs = [];

function openBackgroundsDB() {

    if (bgDBFailed) return Promise.reject(new Error("IndexedDB unavailable"));

    if (bgDBPromise) return bgDBPromise;

    bgDBPromise = new Promise((resolve, reject) => {

        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB not supported"));
            return;
        }

        const request = indexedDB.open(BG_DB_NAME, BG_DB_VERSION);

        request.onupgradeneeded = event => {

            const db = event.target.result;

            if (!db.objectStoreNames.contains(BG_STORE)) {
                db.createObjectStore(BG_STORE, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB blocked"));
    });

    bgDBPromise.catch(() => {
        bgDBFailed = true;
        bgDBPromise = null;
    });

    return bgDBPromise;
}

/*
 * These four helpers are the ones every other background
 * function calls. Each one tries IndexedDB first and — if
 * that ever fails, for any reason — quietly switches to a
 * plain in-memory list for the rest of the session instead
 * of doing nothing. That keeps "Add" always working, even in
 * a browser/context where IndexedDB isn't available.
 */

async function bgAddCustom(file) {

    const id = createTaskId();
    const record = { id, name: file.name, blob: file, addedAt: Date.now() };

    if (!bgDBFailed) {

        try {

            const db = await openBackgroundsDB();

            await new Promise((resolve, reject) => {
                const tx = db.transaction(BG_STORE, "readwrite");
                tx.objectStore(BG_STORE).put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

            return id;

        } catch {
            bgDBFailed = true;
        }
    }

    inMemoryBackgrounds.push(record);

    return id;
}

async function bgGetAll() {

    if (!bgDBFailed) {

        try {

            const db = await openBackgroundsDB();

            const list = await new Promise((resolve, reject) => {
                const tx = db.transaction(BG_STORE, "readonly");
                const request = tx.objectStore(BG_STORE).getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });

            return list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

        } catch {
            bgDBFailed = true;
        }
    }

    return [...inMemoryBackgrounds].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

async function bgGetBlob(id) {

    if (!bgDBFailed) {

        try {

            const db = await openBackgroundsDB();

            const blob = await new Promise((resolve, reject) => {
                const tx = db.transaction(BG_STORE, "readonly");
                const request = tx.objectStore(BG_STORE).get(id);
                request.onsuccess = () => resolve(request.result ? request.result.blob : null);
                request.onerror = () => reject(request.error);
            });

            if (blob) return blob;

        } catch {
            bgDBFailed = true;
        }
    }

    const found = inMemoryBackgrounds.find(item => item.id === id);

    return found ? found.blob : null;
}

async function bgDeleteCustom(id) {

    if (!bgDBFailed) {

        try {

            const db = await openBackgroundsDB();

            await new Promise((resolve, reject) => {
                const tx = db.transaction(BG_STORE, "readwrite");
                tx.objectStore(BG_STORE).delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

        } catch {
            bgDBFailed = true;
        }
    }

    inMemoryBackgrounds = inMemoryBackgrounds.filter(item => item.id !== id);
}

function revokeCustomBgThumbnailURLs() {
    customBgThumbnailURLs.forEach(url => URL.revokeObjectURL(url));
    customBgThumbnailURLs = [];
}

function triggerBackgroundUpload() {

    const input = document.getElementById("backgroundFileInput");

    if (input) input.click();
}

async function handleBackgroundFileSelected(event) {

    const files = Array.from(event.target.files || []);

    event.target.value = "";

    if (!files.length) return;

    const validFiles = files.filter(file => file.type.startsWith("image/"));
    const rejectedCount = files.length - validFiles.length;

    for (const file of validFiles) {
        await bgAddCustom(file);
    }

    await renderBackgroundGrid();

    if (rejectedCount > 0) {
        alert(`${rejectedCount} file(s) were skipped — please choose image files.`);
    }
}

async function removeCustomBackground(id, event) {

    if (event) event.stopPropagation();

    const confirmed = confirm("Delete this background?");

    if (!confirmed) return;

    await bgDeleteCustom(id);

    if (localStorage.getItem("focusLab_bgTheme") === `custom:${id}`) {
        localStorage.removeItem("focusLab_bgTheme");
        await applyBackground("aurora");
    }

    await renderBackgroundGrid();
}

/*
 * Rebuilds the whole background gallery: the 4 built-in
 * wallpapers, then every custom photo the person has added,
 * then the "Add" tile. The grid itself scrolls (see main.css)
 * so the list stays reachable no matter how long it gets.
 */
async function renderBackgroundGrid() {

    const grid = document.getElementById("backgroundGrid");

    if (!grid) return;

    const builtInHtml =
        Object.entries(BACKGROUND_THEMES)
            .map(([key, theme]) => `
                <button class="background-option theme-option" data-theme="${key}"
                        onclick="changeBackground('${key}')" aria-label="${theme.label} background">
                    <img src="${getAssetPath(theme.file)}" alt="${theme.label} background">
                </button>
            `)
            .join("");

    const customBackgrounds = await bgGetAll();

    revokeCustomBgThumbnailURLs();

    const customHtml =
        customBackgrounds
            .map(bg => {

                const url = URL.createObjectURL(bg.blob);

                customBgThumbnailURLs.push(url);

                return `
                    <div class="background-option-wrapper">
                        <button class="background-option theme-option" data-theme="custom:${bg.id}"
                                onclick="changeBackground('custom:${bg.id}')" aria-label="${escapeHTML(bg.name)}">
                            <img src="${url}" alt="${escapeHTML(bg.name)}">
                        </button>
                        <button class="bg-delete-btn" onclick="removeCustomBackground('${bg.id}', event)" aria-label="Delete background">
                            ✕
                        </button>
                    </div>
                `;
            })
            .join("");

    const addTileHtml = `
        <button type="button" class="background-option bg-add-option" onclick="triggerBackgroundUpload()">
            <span class="avatar-add-icon">+</span>
            <span class="avatar-add-label">Add</span>
        </button>
    `;

    grid.innerHTML = builtInHtml + customHtml + addTileHtml;

    markSelectedThemeSwatch(getSavedThemeKey());
}

async function openBackgroundModal() {

    const modal =
        document.getElementById("backgroundModal");

    if (modal) {
        modal.classList.add("active");
    }

    await renderBackgroundGrid();
}

function closeBackgroundModal() {

    const modal =
        document.getElementById("backgroundModal");

    if (modal) {
        modal.classList.remove("active");
    }
}

function getSavedThemeKey() {
    return localStorage.getItem("focusLab_bgTheme") || "aurora";
}

async function changeBackground(themeKey) {

    if (!themeKey) return;

    if (!themeKey.startsWith("custom:") && !BACKGROUND_THEMES[themeKey]) return;

    localStorage.setItem("focusLab_bgTheme", themeKey);

    await applyBackground(themeKey);

    markSelectedThemeSwatch(themeKey);

    closeBackgroundModal();
}

function resetBackground() {

    localStorage.removeItem("focusLab_bgTheme");

    const appScreen =
        document.getElementById("app-screen");

    if (appScreen) {
        appScreen.style.backgroundImage = "none";
        appScreen.style.backgroundColor = "#0f172a";
    }

    if (currentCustomBgObjectURL) {
        URL.revokeObjectURL(currentCustomBgObjectURL);
        currentCustomBgObjectURL = null;
    }

    markSelectedThemeSwatch(null);

    closeBackgroundModal();
}

async function applyBackground(themeKey) {

    const appScreen =
        document.getElementById("app-screen");

    if (!appScreen) return;

    let backgroundUrl = null;

    if (themeKey && themeKey.startsWith("custom:")) {

        const id = themeKey.slice("custom:".length);
        const blob = await bgGetBlob(id);

        if (blob) {

            if (currentCustomBgObjectURL) {
                URL.revokeObjectURL(currentCustomBgObjectURL);
            }

            currentCustomBgObjectURL = URL.createObjectURL(blob);
            backgroundUrl = currentCustomBgObjectURL;
        }
    }

    if (!backgroundUrl) {

        const theme =
            BACKGROUND_THEMES[themeKey] ||
            BACKGROUND_THEMES.aurora;

        backgroundUrl = getAssetPath(theme.file);
    }

    appScreen.style.backgroundImage = `
        linear-gradient(rgba(15,23,42,.55), rgba(15,23,42,.82)),
        url("${backgroundUrl}")
    `;

    appScreen.style.backgroundColor = "#0f172a";
}

function markSelectedThemeSwatch(themeKey) {

    document
        .querySelectorAll(".theme-option")
        .forEach(button => {

            button.classList.toggle(
                "selected",
                Boolean(themeKey) && button.dataset.theme === themeKey
            );
        });
}

function loadSavedBackground() {

    const savedTheme =
        localStorage.getItem("focusLab_bgTheme");

    if (savedTheme) {
        applyBackground(savedTheme);
    }
}


/* =========================================================
   MUSIC — lives inside the burger sidebar.
   Opening it hides the sidebar and shows the panel
   in the exact same place; closing it brings the
   sidebar back. Accepts MP3 and MP4 audio files.

   Storage: tracks are kept in IndexedDB first — built for
   large binary data, so a real library (hundreds of songs)
   fits comfortably and survives page changes and restarts.
   If IndexedDB genuinely isn't usable in this browser/
   context, it automatically falls back to localStorage
   instead (the same reliable mechanism the rest of this site
   uses), so "Add Music" never silently fails — that fallback
   just holds fewer songs, since a whole song has to fit in
   the browser's small localStorage quota instead of a
   database built for this.
========================================================= */

const ACCEPTED_MUSIC_EXTENSIONS = [".mp3", ".mp4"];

const MUSIC_DB_NAME = "focusLabMusicDB";
const MUSIC_DB_VERSION = 1;
const MUSIC_META_STORE = "trackMeta";
const MUSIC_BLOB_STORE = "trackBlobs";

let currentMusicObjectURL = null;
let musicDBPromise = null;
let musicDBFailed = false;

function openMusicDB() {

    if (musicDBFailed) return Promise.reject(new Error("IndexedDB unavailable"));

    if (musicDBPromise) return musicDBPromise;

    musicDBPromise = new Promise((resolve, reject) => {

        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB not supported"));
            return;
        }

        const request =
            indexedDB.open(MUSIC_DB_NAME, MUSIC_DB_VERSION);

        request.onupgradeneeded = event => {

            const db = event.target.result;

            if (!db.objectStoreNames.contains(MUSIC_META_STORE)) {
                db.createObjectStore(MUSIC_META_STORE, { keyPath: "id" });
            }

            if (!db.objectStoreNames.contains(MUSIC_BLOB_STORE)) {
                db.createObjectStore(MUSIC_BLOB_STORE, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB blocked"));
    });

    /*
     * If opening the database ever fails, don't keep re-using
     * this same failed promise forever — mark it unavailable
     * so every helper below falls back to localStorage instead
     * for the rest of this page's lifetime.
     */
    musicDBPromise.catch(() => {
        musicDBFailed = true;
        musicDBPromise = null;
    });

    return musicDBPromise;
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function dataURLToBlob(dataUrl) {

    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "audio/mpeg";

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
}

function getMusicFallbackList() {
    try {
        const stored = localStorage.getItem("focusLab_musicFallbackList");
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveMusicFallbackList(list) {
    localStorage.setItem("focusLab_musicFallbackList", JSON.stringify(list));
}

/*
 * These four helpers are the ones the rest of the music
 * player calls. Each tries IndexedDB first (large capacity,
 * survives reloads/navigation) and — only if that genuinely
 * isn't usable — falls back to localStorage instead, which
 * still persists, just with far less room.
 */

async function musicAddTrack(meta, blob) {

    if (!musicDBFailed) {

        try {

            const db = await openMusicDB();

            await new Promise((resolve, reject) => {

                const tx = db.transaction(
                    [MUSIC_META_STORE, MUSIC_BLOB_STORE],
                    "readwrite"
                );

                tx.objectStore(MUSIC_META_STORE).put(meta);
                tx.objectStore(MUSIC_BLOB_STORE).put({ id: meta.id, blob });

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

            return;

        } catch {
            musicDBFailed = true;
        }
    }

    try {

        const dataUrl = await blobToDataURL(blob);
        const list = getMusicFallbackList();

        list.push({ id: meta.id, name: meta.name, addedAt: meta.addedAt, dataUrl });

        saveMusicFallbackList(list);

    } catch {

        alert(`"${meta.name}" couldn't be saved permanently — your browser's storage is full. Try removing a song first, or use a smaller/fewer files.`);
    }
}

async function musicGetAllMeta() {

    if (!musicDBFailed) {

        try {

            const db = await openMusicDB();

            const list = await new Promise((resolve, reject) => {

                const tx = db.transaction(MUSIC_META_STORE, "readonly");
                const request = tx.objectStore(MUSIC_META_STORE).getAll();

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });

            return list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

        } catch {
            musicDBFailed = true;
        }
    }

    return getMusicFallbackList()
        .map(track => ({ id: track.id, name: track.name, addedAt: track.addedAt }))
        .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

async function musicGetBlob(trackId) {

    if (!musicDBFailed) {

        try {

            const db = await openMusicDB();

            const blob = await new Promise((resolve, reject) => {

                const tx = db.transaction(MUSIC_BLOB_STORE, "readonly");
                const request = tx.objectStore(MUSIC_BLOB_STORE).get(trackId);

                request.onsuccess = () =>
                    resolve(request.result ? request.result.blob : null);

                request.onerror = () => reject(request.error);
            });

            if (blob) return blob;

        } catch {
            musicDBFailed = true;
        }
    }

    const fallbackTrack = getMusicFallbackList().find(track => track.id === trackId);

    return fallbackTrack ? dataURLToBlob(fallbackTrack.dataUrl) : null;
}

async function musicDeleteTrack(trackId) {

    if (!musicDBFailed) {

        try {

            const db = await openMusicDB();

            await new Promise((resolve, reject) => {

                const tx = db.transaction(
                    [MUSIC_META_STORE, MUSIC_BLOB_STORE],
                    "readwrite"
                );

                tx.objectStore(MUSIC_META_STORE).delete(trackId);
                tx.objectStore(MUSIC_BLOB_STORE).delete(trackId);

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

        } catch {
            musicDBFailed = true;
        }
    }

    const fallbackList = getMusicFallbackList();
    const filteredFallback = fallbackList.filter(track => track.id !== trackId);

    if (filteredFallback.length !== fallbackList.length) {
        saveMusicFallbackList(filteredFallback);
    }
}


function getMusicManifest() {
    return typeof MUSIC_MANIFEST !== "undefined" && Array.isArray(MUSIC_MANIFEST)
        ? MUSIC_MANIFEST
        : [];
}

function getMusicAssetPath(file) {
    return isInPagesFolder() ? "../music/" + file : "music/" + file;
}

/*
 * Combines the owner-managed permanent songs (music/manifest.js)
 * with whatever the visitor has added themselves, so both show
 * up together in one list. Permanent songs always come first and
 * can't be deleted from the site — only uploaded ones can.
 */
async function getMergedMusicList() {

    const permanentTracks = getMusicManifest().map(entry => ({
        id: "permanent:" + encodeURIComponent(entry.file),
        name: entry.name,
        permanent: true
    }));

    const uploadedTracks = (await musicGetAllMeta())
        .map(track => ({ ...track, permanent: false }));

    return permanentTracks.concat(uploadedTracks);
}

function toggleMusicPanel() {

    const panel =
        document.getElementById("musicSidebarPanel");

    if (!panel) return;

    if (panel.classList.contains("active")) {
        closeMusicSidebarPanel();
        return;
    }

    const sidebar =
        document.getElementById("sidebar");

    if (sidebar) {
        sidebar.classList.add("panel-hidden");
    }

    panel.classList.remove("panel-hidden");
    panel.classList.add("active");

    renderMusicList();
}

function closeMusicSidebarPanel() {

    const sidebar =
        document.getElementById("sidebar");

    const panel =
        document.getElementById("musicSidebarPanel");

    if (panel) {
        panel.classList.remove("active");
        panel.classList.add("panel-hidden");
    }

    if (sidebar) {
        sidebar.classList.remove("panel-hidden");
    }
}

function triggerAddMusic() {

    const fileInput =
        document.getElementById("musicFileInput");

    if (fileInput) {
        fileInput.click();
    }
}

function isAcceptedMusicFile(file) {

    const name = (file.name || "").toLowerCase();

    const hasAcceptedExtension =
        ACCEPTED_MUSIC_EXTENSIONS.some(ext => name.endsWith(ext));

    const hasAcceptedType =
        file.type === "audio/mpeg" ||
        file.type === "audio/mp3" ||
        file.type === "video/mp4" ||
        file.type === "audio/mp4";

    return hasAcceptedExtension || hasAcceptedType;
}

/*
 * Accepts one, a few, or well over a thousand files at once
 * (the file input has the "multiple" attribute) and stores
 * every valid MP3/MP4 straight into IndexedDB as a Blob —
 * no size-limited base64 copy, no cap on how many songs the
 * playlist can hold.
 */
async function handleMusicFileSelected(event) {

    const files = Array.from(event.target.files || []);

    event.target.value = "";

    if (!files.length) return;

    const accepted = files.filter(isAcceptedMusicFile);
    const rejectedCount = files.length - accepted.length;

    if (!accepted.length) {
        alert("Please choose MP3 or MP4 audio files.");
        return;
    }

    let firstNewTrackId = null;
    let addedAt = Date.now();

    for (const file of accepted) {

        const id = createTaskId();

        await musicAddTrack(
            { id, name: file.name, addedAt: addedAt++ },
            file
        );

        if (!firstNewTrackId) {
            firstNewTrackId = id;
        }
    }

    await renderMusicList();

    if (rejectedCount > 0) {
        alert(`${rejectedCount} file(s) were skipped — only MP3 and MP4 audio files are supported.`);
    }

    const isPlaying =
        localStorage.getItem("focusLab_musicPlaying") === "true";

    if (!isPlaying && firstNewTrackId) {
        await playMusicTrack(firstNewTrackId);
    }
}

async function renderMusicList() {

    const container =
        document.getElementById("musicListContainer");

    if (!container) return;

    const list = await getMergedMusicList();

    const currentId =
        localStorage.getItem("focusLab_musicCurrentId");

    const isPlaying =
        localStorage.getItem("focusLab_musicPlaying") === "true";

    if (!list.length) {

        container.innerHTML =
            `<p class="music-empty-text">No music added yet.</p>`;

        return;
    }

    container.innerHTML = `
        <p class="music-hint">${list.length} song${list.length === 1 ? "" : "s"} in your library</p>
    ` +
        list.map(track => {

            const playing =
                track.id === currentId && isPlaying;

            const deleteButtonHTML = track.permanent
                ? ""
                : `
                    <button
                        class="music-item-delete-btn"
                        onclick="deleteMusicItem('${track.id}')"
                        aria-label="Delete track"
                    >
                        ✕
                    </button>
                `;

            return `
                <div class="music-list-item">
                    <button
                        class="music-item-play-btn"
                        onclick="toggleMusicTrack('${track.id}')"
                        aria-label="${playing ? "Pause" : "Play"}"
                    >
                        ${playing ? PAUSE_ICON_SVG : PLAY_ICON_SVG}
                    </button>
                    <span class="music-item-name">
                        ${escapeHTML(track.name)}
                    </span>
                    ${
                        track.permanent
                            ? `<span class="music-item-permanent-badge" title="Always available on this site">Site song</span>`
                            : ""
                    }
                    ${deleteButtonHTML}
                </div>
            `;

        }).join("");
}

async function toggleMusicTrack(trackId) {

    const currentId =
        localStorage.getItem("focusLab_musicCurrentId");

    const isPlaying =
        localStorage.getItem("focusLab_musicPlaying") === "true";

    if (currentId === trackId && isPlaying) {
        pauseMusic();
    } else {
        await playMusicTrack(trackId);
    }

    renderMusicList();
}

async function playMusicTrack(trackId) {

    stopCurrentAudioElement();

    if (trackId.startsWith("permanent:")) {

        const file = decodeURIComponent(trackId.slice("permanent:".length));

        currentMusicAudioEl = new Audio(getMusicAssetPath(file));

    } else {

        const blob = await musicGetBlob(trackId);

        if (!blob) return;

        const url = URL.createObjectURL(blob);

        currentMusicObjectURL = url;
        currentMusicAudioEl = new Audio(url);
    }

    currentMusicAudioEl.loop = true;

    currentMusicAudioEl
        .play()
        .catch(() => {
            /* Autoplay may be blocked until the user interacts. */
        });

    localStorage.setItem("focusLab_musicCurrentId", trackId);
    localStorage.setItem("focusLab_musicPlaying", "true");
    localStorage.setItem("focusLab_musicPosition", "0");
    localStorage.setItem("focusLab_musicStartedAt", String(Date.now()));

    startMusicPositionSaver();
}

function pauseMusic() {

    if (currentMusicAudioEl) {

        localStorage.setItem(
            "focusLab_musicPosition",
            String(currentMusicAudioEl.currentTime || 0)
        );

        currentMusicAudioEl.pause();
    }

    localStorage.setItem("focusLab_musicPlaying", "false");

    stopMusicPositionSaver();
}

function stopMusic() {

    stopCurrentAudioElement();

    localStorage.setItem("focusLab_musicPlaying", "false");
    localStorage.setItem("focusLab_musicPosition", "0");

    stopMusicPositionSaver();

    renderMusicList();
}

function stopCurrentAudioElement() {

    if (currentMusicAudioEl) {

        try {
            currentMusicAudioEl.pause();
        } catch {}

        currentMusicAudioEl = null;
    }

    if (currentMusicObjectURL) {

        URL.revokeObjectURL(currentMusicObjectURL);

        currentMusicObjectURL = null;
    }
}

async function deleteMusicItem(trackId) {

    /* Permanent (site-provided) songs can't be removed from
       the site itself — there's no delete button for them,
       but guard here too in case this is ever called directly. */
    if (trackId.startsWith("permanent:")) return;

    await musicDeleteTrack(trackId);

    const currentId =
        localStorage.getItem("focusLab_musicCurrentId");

    if (currentId === trackId) {
        stopMusic();
        localStorage.removeItem("focusLab_musicCurrentId");
    }

    renderMusicList();
}

function startMusicPositionSaver() {

    if (musicPositionSaveInterval) return;

    musicPositionSaveInterval =
        setInterval(() => {

            if (
                currentMusicAudioEl &&
                !currentMusicAudioEl.paused
            ) {
                localStorage.setItem(
                    "focusLab_musicPosition",
                    String(currentMusicAudioEl.currentTime || 0)
                );

                localStorage.setItem(
                    "focusLab_musicStartedAt",
                    String(Date.now())
                );
            }

        }, 2000);
}

function stopMusicPositionSaver() {

    if (musicPositionSaveInterval) {
        clearInterval(musicPositionSaveInterval);
        musicPositionSaveInterval = null;
    }
}

/*
 * Resumes playback on every page load so the music
 * keeps going across navigation and reloads.
 */
async function initMusicPlayback() {

    const isPlaying =
        localStorage.getItem("focusLab_musicPlaying") === "true";

    if (!isPlaying) return;

    const trackId =
        localStorage.getItem("focusLab_musicCurrentId");

    if (!trackId) return;

    let audioSrc = null;

    if (trackId.startsWith("permanent:")) {

        const file = decodeURIComponent(trackId.slice("permanent:".length));

        audioSrc = getMusicAssetPath(file);

    } else {

        const blob = await musicGetBlob(trackId);

        if (!blob) return;

        audioSrc = URL.createObjectURL(blob);
        currentMusicObjectURL = audioSrc;
    }

    const savedPosition =
        Number(localStorage.getItem("focusLab_musicPosition") || 0);

    const startedAt =
        Number(localStorage.getItem("focusLab_musicStartedAt") || Date.now());

    const elapsed =
        Math.max(0, (Date.now() - startedAt) / 1000);

    let resumeAt = savedPosition + elapsed;

    currentMusicAudioEl = new Audio(audioSrc);
    currentMusicAudioEl.loop = true;

    currentMusicAudioEl.addEventListener(
        "loadedmetadata",
        () => {

            if (
                currentMusicAudioEl.duration &&
                resumeAt >= currentMusicAudioEl.duration
            ) {
                resumeAt = resumeAt % currentMusicAudioEl.duration;
            }

            currentMusicAudioEl.currentTime = resumeAt;

            currentMusicAudioEl
                .play()
                .catch(() => {});
        }
    );

    startMusicPositionSaver();
}


/* =========================================================
   VIDEOS PAGE
   The video library is owner-managed, not visitor-managed:
   there is no upload or delete button on this page. Videos
   come from a YouTube playlist listed in videos/manifest.js
   (Lofi Study, Anime Study, or anything else) — each entry is
   just a YouTube video ID or link. To add a video: add one
   line to that manifest — see that file for the exact format.
   Visitors can only browse, search, and play what's listed
   there. Playback uses YouTube's own IFrame Player API, so
   the usual play/pause/volume/fullscreen controls are
   YouTube's native ones.
========================================================= */

function isVideosPage() {
    return !!document.getElementById("videoGridContainer");
}

function getVideoManifest() {
    return typeof VIDEO_MANIFEST !== "undefined" && Array.isArray(VIDEO_MANIFEST)
        ? VIDEO_MANIFEST
        : [];
}

/*
 * Accepts a bare 11-character YouTube ID, or a full/short
 * YouTube URL in any common form, and returns just the ID —
 * so the manifest can hold whichever is easiest to paste.
 */
function extractYoutubeId(value) {

    const raw = String(value || "").trim();

    if (/^[\w-]{11}$/.test(raw)) {
        return raw;
    }

    const patterns = [
        /youtu\.be\/([\w-]{11})/,
        /youtube\.com\/watch\?v=([\w-]{11})/,
        /youtube\.com\/embed\/([\w-]{11})/,
        /youtube\.com\/shorts\/([\w-]{11})/
    ];

    for (const pattern of patterns) {
        const match = raw.match(pattern);
        if (match) return match[1];
    }

    return raw;
}

function getYoutubeThumbnailURL(youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

const VIDEO_THUMB_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M9 8L16 12L9 16V8Z" fill="currentColor"/>
    </svg>
`;

const FULLSCREEN_ENTER_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 9V5C4 4.45 4.45 4 5 4H9M15 4H19C19.55 4 20 4.45 20 5V9M20 15V19C20 19.55 19.55 20 19 20H15M9 20H5C4.45 20 4 19.55 4 19V15"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;

const FULLSCREEN_EXIT_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M9 4V8C9 8.55 8.55 9 8 9H4M15 4V8C15 8.55 15.45 9 16 9H20M20 15H16C15.45 15 15 15.45 15 16V20M4 15H8C8.55 15 9 15.45 9 16V20"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;

function renderVideoGrid() {

    const container = document.getElementById("videoGridContainer");
    const empty = document.getElementById("emptyVideosState");

    if (!container) return;

    const videos = getVideoManifest();

    if (empty) {
        empty.classList.toggle("active", videos.length === 0);
    }

    container.innerHTML = videos.map(video => {

        const youtubeId = extractYoutubeId(video.youtubeId || video.file || "");

        return `
            <div class="video-card" data-video-name="${escapeHTML(video.name.toLowerCase())}">
                <button class="video-card-thumb" onclick="openVideoPlayer('${youtubeId}', '${escapeHTML(video.name)}')" aria-label="Play ${escapeHTML(video.name)}">
                    <img src="${getYoutubeThumbnailURL(youtubeId)}" alt="${escapeHTML(video.name)}" loading="lazy">
                    <span class="video-card-play-badge">${VIDEO_THUMB_ICON_SVG}</span>
                </button>
                <div class="video-card-info">
                    <span class="video-card-name">${escapeHTML(video.name)}</span>
                </div>
            </div>
        `;
    }).join("");

    searchVideosOnPage(document.getElementById("videoSearchInput")?.value || "");
}

function searchVideosOnPage(value) {

    const query = String(value || "").trim().toLowerCase();

    document
        .querySelectorAll(".video-card[data-video-name]")
        .forEach(card => {

            const name = card.dataset.videoName || "";

            card.style.display =
                !query || name.includes(query) ? "" : "none";
        });
}


/* --- YouTube IFrame Player API --- */

let youtubePlayer = null;
let youtubeApiReady = false;
let youtubeApiLoading = false;
let pendingYoutubeId = null;

/*
 * The YouTube API calls this exact global function name once
 * it has finished loading — it has to live on window.
 */
window.onYouTubeIframeAPIReady = function () {

    youtubeApiReady = true;

    if (pendingYoutubeId) {
        createYoutubePlayer(pendingYoutubeId);
        pendingYoutubeId = null;
    }
};

function loadYoutubeIframeAPI() {

    if (youtubeApiReady || youtubeApiLoading) return;

    youtubeApiLoading = true;

    const script = document.createElement("script");

    script.src = "https://www.youtube.com/iframe_api";

    document.head.appendChild(script);
}

function createYoutubePlayer(youtubeId) {

    const host = document.getElementById("videoPlayerEl");

    if (!host || typeof YT === "undefined" || !YT.Player) return;

    if (youtubePlayer && youtubePlayer.loadVideoById) {

        youtubePlayer.loadVideoById(youtubeId);
        youtubePlayer.playVideo();
        return;
    }

    youtubePlayer = new YT.Player("videoPlayerEl", {

        videoId: youtubeId,

        playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            fs: 0
        },

        events: {
            onReady: event => event.target.playVideo()
        }
    });
}

function openVideoPlayer(youtubeId, name) {

    const modal = document.getElementById("videoPlayerModal");
    const title = document.getElementById("videoPlayerTitle");

    if (!modal) return;

    if (title) {
        title.textContent = name || "";
    }

    modal.classList.add("active");

    if (youtubeApiReady) {
        createYoutubePlayer(youtubeId);
    } else {
        pendingYoutubeId = youtubeId;
        loadYoutubeIframeAPI();
    }

    clearVideoActiveTask();
}

function closeVideoPlayer() {

    const modal = document.getElementById("videoPlayerModal");

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    if (modal) {
        modal.classList.remove("active");
    }

    if (youtubePlayer && youtubePlayer.stopVideo) {
        youtubePlayer.stopVideo();
    }

    pendingYoutubeId = null;

    hideVideoTaskSuggestions();
}


/*
 * Our own full-screen control — used instead of YouTube's
 * built-in one (disabled above via playerVars.fs) so that
 * going full-screen takes the whole .video-player-box with
 * it, task card included. The search bar is hidden while
 * full-screen (see the :fullscreen rule in main.css); the
 * pinned task card is deliberately left alone so it keeps
 * showing on top of the video the whole time.
 */
function toggleVideoFullscreen() {

    const box = document.querySelector(".video-player-overlay .video-player-box");

    if (!box) return;

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else if (box.requestFullscreen) {
        box.requestFullscreen().catch(() => {});
    }
}

document.addEventListener("fullscreenchange", () => {

    const button = document.getElementById("videoFullscreenToggleBtn");

    if (!button) return;

    const isFullscreen = Boolean(document.fullscreenElement);

    button.innerHTML = isFullscreen ? FULLSCREEN_EXIT_ICON_SVG : FULLSCREEN_ENTER_ICON_SVG;
    button.setAttribute("aria-label", isFullscreen ? "Exit full screen" : "Full screen");
});


/* --- "Bring your task into the video" search overlay ---
   Lets the person search their task list from inside the
   full-screen player and pin the one they're working on as
   a small overlay card while they watch. */

let currentVideoTaskId = null;

function handleVideoTaskSearchInput(value) {

    const suggestions = document.getElementById("videoTaskSearchSuggestions");

    if (!suggestions) return;

    const query = String(value || "").trim().toLowerCase();

    suggestions.innerHTML = "";

    if (query.length < 1) {
        suggestions.classList.remove("active");
        return;
    }

    const matches = tasks
        .filter(task => String(task.text).toLowerCase().includes(query))
        .slice(0, 6);

    if (!matches.length) {

        suggestions.innerHTML = `
            <div class="home-search-result">
                <div class="home-search-result-text">
                    <strong>No matching tasks</strong>
                </div>
            </div>
        `;

        suggestions.classList.add("active");

        return;
    }

    suggestions.innerHTML = matches.map(task => `
        <button type="button" class="home-search-result" onclick="selectVideoTask('${task.id}')">
            <div class="home-search-result-text">
                <strong>${escapeHTML(task.text)}</strong>
                <small>${escapeHTML(task.priority || "Normal")}</small>
            </div>
        </button>
    `).join("");

    suggestions.classList.add("active");
}

function selectVideoTask(taskId) {

    const task = tasks.find(item => item.id === taskId);

    if (!task) return;

    currentVideoTaskId = taskId;

    renderVideoActiveTaskCard();

    const input = document.getElementById("videoTaskSearchInput");

    if (input) input.value = "";

    hideVideoTaskSuggestions();
}

/*
 * Renders the pinned task using the exact same row markup as
 * the Tasks page (buildTaskItemElement) — same time display,
 * priority badge, complete button, timer play/pause, and
 * delete button. Because it carries the real data-task-id,
 * the normal update loop (updateAllTaskTimerButtons) keeps its
 * countdown ticking automatically, same as on the Tasks page.
 */
function renderVideoActiveTaskCard() {

    const card = document.getElementById("videoActiveTaskCard");
    const host = document.getElementById("videoActiveTaskItemHost");

    if (!card || !host) return;

    const task = tasks.find(item => item.id === currentVideoTaskId);

    if (!task) {
        clearVideoActiveTask();
        return;
    }

    host.innerHTML = "";
    host.appendChild(buildTaskItemElement(task));

    card.classList.add("active");

    if (task.timerRunning && task.timerEndAt) {
        startGlobalTimerUpdater();
    }
}

/*
 * Called after any task edit (complete / delete / delete all)
 * so the pinned card in the video player never goes stale —
 * it re-renders if the task changed, or clears if it's gone.
 */
function refreshVideoPinnedTaskIfNeeded(taskId) {

    if (currentVideoTaskId !== taskId) return;

    renderVideoActiveTaskCard();
}

function clearVideoActiveTask() {

    currentVideoTaskId = null;

    const card = document.getElementById("videoActiveTaskCard");
    const host = document.getElementById("videoActiveTaskItemHost");

    if (card) card.classList.remove("active");

    if (host) host.innerHTML = "";
}

function hideVideoTaskSuggestions() {

    const suggestions = document.getElementById("videoTaskSearchSuggestions");

    if (suggestions) {
        suggestions.classList.remove("active");
    }
}


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {

            closeAddTaskModal();
            closeBackgroundModal();
            closeFocusTimer();
            closeAvatarEditModal();
            closeVideoPlayer();
        }

        if (
            event.key === "Enter" &&
            document.activeElement?.id ===
                "taskTextInput"
        ) {
            createTask();
        }
    }
);


/* =========================================================
   INIT
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        applyAuthView();

        loadUserInfo();

        tasks = getTasks();

        if (document.getElementById("app-screen")) {
            loadSavedBackground();
        }

        if (isTasksPage()) {

            normalizeTasks();

            loadTargetTaskFromURL();

            if (
                tasks.some(
                    task =>
                        task.timerRunning &&
                        task.timerEndAt
                )
            ) {
                startGlobalTimerUpdater();
            }

            renderMusicList();
        }

        if (isVideosPage()) {
            renderVideoGrid();
        }

        setupTaskSearchInput("homeTaskSearch", "homeTaskSearchSuggestions");
        setupTaskSearchInput("navTaskSearch", "navTaskSearchSuggestions");

        initMusicPlayback();

        /*
         * Close modal by clicking outside.
         */
        document
            .querySelectorAll(".modal-overlay")
            .forEach(modal => {

                modal.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target === modal
                        ) {
                            modal.classList.remove(
                                "active"
                            );
                        }
                    }
                );
            });
    }
);
