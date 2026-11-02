'use strict';

/* ============================================================
   НАСТРОЙКИ И ХЕЛПЕРЫ
============================================================ */
const CONFIG = { 
  // URL твоего Cloudflare Worker для отправки в Telegram
  WORKER_URL: 'https://tg-moderation-bot.zasvetoynet888.workers.dev' 
};

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const store = {
  get(k, fb){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  raw(k, fb){ try { return localStorage.getItem(k) ?? fb; } catch { return fb; } },
  rawSet(k, v){ try { localStorage.setItem(k, v); } catch {} }
};

function toast(msg, type='info'){
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast', 3500);
}

async function sendToTelegram(text, type) {
  if (!CONFIG.WORKER_URL) return { ok: false, reason: 'not_configured' };

  try {
    const res = await fetch(CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: text, 
        type: type // Передаем тип (История или Правило)
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, reason: 'telegram_error' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

/* ============================================================
   ГЕЙМИФИКАЦИЯ (XP, УРОВНИ, СТРИКИ)
============================================================ */
let userXP = store.get('userXP', 0);
let userLevel = store.get('userLevel', 1);
let userStreak = store.get('userStreak', 0);
let lastVisit = store.get('lastVisit', null);
let userAvatar = store.raw('userAvatar', 'https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=transparent');

let firstVisit = store.get('firstVisit', null);
if (!firstVisit) {
  firstVisit = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  store.set('firstVisit', firstVisit);
}

function getXPNeeded(level) {
  return level * 100; // 1 ур -> 100, 2 ур -> 200, 3 ур -> 300 и т.д.
}

function updateProfileUI() {
  if(!$('#userLevel')) return;
  
  const xpNeeded = getXPNeeded(userLevel);
  
  // Обновляем текстовые значения в шапке
  $('#userLevel').textContent = `Ур. ${userLevel}`;
  $('#userXPBar').style.width = (userXP / xpNeeded * 100) + '%';
  $('#userStreak').innerHTML = `<i class="fa-solid fa-fire"></i> ${userStreak}`;
  
  // Обновляем ник в шапке
  const savedName = store.get('userName', 'Игрок') || 'Игрок';
  const headerName = $('#headerUserName');
  if (headerName) headerName.textContent = savedName;

  // Обновляем текстовые значения в модалке
  if($('#pLevel')) $('#pLevel').textContent = userLevel;
  if($('#pXP')) $('#pXP').textContent = `${userXP} / ${xpNeeded}`;
  if($('#pStreak')) $('#pStreak').textContent = userStreak;

  // Дата регистрации
  const joinDateEl = $('#profileJoinDate');
  if (joinDateEl) {
    joinDateEl.textContent = `Твой путь начался ${firstVisit}`;
  }

  // Обновляем мини-достижения в профиле
  renderProfileAchievements();

  // Обновляем аватарку в шапке сайта
  const headerAvatar = $('#userAvatar');
  if (headerAvatar) {
    if (userAvatar.startsWith('data:image') || userAvatar.startsWith('http')) {
      headerAvatar.innerHTML = `<img src="${userAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      headerAvatar.textContent = userAvatar;
    }
  }

  // Обновляем главную аватарку в профиле (большую)
  const mainAvatar = $('#profileMainAvatar');
  if (mainAvatar) {
    if (userAvatar.startsWith('data:image') || userAvatar.startsWith('http')) {
      mainAvatar.innerHTML = `<img src="${userAvatar}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      mainAvatar.textContent = userAvatar;
    }
  }

  // Обновляем круговой прогресс опыта (SVG круг)
  const ring = $('#profileRing');
  if (ring) {
    const circumference = 2 * Math.PI * 46; // 289.02
    const offset = circumference - (userXP / xpNeeded) * circumference;
    ring.style.strokeDashoffset = offset;
  }

  // Обновляем титул в зависимости от уровня
  const titleEl = $('#profileTitle');
  if (titleEl) {
    let title = 'Новичок';
    if (userLevel >= 2) title = 'Искатель';
    if (userLevel >= 5) title = 'Опытный';
    if (userLevel >= 10) title = 'Мастер';
    if (userLevel >= 20) title = 'Легенда';
    titleEl.textContent = title;
  }
  
  // Сохраняем и восстанавливаем имя пользователя в модалке
  const nameInput = $('#userNameInput');
  if (nameInput) {
    const savedNameVal = store.get('userName', '');
    if (nameInput.value === '' && savedNameVal) nameInput.value = savedNameVal;
    
    // Вешаем событие только один раз
    if (!nameInput.dataset.listenerAttached) {
      nameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim() || 'Игрок';
        store.set('userName', val);
        
        // Мгновенно обновляем ник в шапке
        if ($('#headerUserName')) $('#headerUserName').textContent = val;
      });
      nameInput.dataset.listenerAttached = 'true';
    }
  }
}

function renderProfileAchievements() {
  const container = $('#profileAchievements');
  if (!container) return;
  
  const unlocked = store.get('achievements', []);
  const recent = unlocked.slice(-4).reverse(); 
  
  if (recent.length === 0) {
    container.innerHTML = '<div style="font-size: 12px; color: var(--muted); grid-column: 1 / -1; text-align: center;">Пока нет достижений. Начни с теста!</div>';
    return;
  }
  
  container.innerHTML = '';
  recent.forEach(id => {
    const ach = ALL_ACHIEVEMENTS.find(a => a.id === id);
    if (ach) {
      const el = document.createElement('div');
      el.className = 'profile-achieve-item';
      el.setAttribute('data-title', ach.title);
      el.innerHTML = `<i class="fa-solid ${ach.icon}"></i>`;
      container.appendChild(el);
    }
  });
}

function addXP(amount) {
  userXP += amount;
  let leveledUp = false;
  
  let xpNeeded = getXPNeeded(userLevel);
  while (userXP >= xpNeeded) {
    userXP -= xpNeeded;
    userLevel++;
    xpNeeded = getXPNeeded(userLevel);
    leveledUp = true;
  }
  
  store.set('userXP', userXP);
  store.set('userLevel', userLevel);
  updateProfileUI();
  
  if (leveledUp) {
    toast(`Новый уровень: ${userLevel}!`, 'success');
    fireConfetti();
    if (userLevel >= 5) unlockAchievement('level5', 'Опытный', 'Достиг 5 уровня');
    if (userLevel >= 10) unlockAchievement('level10', 'Мастер', 'Достиг 10 уровня');
  }
}

function checkStreak() {
  const today = new Date().toDateString();
  if (lastVisit) {
    const lastDate = new Date(lastVisit);
    const diffTime = Math.abs(new Date(today) - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      userStreak++;
      addXP(10); 
    } else if (diffDays > 1) {
      userStreak = 1; 
    }
  } else {
    userStreak = 1;
  }
  lastVisit = today;
  store.set('userStreak', userStreak);
  store.set('lastVisit', lastVisit);
  updateProfileUI();
  if (userStreak >= 3) unlockAchievement('streak3', 'В ударе', 'Заходил 3 дня подряд');
}

/* ============================================================
   ЦИТАТА ДНЯ
============================================================ */
(function initDailyQuote() {
  const quotes = [
    "Дисциплина — это выбор между тем, что ты хочешь сейчас, и тем, что хочешь больше всего.",
    "Ты не обязан быть идеальным. Ты обязан быть честным с собой.",
    "Маленькие шаги каждый день лучше, чем большой рывок раз в год.",
    "Твое окружение — это твое будущее. Выбирай людей тщательно.",
    "Сон — это не лень. Это инвестиция в твой завтрашний день.",
    "Ошибки — это не провал. Это данные для следующего шага.",
    "Если не ты, то кто? Если не сейчас, то когда?",
    "Не сравнивай свой прогресс с чужим. Ты не знаешь, с чего они начинали.",
    "Тот, кто говорит, что это невозможно, не должен мешать тому, кто это делает.",
    "Твой мозг — это мышца. Если ее не тренировать, она атрофируется.",
    "Умение говорить «нет» — это суперсила. Береги свое время.",
    "Деньги любят счет. Даже 10% от карманных — это уже начало.",
    "Ты станешь тем, о чем ты думаешь чаще всего. Думай о хорошем.",
    "Настоящая сила — это не кулаки, а умение держать себя в руках.",
    "Сегодня — единственный день, который ты можешь изменить.",
    "Не бойся начинать с нуля. В этот раз ты начнешь не с пустого места, а с опытом.",
    "Твое тело — единственное, в чем тебе жить до конца. Береги его.",
    "Люди запоминают не то, что ты сказал, а то, что они почувствовали рядом с тобой.",
    "Скука — это не повод делать глупости. Это повод найти новое увлечение.",
    "Если ты устал, тебе нужен отдых, а не мотивация. Слушай свой организм.",
    "Те, кто смеется над твоими мечтами, обычно просто боятся мечтать сами.",
    "Прокрастинация — это не лень. Это страх начать неидеально.",
    "Твоя жизнь не станет лучше, если ты будешь ждать пятницы.",
    "Одиночество лучше, чем токсичное общество. Всегда.",
    "Читать 10 страниц в день — это 3650 страниц в год. Это 10 больших книг.",
    "Ты не можешь контролировать всё. Но ты можешь контролировать свою реакцию.",
    "Сравнение — это вор радости. Оставь чужую ленту и займись своей жизнью.",
    "Здоровые границы — это не про то, как оттолкнуть людей. Это про то, как сохранить себя.",
    "Тот, кто сплетничает с тобой, сплетничает и о тебе.",
    "Твои привычки строят твое будущее. Выбирай их осознанно."
  ];

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const quote = quotes[dayOfYear % quotes.length];

  const heroWrap = document.querySelector('.hero .wrap');
  if (!heroWrap) return;

  const quoteEl = document.createElement('div');
  quoteEl.className = 'daily-quote';
  quoteEl.innerHTML = `«${quote}»`;
  
  const cta = heroWrap.querySelector('.cta');
  if (cta) {
    cta.insertAdjacentElement('afterend', quoteEl);
  } else {
    heroWrap.appendChild(quoteEl);
  }
})();

/* ============================================================
   АВАТАРКИ
============================================================ */
const AVATAR_SEEDS = ['Felix', 'Aneka', 'Milo', 'Buster', 'Jasper', 'Luna', 'Oliver', 'Bella', 'Max', 'Coco', 'Leo', 'Zoe'];

function renderAvatars() {
  const grid = $('#emojiGrid');
  if(!grid) return;
  grid.innerHTML = '';
  
  AVATAR_SEEDS.forEach((seed, i) => {
    const url = `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`;
    
    const btn = document.createElement('button');
    btn.className = 'avatar-option';
    if (userAvatar === url) btn.classList.add('selected');
    btn.style.background = 'var(--card)'; 
    btn.innerHTML = `<img src="${url}" alt="avatar">`;
    
    btn.addEventListener('click', () => {
      userAvatar = url;
      store.rawSet('userAvatar', userAvatar);
      updateProfileUI();
      $$('.avatar-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      toast('Аватарка обновлена!', 'success');
    });
    
    grid.appendChild(btn);
  });
}

if($('#profileBtn')) {
  $('#profileBtn').addEventListener('click', () => { 
    renderAvatars();
    $('#avatarModal').hidden = false; 
  });
}

if($('#avatarUpload')) {
  $('#avatarUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Файл слишком большой (макс 2MB)', 'error');

    const reader = new FileReader();
    reader.onload = function(event) {
      userAvatar = event.target.result;
      store.rawSet('userAvatar', userAvatar);
      updateProfileUI();
      $('#avatarModal').hidden = true;
      toast('Фото загружено!', 'success');
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   ДОСТИЖЕНИЯ
============================================================ */
const ALL_ACHIEVEMENTS = [
  { id: 'quiz', title: 'Самопознание', desc: 'Прошел тест привычек', icon: 'fa-brain' },
  { id: 'tracker', title: 'Железная воля', desc: 'Закрыл 21 день привычки', icon: 'fa-calendar-check' },
  { id: 'fav', title: 'Коллекционер', desc: 'Добавил правило в избранное', icon: 'fa-heart' },
  { id: 'pomo', title: 'Продуктивность', desc: 'Завершил сессию Помодоро', icon: 'fa-clock' },
  { id: 'morning', title: 'Ранняя пташка', desc: 'Сделал все утренние ритуалы', icon: 'fa-sun' },
  { id: 'mood', title: 'На позитиве', desc: 'Отметил отличное настроение', icon: 'fa-face-grin-stars' },
  { id: 'level5', title: 'Опытный', desc: 'Достиг 5 уровня', icon: 'fa-star' },
  { id: 'level10', title: 'Мастер', desc: 'Достиг 10 уровня', icon: 'fa-crown' },
  { id: 'streak3', title: 'В ударе', desc: 'Заходил 3 дня подряд', icon: 'fa-fire' },
  { id: 'challenge', title: 'Сила воли', desc: 'Прошел челлендж 7 дней', icon: 'fa-shield-halved' }
];

function renderAchievements() {
  const grid = $('#achieveGrid');
  if(!grid) return;
  grid.innerHTML = '';
  const unlocked = store.get('achievements', []);
  
  ALL_ACHIEVEMENTS.forEach(a => {
    const isUnlocked = unlocked.includes(a.id);
    const el = document.createElement('div');
    el.className = 'achieve-item ' + (isUnlocked ? 'unlocked' : '');
    el.innerHTML = `<i class="fa-solid ${a.icon}"></i><h4>${a.title}</h4><p>${a.desc}</p>`;
    grid.appendChild(el);
  });
}

if($('#achieveBtn')) {
  $('#achieveBtn').addEventListener('click', () => {
    renderAchievements();
    $('#achieveModal').hidden = false;
  });
}

function unlockAchievement(id, title, desc) {
  let unlocked = store.get('achievements', []);
  if(unlocked.includes(id)) return;
  unlocked.push(id); store.set('achievements', unlocked);
  
  if($('#profileAchievements')) renderProfileAchievements();

  const container = document.getElementById('achieve-container');
  if(container) {
    const el = document.createElement('div'); el.className = 'achieve-toast';
    el.innerHTML = `<div class="achieve-icon"><i class="fa-solid fa-trophy"></i></div><div class="achieve-text"><h4>${title}</h4><p>${desc}</p></div>`;
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 100);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); }, 4000);
  }
  
  addXP(20);
  fireConfetti();
}

/* ============================================================
   КОНФЕТТИ
============================================================ */
function fireConfetti() {
  if (typeof confetti !== 'function') return;
  
  const colors = ['#2ee6a8', '#5ea8ff', '#ff5c7a', '#ffd700'];

  confetti({
    particleCount: 100,
    spread: 100,
    origin: { y: 0.6 },
    colors: colors,
    disableForReducedMotion: true
  });

  confetti({
    particleCount: 70,
    angle: 60,
    spread: 80,
    origin: { x: 0, y: 0.8 },
    colors: colors
  });
  
  confetti({
    particleCount: 70,
    angle: 120,
    spread: 80,
    origin: { x: 1, y: 0.8 },
    colors: colors
  });

  var duration = 2500;
  var end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      startVelocity: 0,
      ticks: 300,
      origin: { x: Math.random(), y: -0.1 },
      colors: colors,
      gravity: 0.8,
      scalar: Math.random() * 0.8 + 0.6
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}

/* ============================================================
   ТЕМЫ ОФОРМЛЕНИЯ
============================================================ */
const themes = ['dark', 'light'];
(function initTheme(){
  const saved = store.raw('theme') || 'dark';
  const valid = themes.includes(saved) ? saved : 'dark';
  document.documentElement.dataset.theme = valid;
  updateThemeBtn(valid);

  $('#themeToggle')?.addEventListener('click', () => {
    let current = document.documentElement.dataset.theme;
    let nextIndex = (themes.indexOf(current) + 1) % themes.length;
    let next = themes[nextIndex];
    
    document.documentElement.dataset.theme = next;
    store.rawSet('theme', next);
    updateThemeBtn(next);
    
    const names = { dark: 'Тёмная', light: 'Светлая' };
    toast(`Тема: ${names[next]}`);
  });
  
  function updateThemeBtn(t){
    const btn = $('#themeToggle');
    if(!btn) return;
    if (t === 'dark') btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    else btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }
})();

/* ============================================================
   ТРЕКЕР ПРИВЫЧЕК (Строгий режим)
============================================================ */
(function initTracker(){
  const grid = $('#trackerGrid'), input = $('#habitName'), bar = $('#trackerBar'), label = $('#trackerLabel'), resetBtn = $('#habitReset');
  if(!grid) return;
  
  let state = store.get('habit21', {name:'', days:new Array(21).fill(false), lastClickDate: null});
  if (Array.isArray(state)) state = { name:'', days: state, lastClickDate: null };
  if (!state.days || state.days.length !== 21) state.days = new Array(21).fill(false);
  
  input.value = state.name || '';
  const save = () => store.set('habit21', state);

  const today = new Date().toDateString();
  if (state.lastClickDate) {
    const last = new Date(state.lastClickDate);
    const now = new Date(today);
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1 && state.days.some(Boolean)) {
      state.days.fill(false);
      state.lastClickDate = null;
      save();
      setTimeout(() => toast('Вы пропустили день. Трекер сброшен для честного результата!', 'error'), 1000);
    }
  }

  const render = () => {
    grid.innerHTML = '';
    const today = new Date().toDateString();
    const canClickToday = state.lastClickDate !== today;
    const nextIndex = state.days.findIndex(d => !d);

    state.days.forEach((d, i) => {
      const el = document.createElement('div'); 
      el.className = 'day' + (d ? ' done' : '');
      
      if (!d && i === nextIndex && canClickToday) {
        el.classList.add('active');
      }
      
      el.textContent = d ? '' : (i + 1); 
      
      el.onclick = () => { 
        if (state.days[i]) return; 
        if (!canClickToday) {
          toast('Вы уже отметили привычку сегодня. Возвращайтесь завтра!', 'info');
          return;
        }
        if (i !== nextIndex) {
          toast('Отмечайте дни по порядку.', 'error');
          return;
        }
        state.days[i] = true; 
        state.lastClickDate = today;
        addXP(5); 
        save(); render(); 
      };
      grid.appendChild(el);
    });
    
    const done = state.days.filter(Boolean).length;
    bar.style.width = (done / 21 * 100) + '%';
    label.textContent = `${done} / 21`;
    if(done === 21) unlockAchievement('tracker', 'Железная воля', 'Ты закрыл 21 день привычки!');
  };
  
  input.addEventListener('input', () => { state.name = input.value; save(); });
  resetBtn.addEventListener('click', () => { 
    if(confirm('Начать заново? (Прогресс сбросится)')) { 
      state.days.fill(false); 
      state.lastClickDate = null;
      save(); render(); 
    } 
  });
  render();
})();

/* ============================================================
   ЧЕЛЛЕНДЖИ (Строгий режим)
============================================================ */
(function initChallenges(){
  const grid = $('#challengeGrid');
  if(!grid) return;
  
  let state = store.get('challenge7', { days: new Array(7).fill(false), lastClickDate: null });
  if (Array.isArray(state)) state = { days: state, lastClickDate: null };
  if(!state.days || state.days.length !== 7) state.days = new Array(7).fill(false);

  const today = new Date().toDateString();
  if (state.lastClickDate) {
    const last = new Date(state.lastClickDate);
    const now = new Date(today);
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1 && state.days.some(Boolean)) {
      state.days.fill(false);
      state.lastClickDate = null;
      store.set('challenge7', state);
      setTimeout(() => toast('Вы пропустили день. Челлендж сброшен!', 'error'), 1500);
    }
  }

  const render = () => {
    grid.innerHTML = '';
    const today = new Date().toDateString();
    const canClickToday = state.lastClickDate !== today;
    const nextIndex = state.days.findIndex(d => !d);

    state.days.forEach((done, i) => {
      const el = document.createElement('div');
      el.className = 'challenge-day' + (done ? ' done' : '');
      
      if (!done && i === nextIndex && canClickToday) {
        el.classList.add('active');
      }
      
      el.textContent = i + 1;
      
      el.onclick = () => {
        if (state.days[i]) return; 
        if (!canClickToday) {
          toast('Вы уже отметили день. Возвращайтесь завтра!', 'info');
          return;
        }
        if (i !== nextIndex) {
          toast('Отмечайте дни по порядку.', 'error');
          return;
        }
        state.days[i] = true;
        state.lastClickDate = today;
        addXP(10);
        store.set('challenge7', state);
        render();
      };
      grid.appendChild(el);
    });
    
    const count = state.days.filter(Boolean).length;
    $('#challengeStatus').textContent = `${count} / 7 дней`;
    if(count === 7) unlockAchievement('challenge', 'Сила воли', 'Ты прошел челлендж 7 дней!');
  };
  render();
})();

/* ============================================================
   КАЛЬКУЛЯТОРЫ И ИНСТРУМЕНТЫ
============================================================ */
$('#wakeTime')?.addEventListener('input', function() {
  const [h, m] = this.value.split(':').map(Number);
  const wakeDate = new Date(); wakeDate.setHours(h, m, 0, 0);
  let times = [];
  for(let i = 5; i >= 1; i--) { 
    const sleepTime = new Date(wakeDate.getTime() - (i * 90 + 15) * 60000);
    times.push(`${sleepTime.getHours().toString().padStart(2, '0')}:${sleepTime.getMinutes().toString().padStart(2, '0')}`);
  }
  $('#sleepResult').innerHTML = `Лучше лечь в:<br><b>${times.join('</b> или <b>')}</b>`;
});

// ОБЪЕДИНЕННЫЙ КАЛЬКУЛЯТОР: КОПИЛКА И МЕЧТА
(function initFinanceTools() {
  const nameInput = $('#dreamName');
  const costInput = $('#dreamCost');
  const saveInput = $('#savingsInput');
  const dreamRes = $('#dreamResult');
  const savRes = $('#savingsResult');
  
  if (!saveInput || !savRes) return;

  const updateFinance = () => {
    const cost = Number(costInput?.value) || 0;
    const save = Number(saveInput.value) || 0;
    const name = nameInput?.value.trim() || 'мечту';

    // 1. Обновляем блок "Мечта"
    if (dreamRes) {
      if (cost === 0 || save === 0) {
        dreamRes.innerHTML = 'Укажи цель и сумму';
      } else {
        const weeks = Math.ceil(cost / save);
        dreamRes.innerHTML = weeks > 0 
          ? `На <b>${name}</b> копить <b>${weeks} нед.</b>` 
          : 'Ты уже накопил! 🎉';
      }
    }

    // 2. Обновляем блок "Копилка" (долгосрочное накопление)
    savRes.innerHTML = `Через год: <b>${(save * 52).toLocaleString('ru-RU')} ₽</b><br>Через 3 года: <b>${(save * 156).toLocaleString('ru-RU')} ₽</b>`;
  };

  // Вешаем событие на все три поля
  if (nameInput) nameInput.addEventListener('input', updateFinance);
  if (costInput) costInput.addEventListener('input', updateFinance);
  saveInput.addEventListener('input', updateFinance);
  
  // Запускаем расчет при загрузке
  updateFinance();
})();

function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.5);
  } catch(e) { console.log('Audio error', e); }
}

(function initPomodoro(){
  let timeLeft = 25 * 60, timerId = null;
  const display = $('#pomoTime'), btnStart = $('#pomoStart'), btnReset = $('#pomoReset');
  if(!display) return;
  
  function updateDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    display.textContent = `${m}:${s}`;
  }
  
  btnStart.addEventListener('click', () => {
    if(timerId) { clearInterval(timerId); timerId = null; btnStart.textContent = 'Старт'; }
    else {
      btnStart.textContent = 'Пауза';
      timerId = setInterval(() => {
        timeLeft--; updateDisplay();
        if(timeLeft <= 0) {
          clearInterval(timerId); timerId = null; btnStart.textContent = 'Старт';
          timeLeft = 25 * 60; updateDisplay();
          toast('Время вышло! Отдохни 5 минут.', 'success');
          playBell(); 
          unlockAchievement('pomo', 'Продуктивность', 'Ты завершил сессию Помодоро.');
        }
      }, 1000);
    }
  });
  
  btnReset.addEventListener('click', () => {
    clearInterval(timerId); timerId = null; timeLeft = 25 * 60;
    updateDisplay(); btnStart.textContent = 'Старт';
  });
  updateDisplay();
})();

(function initChecklist(){
  const items = [
    { id: 'water', text: 'Выпить стакан воды' },
    { id: 'bed', text: 'Заправить кровать' },
    { id: 'stretch', text: 'Сделать зарядку' },
    { id: 'nophone', text: 'Не брать телефон 30 мин' }
  ];
  const container = $('#morningChecklist');
  if(!container) return;
  
  let state = store.get('morningCheck', {});
  const today = new Date().toDateString();
  
  if(state.date !== today) {
    state = { date: today };
    items.forEach(i => state[i.id] = false);
    store.set('morningCheck', state);
  }
  
  items.forEach(item => {
    const label = document.createElement('label');
    label.className = 'check-item';
    label.innerHTML = `<input type="checkbox" ${state[item.id] ? 'checked' : ''} data-id="${item.id}"><div class="check-box"><i class="fa-solid fa-check"></i></div><span>${item.text}</span>`;
    container.appendChild(label);
  });
  
  container.addEventListener('change', (e) => {
    if(e.target.type === 'checkbox') {
      state[e.target.dataset.id] = e.target.checked;
      
      if (!state.xpGiven) state.xpGiven = {};
      if(e.target.checked && !state.xpGiven[e.target.dataset.id]) {
        addXP(5);
        state.xpGiven[e.target.dataset.id] = true;
      }
      
      store.set('morningCheck', state);
      if(items.every(i => state[i.id])) unlockAchievement('morning', 'Ранняя пташка', 'Ты выполнил все утренние ритуалы!');
    }
  });
})();

(function initRefusal(){
  const phrases = [
    "«Спасибо, но я пас. Мне это не подходит».",
    "«У меня аллергия, так что я лучше воздержусь».",
    "«Мне нужно бежать по делам, давай потом».",
    "«Я сейчас на спорте/диете, так что нет».",
    "«Не хочу портить себе вечер, так что без меня».",
    "«Я обещал родителям не ввязываться, так что нет».",
    "«Мне это не интересно, но спасибо, что предложил».",
    "«Я не курю/не пью, но вы продолжайте».",
    "«Мне надо забрать сестру/брата, так что я ушел».",
    "«Давай без этого. Пошли лучше поедим».",
    "«Я на таблетках, мне нельзя».",
    "«Мне нужно на созвон по учебе, я убегаю».",
    "«Я лучше пойду домой, у меня завтра важный день».",
    "«Не сегодня. И не завтра. И вообще вряд ли».",
    "«Я ценю заботу, но мне это не надо».",
    "«Мне некомфортно это делать, давай сменим тему».",
    "«У меня закончились деньги, так что я просто смотрю».",
    "«Мне нужно покормить кота, срочно».",
    "«Я сегодня вообще не в ресурсе, так что отвалите».",
    "«Слушай, без обид, но я лучше пойду домой посплю».",
    "«Я на связи с родителями, они ждут моего звонка».",
    "«Нет, спасибо. Я не голоден».",
    "«Я такое не ем/не пью».",
    "«Мне это не по карману».",
    "«Я сейчас занят, давай позже».",
    "«У меня другие планы на вечер».",
    "«Нет. Просто нет».",
    "«Я чувствую себя не очень, так что я пас».",
    "«Мне не разрешают».",
    "«Я лучше с девочками/мальчиками посижу».",
    "«Спасибо, что позвали, но я вынужден отказаться»."
  ];

  let remainingPhrases = store.get('remainingRefusals');
  if (!remainingPhrases || !Array.isArray(remainingPhrases) || remainingPhrases.length === 0) {
    remainingPhrases = [...phrases];
  }

  let xpCount = store.get('refusalXpCount', 0);
  let xpDate = store.get('refusalXpDate', '');
  const today = new Date().toDateString();

  if (xpDate !== today) {
    xpCount = 0;
    store.set('refusalXpDate', today);
    store.set('refusalXpCount', xpCount);
  }

  const btn = $('#refusalBtn'), text = $('#refusalText');
  if(!btn) return;
  
  btn.addEventListener('click', () => {
    if (remainingPhrases.length === 0) {
      remainingPhrases = [...phrases];
      toast('Круг отказов завершен! Начинаем заново.', 'info');
    }

    const randomIndex = Math.floor(Math.random() * remainingPhrases.length);
    const selectedPhrase = remainingPhrases[randomIndex];

    text.textContent = selectedPhrase;
    text.style.borderStyle = 'solid'; text.style.borderColor = 'var(--yellow)';

    if (xpCount < 3) {
      addXP(2);
      xpCount++;
      store.set('refusalXpCount', xpCount);
    }

    remainingPhrases.splice(randomIndex, 1);
    store.set('remainingRefusals', remainingPhrases);
  });
})();

(function initMoodTracker(){
  const grid = $('#moodGrid'), history = $('#moodHistory'), status = $('#moodStatus');
  if(!grid) return;
  
  let moods = store.get('moodHistory', []);
  const today = new Date().toLocaleDateString();
  
  function render() {
    const todayMood = moods.find(m => m.date === today);
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.classList.remove('active');
      if(todayMood && +btn.dataset.mood === todayMood.score) btn.classList.add('active');
    });
    
    history.innerHTML = '';
    const daysArr = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; 
    
    for(let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString();
      const dayMood = moods.find(m => m.date === dateStr);
      
      const wrapper = document.createElement('div'); 
      wrapper.className = 'mood-bar-wrap';
      
      const bar = document.createElement('div'); 
      bar.className = 'mood-bar';
      
      if(dayMood) {
        bar.style.height = (dayMood.score * 8) + 'px';
        bar.style.background = dayMood.score >= 4 ? 'var(--green)' : (dayMood.score === 3 ? 'var(--blue)' : 'var(--red)');
        bar.title = `${dateStr}: ${dayMood.score}/5`;
      } else {
        bar.style.height = '4px'; bar.style.background = 'var(--border)'; bar.title = `${dateStr}: Нет данных`;
      }
      
      // Создаем подпись: День недели + Дата
      const label = document.createElement('span');
      label.className = 'mood-day-label';
      const dateFormatted = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      label.innerHTML = `${daysArr[d.getDay()]}<br><span style="font-size:9px; opacity:0.6; font-weight:normal;">${dateFormatted}</span>`;
      
      wrapper.appendChild(bar);
      wrapper.appendChild(label);
      history.appendChild(wrapper);
    }
    if(todayMood) status.innerHTML = `Твое настроение на сегодня сохранено: <b>${todayMood.score}/5</b>. Приходи завтра!`;
    else status.textContent = 'Нажми на иконку, чтобы сохранить настроение.';
  }
  
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.mood-btn');
    if(!btn) return;
    const score = +btn.dataset.mood;
    
    const isFirstTimeToday = !moods.some(m => m.date === today);
    
    moods = moods.filter(m => m.date !== today);
    moods.push({ date: today, score });
    store.set('moodHistory', moods);
    render(); toast('Настроение сохранено!');
    
    if (isFirstTimeToday) {
      addXP(5);
      if(score === 5) unlockAchievement('mood', 'На позитиве', 'Ты отметил отличное настроение!');
    }
  });
  render();
})();

/* ============================================================
   ИНСТРУМЕНТ: ДЫХАНИЕ (4-4-4)
============================================================ */
(function initBreathing() {
  const circle = $('#breathCircle');
  const text = $('#breathText');
  const btn = $('#breathBtn');
  if (!circle || !btn) return;

  let isBreathing = false;
  let timer1, timer2, timer3;

  function breatheCycle() {
    if (!isBreathing) return;

    text.textContent = 'Вдох';
    circle.classList.remove('exhale', 'hold');
    circle.classList.add('inhale');

    timer1 = setTimeout(() => {
      if (!isBreathing) return;
      text.textContent = 'Задержка';
      circle.classList.remove('inhale');
      circle.classList.add('hold');

      timer2 = setTimeout(() => {
        if (!isBreathing) return;
        text.textContent = 'Выдох';
        circle.classList.remove('hold');
        circle.classList.add('exhale');

        timer3 = setTimeout(() => {
          if (!isBreathing) return;
          breatheCycle();
        }, 4000);

      }, 4000);
    }, 4000);
  }

  btn.addEventListener('click', () => {
    isBreathing = !isBreathing;
    
    if (isBreathing) {
      btn.textContent = 'Стоп';
      btn.classList.replace('btn-primary', 'btn-ghost');
      breatheCycle();
    } else {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      btn.textContent = 'Начать';
      btn.classList.replace('btn-ghost', 'btn-primary');
      text.textContent = 'Готов?';
      circle.classList.remove('inhale', 'exhale', 'hold');
    }
  });
})();

/* ============================================================
   АНИМАЦИИ ПОЯВЛЕНИЯ
============================================================ */
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting){
      entry.target.classList.add('in');
      revealIO.unobserve(entry.target);
    }
  });
}, {threshold: 0.12});
$$('.reveal').forEach(el => revealIO.observe(el));

(function initTOC(){
  const links = $$('.toc a');
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting){
        const id = '#' + e.target.id;
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === id));
      }
    });
  }, {rootMargin: '-45% 0px -50% 0px'});
  sections.forEach(s => io.observe(s));
})();

$$('.myth').forEach(m => {
  const flip = () => m.classList.toggle('flipped');
  m.addEventListener('click', flip);
  m.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); flip(); }
  });
});

(function initBA(){
  const container = $('#baContainer'), range = $('#baRange');
  if (!container || !range) return;
  container.style.setProperty('--pos', range.value);
  range.addEventListener('input', () => {
    container.style.setProperty('--pos', range.value);
  });
})();

/* ============================================================
   УЛУЧШЕННЫЙ ПОИСК
============================================================ */
const searchModal = $('#searchModal');
const searchInput = $('#globalSearchInput');
const searchResults = $('#searchResults');

if($('#searchBtn')) {
  $('#searchBtn').addEventListener('click', () => {
    searchModal.classList.add('active');
    setTimeout(() => searchInput.focus(), 100);
  });
}
if($('#closeSearch')) $('#closeSearch').addEventListener('click', closeSearchModal);
if(searchModal) searchModal.addEventListener('click', (e) => { if (e.target === searchModal) closeSearchModal(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchModal && searchModal.classList.contains('active')) {
    closeSearchModal();
  }
});

function closeSearchModal() {
  searchModal.classList.remove('active');
  searchInput.value = '';
  searchResults.innerHTML = '';
}

if(searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    searchResults.innerHTML = '';
    
    if(query.length > 0 && query.length < 3) {
      searchResults.innerHTML = '<div class="no-results">Введите хотя бы 3 буквы для поиска...</div>';
      return;
    }
    if(query.length === 0) {
      searchResults.innerHTML = '';
      return;
    }

    let matches = 0;

    const allElements = [
      ...document.querySelectorAll('.do .card, .dont .card'),
      ...document.querySelectorAll('.bonus'),
      ...document.querySelectorAll('.myth'),
      ...document.querySelectorAll('.situation-card')
    ];

    allElements.forEach(el => {
      let title = '', desc = '';

      if (el.matches('.card, .bonus')) {
        title = el.querySelector('h3')?.textContent || '';
        desc = el.querySelector('p')?.textContent || '';
      } else if (el.matches('.situation-card')) {
        title = el.querySelector('h3')?.textContent || '';
        desc = (el.querySelector('p')?.textContent || '') + ' ' + (el.querySelector('.sol')?.textContent || '');
      } else if (el.matches('.myth')) {
        title = 'Миф: ' + (el.querySelector('.myth-front p')?.textContent || '');
        desc = el.querySelector('.myth-back p')?.textContent || '';
      }

      const fullText = (title + ' ' + desc).toLowerCase();

      if(fullText.includes(query)) {
        matches++;
        createResultItem(el, title, desc, query);
      }
    });

    if(matches === 0) {
      searchResults.innerHTML = '<div class="no-results">Ничего не найдено :(</div>';
    }

    function createResultItem(el, title, desc, query) {
      const item = document.createElement('div');
      item.className = 'search-result-item';

      let icon = 'fa-arrow-right';
      let color = 'var(--muted)';
      let badgeText = 'Правило';
      let badgeClass = 'badge-do';

      if (el.closest('.do')) { 
          color = 'var(--green)'; 
          badgeText = 'Что делать'; 
          badgeClass = 'badge-do';
      }
      else if (el.closest('.dont')) { 
          color = 'var(--red)';   
          badgeText = 'Чего избегать'; 
          badgeClass = 'badge-dont';
      }
      else if (el.closest('#myths')) { 
          icon = 'fa-scale-balanced'; 
          color = 'var(--yellow)'; 
          badgeText = 'Миф'; 
          badgeClass = 'badge-myth';
      }
      else if (el.closest('#bonus')) { 
          icon = 'fa-lightbulb'; 
          color = 'var(--blue)'; 
          badgeText = 'Лайфхак'; 
          badgeClass = 'badge-bonus';
      }
      else if (el.closest('#situations')) { 
          icon = 'fa-triangle-exclamation'; 
          color = 'var(--red)'; 
          badgeText = 'Ситуация'; 
          badgeClass = 'badge-situation';
      }

      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');

      const highlightedTitle = title.replace(regex, '<mark>$1</mark>');

      let snippet = '';
      if (desc.toLowerCase().includes(query)) {
        const idx = desc.toLowerCase().indexOf(query);
        const start = Math.max(0, idx - 25);
        const end = Math.min(desc.length, idx + 45);
        let sub = desc.substring(start, end);
        if (start > 0) sub = '...' + sub;
        if (end < desc.length) sub = sub + '...';
        snippet = `<div class="search-snippet">${sub.replace(regex, '<mark>$1</mark>')}</div>`;
      }

      item.innerHTML = `
        <div class="search-result-icon" style="color: ${color}"><i class="fa-solid ${icon}"></i></div>
        <div class="search-result-content">
          <div class="search-result-header">
            <span class="search-badge ${badgeClass}">${badgeText}</span>
            <div class="search-result-title">${highlightedTitle}</div>
          </div>
          ${snippet}
        </div>
      `;

      item.addEventListener('click', () => {
        closeSearchModal();
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        
        el.style.boxShadow = '0 0 0 3px var(--green)';
        el.style.transform = 'scale(1.02)';
        el.style.transition = 'all 0.3s';
        
        setTimeout(() => {
            el.style.boxShadow = '';
            el.style.transform = '';
            el.style.transition = '';
        }, 2000);
      });
      
      searchResults.appendChild(item);
    }
  });
}

/* ============================================================
   ФИЛЬТРЫ
============================================================ */
$$('.filters').forEach(container => {
  const target = container.dataset.target;
  const cards = $$(`${target} .card`);
  
  container.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if(!btn) return;
    
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const filter = btn.dataset.filter;
    cards.forEach(card => {
      if(filter === 'all' || card.dataset.topics.includes(filter)) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  });
});

/* ============================================================
   ТЕСТ (10 ВОПРОСОВ), ОНБОРДИНГ, ФОРМЫ
============================================================ */
(function initQuiz(){
  const qs = [
    'Я сплю 8+ часов',
    'Двигаюсь 30+ минут',
    'Есть кому доверять',
    'Умею говорить «нет»',
    'Откладываю деньги',
    'Не листаю телефон перед сном',
    'Есть интересное занятие',
    'Защищаю свои личные границы',
    'Могу распознать манипуляцию',
    'Планирую свой день'
  ];
  const box = $('#quizBox'); 
  if(!box) return;
  const ans = new Array(qs.length).fill(null);
  
  qs.forEach((q, i) => {
    const row = document.createElement('div'); row.className = 'quiz-q';
    row.innerHTML = `<p>${q}</p><div class="quiz-actions"><button type="button" data-i="${i}" data-v="1">Да</button><button type="button" data-i="${i}" data-v="0">Нет</button></div>`;
    box.appendChild(row);
  });
  const submit = document.createElement('button'); submit.className = 'btn btn-primary'; submit.textContent = 'Показать результат'; box.appendChild(submit);
  const result = document.createElement('div'); result.id = 'quizResult'; result.hidden = true; box.appendChild(result);

  box.addEventListener('click', e => {
    const btn = e.target.closest('.quiz-actions button'); if (!btn) return;
    ans[+btn.dataset.i] = +btn.dataset.v;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('sel-yes','sel-no'));
    btn.classList.add(btn.dataset.v === '1' ? 'sel-yes' : 'sel-no');
  });

  submit.addEventListener('click', () => {
    if (ans.includes(null)) return toast('Ответь на все вопросы', 'error');
    const score = ans.reduce((s, v) => s + v, 0);
    let text = score <= 3 ? '<b>Начни с одного.</b> Выбери самую простую привычку.' : score <= 7 ? '<b>Хорошая база.</b> Посмотри на слабые места.' : '<b>Отличный результат.</b> Поделись с другом.';
    result.innerHTML = `<h3>${score} из 10</h3><p>${text}</p>`;
    result.hidden = false;
    result.scrollIntoView({behavior:'smooth', block:'center'});
    unlockAchievement('quiz', 'Самопознание', 'Ты прошел тест привычек!');
  });
})();

function applyPersonalization(){
  const topics = store.get('topics', []);
  if (!topics.length) return;
  $$('.do .grid, .dont .grid').forEach(grid => {
    const cards = [...grid.children];
    cards.forEach(c => {
      const t = (c.dataset.topics || '').split(',').map(s => s.trim());
      c.classList.toggle('for-you', t.some(x => topics.includes(x)));
    });
    cards.sort((a,b) => (b.classList.contains('for-you')?1:0) - (a.classList.contains('for-you')?1:0));
    cards.forEach((c, i) => {
      grid.appendChild(c);
      if (c.querySelector('.num')) c.querySelector('.num').textContent = String(i+1).padStart(2, '0');
    });
  });
}

(function initOnboarding(){
  const modal = $('#onboarding');
  if (!modal) return;
  if (store.get('onboarded')) { applyPersonalization(); return; }
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  
  $$('.chips').forEach(group => {
    group.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (group.dataset.group === 'age') group.querySelectorAll('.chip').forEach(c => c.classList.remove('sel'));
      chip.classList.toggle('sel');
    });
  });

  const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
  $('#skipOnboard').addEventListener('click', () => { store.set('onboarded', true); close(); });
  $('#saveOnboard').addEventListener('click', () => {
    const age = $('.chips[data-group="age"] .chip.sel')?.dataset.value || '';
    const topics = $$('.chips[data-group="topics"] .chip.sel').map(c => c.dataset.value);
    store.set('age', age); store.set('topics', topics); store.set('onboarded', true);
    close(); applyPersonalization();
    addXP(10);
  });
})();

const MODERATION = {
  selfHarm: ['убей себя','сдохни','не хочу жить','покончить с собой','резать себя','суицид','хочу умереть'],
  badRoots: ['хуй','хуе','хуё','пизд','бля','бляд','ебан','ебал','ебет','ебёт','ебат','сука','долбо','мразь','гандо','пидор','шлюх','нахуй','нахер','залуп','уеб'],
  adWords: ['купить','заказать','скидка','промокод','подписывай','подпишись','розыгрыш','заработок','казин','ставк','инвестиц','крипт','перейди по ссылке','в профиле','дешево','доставка'],
  urlRe: [/https?:\/\//i, /www\./i, /\.(ru|com|net|org|io|me|tv)\b/i]
};
function moderate(text){
  const t = text.trim();
  if (t.length < 5) return {ok:false, msg:'Слишком коротко — напиши чуть больше.'};
  if (t.length > 300) return {ok:false, msg:'Слишком длинно.'};
  const low = t.toLowerCase().replace(/ё/g, 'е');
  if (MODERATION.selfHarm.some(w => low.includes(w.replace(/ё/g,'е')))) return {ok:false, crisis:true, msg:'Если тебе сейчас тяжело — не оставайся один. Посмотри раздел «Помощь».'};
  if (MODERATION.urlRe.some(r => r.test(t)) || MODERATION.adWords.some(w => low.includes(w))) return {ok:false, msg:'Похоже на рекламу. Здесь только личные истории.'};
  if (MODERATION.badRoots.some(w => low.includes(w))) return {ok:false, msg:'Давай без грубостей.'};
  return {ok:true};
}

(function initForms(){
  async function handleSubmit(e, textarea, type) {
    e.preventDefault();
    const text = textarea.value.trim();
    const check = moderate(text);
    
    if (!check.ok) {
      toast(check.msg, 'error');
      if (check.crisis) setTimeout(() => location.hash = '#help', 900);
      return;
    }

    const btn = e.target.querySelector('button');
    const origText = btn.textContent;
    btn.textContent = 'Отправка...';
    btn.disabled = true;

    const res = await sendToTelegram(text, type);
    
    if (res.ok) {
      toast('Успешно отправлено на модерацию!', 'success');
      textarea.value = '';
      
      // ЗАЩИТА ОТ НАКРУТКИ XP: Даем бонус только 1 раз в день
      const today = new Date().toDateString();
      const lastXpDate = store.get('lastSubmitXpDate', '');
      
      if (lastXpDate !== today) {
        addXP(15);
        store.set('lastSubmitXpDate', today);
        setTimeout(() => toast('Бонус +15 XP за активность сегодня!', 'info'), 1000);
      }
      
    } else if (res.reason === 'not_configured') {
      toast('Telegram не настроен. Сохранено локально.', 'info');
      textarea.value = '';
    } else {
      toast('Ошибка при отправке. Попробуй позже.', 'error');
    }

    btn.textContent = origText;
    btn.disabled = false;
  }

  if($('#storyForm')) $('#storyForm').addEventListener('submit', e => handleSubmit(e, $('#storyText'), 'История'));
  if($('#ruleForm')) $('#ruleForm').addEventListener('submit', e => handleSubmit(e, $('#ruleText'), 'Правило'));
})();

/* ============================================================
   ИЗБРАННОЕ, ПЕЧАТНАЯ МАШИНКА, ПРОКРУТКА
============================================================ */
(function initFavorites(){
  let favs = store.get('favorites', []);
  const favSection = $('#favorites-section');
  const favGrid = $('#favGrid');
  if(!favSection) return;
  
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const card = btn.closest('.card');
    const id = card.dataset.id;
    if(favs.includes(id)) { btn.classList.add('active'); btn.innerHTML = '<i class="fa-solid fa-heart"></i>'; }
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isFav = favs.includes(id);
      if(isFav) { 
        favs = favs.filter(f => f !== id); 
        btn.classList.remove('active'); 
        btn.innerHTML = '<i class="fa-regular fa-heart"></i>'; 
        toast('Удалено из избранного'); 
      } else { 
        favs.push(id); 
        btn.classList.add('active'); 
        btn.innerHTML = '<i class="fa-solid fa-heart"></i>'; 
        toast('Добавлено в избранное', 'success'); 
        unlockAchievement('fav', 'Коллекционер', 'Ты сохранил первое правило в избранное.'); 
      }
      store.set('favorites', favs); renderFavs();
    });
  });
  
  function renderFavs() {
    if(favs.length === 0) { favSection.style.display = 'none'; return; }
    favSection.style.display = 'block'; favGrid.innerHTML = '';
    favs.forEach(id => {
      const original = document.querySelector(`.card[data-id="${id}"]`);
      if(original) {
        const clone = original.cloneNode(true);
        clone.classList.add('in');
        clone.querySelector('.fav-btn').remove();
        favGrid.appendChild(clone);
      }
    });
  }
  renderFavs();
})();

(function initTypewriter(){
  const el = $('#typewriterText'); 
  if(!el) return;
  let i = 0;
  const originalText = el.textContent;
  el.textContent = '';
  
  function type() {
    if(i < originalText.length) {
      el.innerHTML = originalText.slice(0, i+1) + '<span class="cursor-blink"></span>';
      i++;
      setTimeout(type, 40);
    } else {
      el.innerHTML = originalText;
    }
  }
  
  const io = new IntersectionObserver((entries) => {
    if(entries[0].isIntersecting) { type(); io.disconnect(); }
  }, {threshold: 0.5});
  io.observe($('.quote-block'));
})();

const progress = $('#progress');
const toTop = $('#toTop');
function onScroll(){
  if(!progress) return;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
  if(toTop) toTop.classList.toggle('show', window.scrollY > 500);
}
window.addEventListener('scroll', onScroll, {passive:true});
onScroll();
if(toTop) toTop.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));

/* ============================================================
   PWA, ФОКУС, СБРОС, ЭКСПОРТ
============================================================ */
(function initPWA(){
  const manifest = { name: 'Правила жизни', short_name: 'Правила', start_url: '.', display: 'standalone', background_color: '#07070c', theme_color: '#07070c', icons: [{ src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%232ee6a8"/><stop offset="1" stop-color="%235ea8ff"/></linearGradient></defs><rect width="100" height="100" rx="26" fill="url(%23g)"/><text x="50" y="70" font-size="56" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" fill="%2307070c">✦</text></svg>', sizes: '192x192', type: 'image/svg+xml' }] };
  const stringManifest = JSON.stringify(manifest);
  const blob = new Blob([stringManifest], {type: 'application/json'});
  const manifestURL = URL.createObjectURL(blob);
  if(document.querySelector('#manifest-placeholder')) {
    document.querySelector('#manifest-placeholder').setAttribute('href', manifestURL);
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err)); });
  }
})();

if($('#focusBtn')) {
  $('#focusBtn').addEventListener('click', () => {
    document.body.classList.toggle('focus-mode');
    const isFocus = document.body.classList.contains('focus-mode');
    $('#focusBtn').innerHTML = isFocus ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    if(isFocus) toast('Режим фокуса включен');
  });
}

if($('#resetAll')) {
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('Сбросить все настройки?')) return;
    ['theme','onboarded','age','topics','teenStories','suggestedRules','habit21','favorites','achievements','morningCheck','moodHistory', 'userXP', 'userLevel', 'userStreak', 'lastVisit', 'userAvatar', 'challenge7', 'userName', 'remainingRefusals', 'refusalXpCount', 'refusalXpDate', 'firstVisit', 'lastSubmitXpDate'].forEach(k => localStorage.removeItem(k));
    location.reload();
  });
}

const exportHandler = () => {
  if(typeof html2canvas === 'undefined') return toast('Ошибка: библиотека html2canvas не загружена', 'error');

  $('#expLevel').textContent = userLevel;
  $('#expXP').textContent = `${userXP} / ${getXPNeeded(userLevel)}`;
  $('#expStreak').textContent = userStreak;
  
  const habit = store.get('habit21', {name:'', days:[]});
  $('#expHabit').textContent = habit.name || 'Не выбрана';
  $('#expTracker').textContent = `${habit.days.filter(Boolean).length}/21`;
  
  const expCard = $('#export-card');
  expCard.style.left = '0'; 
  expCard.style.top = '0';
  expCard.style.position = 'fixed';
  expCard.style.zIndex = '9999';
  
  html2canvas(expCard, { backgroundColor: null, scale: 2 }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'my-progress.png';
    link.href = canvas.toDataURL();
    link.click();
    
    expCard.style.left = '-9999px';
    expCard.style.top = '-9999px';
    expCard.style.position = 'absolute';
  });
};

if($('#exportProfileBtn')) $('#exportProfileBtn').addEventListener('click', exportHandler);
if($('#exportBtn')) $('#exportBtn').addEventListener('click', exportHandler);

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
============================================================ */
updateProfileUI();
checkStreak();
if (userLevel >= 5) unlockAchievement('level5', 'Опытный', 'Достиг 5 уровня');
if (userLevel >= 10) unlockAchievement('level10', 'Мастер', 'Достиг 10 уровня');
if (userStreak >= 3) unlockAchievement('streak3', 'В ударе', 'Заходил 3 дня подряд');

/* ============================================================
   АВТО-СБРОС В ПОЛНОЧЬ (Цитата, чек-лист, трекер, челлендж)
============================================================ */
(function initMidnightReset() {
  let currentDay = new Date().toDateString();
  
  setInterval(() => {
    const newDay = new Date().toDateString();
    if (newDay !== currentDay) {
      // Если наступил новый день, перезагружаем страницу, чтобы обновить цитату, чек-лист и сбросить трекеры
      location.reload();
    }
  }, 60000); // Проверяем каждую минуту
})();

/* ============================================================
   КНОПКА "ПОДЕЛИТЬСЯ"
============================================================ */
(function initShare() {
  const shareBtn = $('#shareBtn');
  if (!shareBtn) return;

  shareBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const url = window.location.href;

    // 1. Пробуем современный API (работает на https)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        toast('Ссылка на сайт скопирована!', 'success');
        return;
      } catch (err) {
        console.log('Буфер обмена не сработал, включаем резервный метод');
      }
    } 

    // 2. Резервный метод (работает везде, даже на http)
    const textArea = document.createElement("textarea");
    textArea.value = url;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      toast('Ссылка на сайт скопирована!', 'success');
    } catch (err) {
      alert('Не удалось скопировать. Вот ссылка: ' + url);
    }
    document.body.removeChild(textArea);
  });
})();