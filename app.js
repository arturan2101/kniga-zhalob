import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// 1) Вставь сюда конфиг из Firebase Console → Project settings → Your apps → Web app
const firebaseConfig = {
  apiKey: "AIzaSyCeEgiACHcbs1t4MhN9OSoQkW8f3H-FPAM",
  authDomain: "knigazalob.firebaseapp.com",
  projectId: "knigazalob",
  appId: "1:888545200941:web:280c1f94bdb075beb821a4",
};

// 2) Твой UID (появится внизу страницы после входа). Тот же UID впиши в firestore.rules
const ADMIN_UID = "dpHDUU57LvNO2fv49RNoYqeRZi72";

const SEV = ["слегка надулась","заметно обижена","серьёзно обижена","молчит и смотрит","ТЫ ЗНАЕШЬ, ЧТО СДЕЛАЛ"];
const STATUS = { pending:"на рассмотрении", ok:"прощён", no:"не прощён" };
let sev = 2, owner = false, rows = [], seen = new Set(), first = true;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const note = t => { $("note").textContent = t; };

// --- степень обиды
const sevBox = $("sev");
SEV.forEach((_, i) => {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = i + 1; b.id = "sev" + (i + 1);
  b.onclick = () => { sev = i + 1; paintSev(); };
  sevBox.appendChild(b);
});
function paintSev() {
  [...sevBox.children].forEach((b, i) => b.setAttribute("aria-pressed", String(i + 1 === sev)));
  $("sevName").textContent = SEV[sev - 1];
}
paintSev();

if (firebaseConfig.projectId === "PASTE_ME") {
  note("Сначала вставь firebaseConfig в app.js.");
  throw new Error("firebaseConfig is not set");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const ts = r => r.createdAt?.toMillis?.() ?? Date.now(); // serverTimestamp пока не пришёл — считаем «сейчас»

function fmt(t) {
  const d = new Date(t);
  return d.toLocaleDateString("ru-RU", { day:"2-digit", month:"2-digit" }) + ", " +
         d.toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit" });
}

function render() {
  $("sTotal").textContent = rows.length;
  $("sOk").textContent = rows.filter(r => r.status === "ok").length;
  $("sWait").textContent = rows.filter(r => (r.status || "pending") === "pending").length;
  const list = $("list");
  if (!rows.length) {
    list.innerHTML = '<li class="empty"><b>Жалоб пока нет.</b>Кот скучает. Напиши первую жалобу выше.</li>';
    return;
  }
  const sorted = [...rows].sort((a, b) => ts(a) - ts(b)).map((r, i) => ({ ...r, n: i + 1 })).reverse();
  list.innerHTML = sorted.map(r => {
    const st = STATUS[r.status] ? r.status : "pending", fresh = !first && !seen.has(r.id), s = r.sev || 1;
    return `<li class="entry${fresh ? " fresh" : ""}" data-id="${esc(r.id)}">
      <div class="sticker ${st}">${STATUS[st]}</div>
      <div class="meta"><span class="num">Дело № ${String(r.n).padStart(3, "0")}</span><span>${fmt(ts(r))}</span><span class="tag">${esc(r.cat)}</span></div>
      <div class="text">${esc(r.text)}</div>
      <div class="demand">Обида: <span class="dots">${[1,2,3,4,5].map(k => `<i class="${k <= s ? "on" : ""}"></i>`).join("")}</span> Требует: <span>${esc(r.want)}</span></div>
      ${r.reply ? `<div class="reply">Ответ администрации: <i>${esc(r.reply)}</i></div>` : ""}
      ${owner ? `<div class="admin">
        <button type="button" data-act="ok">Вину загладил</button>
        <button type="button" data-act="no">Отклонить</button>
        <button type="button" data-act="pending">Вернуть</button>
        <input type="text" id="r-${esc(r.id)}" placeholder="Оправдания…" value="${esc(r.reply || "")}">
        <button type="button" data-act="reply">Ответить</button></div>` : ""}
    </li>`;
  }).join("");
  rows.forEach(r => seen.add(r.id));
  first = false;
}

onSnapshot(collection(db, "complaints"),
  snap => { rows = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
  err => note("Книга не загрузилась: " + err.code));

// --- подать жалобу
$("f").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("txt").value.trim();
  if (!text) return note("Кот не принимает пустые жалобы.");
  $("go").disabled = true;
  try {
    await addDoc(collection(db, "complaints"), {
      text: text.slice(0, 600), cat: $("cat").value, want: $("want").value,
      sev, status: "pending", createdAt: serverTimestamp(),
    });
    $("txt").value = "";
    note("Принято! Кот уже звонит виновнику.");
  } catch (err) {
    note("Не отправилось: " + err.code);
  }
  $("go").disabled = false;
});

// --- действия администрации
$("list").addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]");
  if (!b || !owner) return;
  const id = b.closest(".entry").dataset.id, act = b.dataset.act, ref = doc(db, "complaints", id);
  try {
    if (act === "reply") await updateDoc(ref, { reply: $("r-" + id).value.trim().slice(0, 300) });
    else await updateDoc(ref, { status: act });
  } catch (err) {
    note("Не получилось сохранить: " + err.code);
  }
});

// --- вход для администрации
$("adminBtn").addEventListener("click", async () => {
  try {
    if (auth.currentUser) await signOut(auth);
    else await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    note("Вход не удался: " + err.code);
  }
});

onAuthStateChanged(auth, user => {
  owner = !!user && user.uid === ADMIN_UID;
  $("adminBtn").textContent = user ? "Выйти" : "Вход для администрации";
  $("uidBox").textContent = user && !owner ? "Твой UID: " + user.uid + " (впиши в app.js и firestore.rules)" : "";
  render();
});
