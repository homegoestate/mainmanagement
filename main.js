// main.js - 核心邏輯檔

// === 1. 新聞爬蟲邏輯 (修復點擊問題) ===
async function loadNews() {
    const newsContent = document.getElementById('news-content');
    // 你的 Replit 網址
    const API_URL = "https://4dbd4a23-496d-4890-ba6f-b48d475d3a39-00-3cz7cqlznvxy2.pike.replit.dev/news"; 

    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.status === "success" && data.data.length > 0) {
            // 產生 HTML 連結
            let newsHTML = data.data.map(item => 
                `<a href="${item.link}" target="_blank" class="news-link">⚡ ${item.title}</a>`
            ).join(""); 

            newsContent.innerHTML = newsHTML;
            
            // 設定動畫
            newsContent.style.paddingLeft = "100%";
            newsContent.style.animation = "marquee 45s linear infinite"; // 放慢速度好點擊
            
            // 滑鼠移入暫停 (關鍵修正)
            newsContent.addEventListener('mouseenter', () => {
                newsContent.style.animationPlayState = 'paused';
            });
            newsContent.addEventListener('mouseleave', () => {
                newsContent.style.animationPlayState = 'running';
            });

        } else {
            newsContent.innerText = "目前沒有最新快訊。";
        }
    } catch (error) {
        console.error("新聞抓取失敗:", error);
        newsContent.innerText = "⚠️ 無法連線至新聞中心 (請確認 Replit 主機運作中)";
        newsContent.style.color = "#ef4444";
    }
}

// 啟動新聞
loadNews();


// === 2. Firebase 與系統邏輯 ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCSOS-36oQ6hTyhtD2vrez3QGvPdvwMOIw",
    authDomain: "mainmanagement-1f3d2.firebaseapp.com",
    databaseURL: "https://mainmanagement-1f3d2-default-rtdb.firebaseio.com",
    projectId: "mainmanagement-1f3d2",
    storageBucket: "mainmanagement-1f3d2.firebasestorage.app",
    messagingSenderId: "916729301354",
    appId: "1:916729301354:web:11d81d965c2127b0a17d13",
    measurementId: "G-NQ6YKGEJE9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 系統全域變數
const ADMIN_PASS = "8888"; 
const SECRET_SALT = 9527; 
const BANNED_USERS = []; // 若有離職黑名單，填入字串例如 ["testuser"]

const SITES = [
    "https://homegoestate.github.io/Employee-management/", 
    "https://homegoestate.github.io/case/", 
    "https://yangceo-taiwan.github.io/Land-efficiency-assessment/", 
    "https://homegoestate.github.io/receipts/", 
    "https://homegoestate.github.io/quotation/", 
    "https://homegoestate.github.io/AI-question-assistant/", 
    "https://homegoestate.github.io/Bank-choice/"
];

// 裝置指紋邏輯
let myDeviceId = localStorage.getItem('hg_cloud_did');
if (!myDeviceId) {
    myDeviceId = 'DID-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    localStorage.setItem('hg_cloud_did', myDeviceId);
}

// 輔助函式
function showLoading(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }
function getDeviceType() { const ua = navigator.userAgent; if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return "tablet"; if (/Mobile|Android|iP(hone|od)|IEMobile/.test(ua)) return "mobile"; return "desktop"; }
function getDeviceLabel(type) { if(type === 'mobile') return '<span class="device-badge bg-mobile"><i class="fas fa-mobile-alt"></i> 手機</span>'; if(type === 'tablet') return '<span class="device-badge bg-tablet"><i class="fas fa-tablet-alt"></i> 平板</span>'; return '<span class="device-badge bg-desktop"><i class="fas fa-desktop"></i> 電腦</span>'; }
window.calculateActivationCode = (username) => { let hash = 0, name = username.trim(); for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash); return (Math.abs(hash * SECRET_SALT) % 1000000).toString().padStart(6, '0'); }

// 介面切換
window.showRegister = () => { document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; }
window.showLogin = () => { document.getElementById('register-form').style.display = 'none'; document.getElementById('admin-auth-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; }
window.showAdminAuth = () => { document.getElementById('login-form').style.display = 'none'; document.getElementById('admin-auth-form').style.display = 'block'; }

// 註冊邏輯
document.getElementById('btnRegister').addEventListener('click', async () => {
    const user = document.getElementById('reg-user').value.trim();
    const pass = document.getElementById('reg-pass').value.trim();
    const inputCode = document.getElementById('reg-code').value.trim();

    if(BANNED_USERS.includes(user)) return alert("此帳號已被公司停用。");
    if(!user || !pass || !inputCode) return alert("請輸入完整資訊");
    if (inputCode !== window.calculateActivationCode(user)) return alert("❌ 開通碼錯誤，請洽管理員。");

    showLoading(true);
    try {
        const userRef = ref(db, 'users/' + user);
        const snapshot = await get(userRef);
        const deviceType = getDeviceType();

        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.password !== pass) {
                showLoading(false);
                alert("⚠️ 帳號已存在，但密碼錯誤！\n若這是您的帳號，請輸入正確密碼以綁定新裝置。");
                return;
            }
            let devices = userData.authorizedDevices || [];
            if(!devices.includes(myDeviceId)) {
                if(!confirm("驗證成功！要綁定此新裝置嗎？")) { showLoading(false); return; }
                devices.push(myDeviceId);
                await update(userRef, { authorizedDevices: devices, lastDeviceType: deviceType });
                alert("✅ 裝置綁定成功！");
            } else {
                alert("⚠️ 此裝置已綁定，請直接登入。");
            }
        } else {
            await set(userRef, { password: pass, lastDeviceType: deviceType, authorizedDevices: [myDeviceId] });
            alert("✅ 註冊成功！");
        }
        window.showLogin();
    } catch (error) { console.error(error); alert("連線錯誤：" + error.message); }
    showLoading(false);
});

// 登入邏輯
document.getElementById('btnLogin').addEventListener('click', async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const keep = document.getElementById('keep-login').checked;

    if (BANNED_USERS.includes(user)) return alert("您的帳號已被停用。");
    if (!user || !pass) return alert("請輸入帳號密碼");

    showLoading(true);
    try {
        const snapshot = await get(ref(db, 'users/' + user));
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.password === pass) {
                const devices = data.authorizedDevices || [];
                if (devices.includes(myDeviceId)) {
                    if(keep) localStorage.setItem('hg_cloud_session', user);
                    await update(ref(db, 'users/' + user), { lastDeviceType: getDeviceType() });
                    window.enterDashboard(user, false);
                } else {
                    alert("⛔ 登入失敗：此裝置未授權。\n請使用「註冊」功能綁定裝置。");
                }
            } else { alert("❌ 密碼錯誤"); }
        } else { alert("❌ 帳號不存在"); }
    } catch (error) { console.error(error); alert("登入錯誤"); }
    showLoading(false);
});

// 管理員登入
document.getElementById('btnAdminLogin').addEventListener('click', () => {
    if (document.getElementById('admin-pass-input').value === ADMIN_PASS) {
        window.enterDashboard("Administrator", true);
    } else { alert("密碼錯誤"); }
});

// 進入儀表板
window.enterDashboard = (user, isAdmin) => {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'flex';
    document.getElementById('display-username').innerText = user;
    if(isAdmin) {
        document.getElementById('admin-link').style.display = 'block';
        window.showAdminPanel(document.getElementById('admin-link').querySelector('a'));
    } else {
        document.getElementById('admin-link').style.display = 'none';
        window.loadPage(0, document.querySelector('.nav-links li a'));
    }
}

// 頁面加載
window.loadPage = (idx, el) => {
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('content-frame').style.display = 'block';
    document.getElementById('content-frame').src = SITES[idx];
    if(el) {
        document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
        el.classList.add('active');
    }
    if(window.innerWidth <= 768) window.toggleSidebar();
}

// 側邊欄切換
window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

// 登出
window.logout = () => {
    localStorage.removeItem('hg_cloud_session');
    location.reload();
}

// 管理員功能
window.showAdminPanel = (el) => {
    document.getElementById('content-frame').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    if(el) {
        document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
        el.classList.add('active');
    }
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
        const tbody = document.getElementById('user-table-body');
        tbody.innerHTML = '';
        if(snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const uid = childSnapshot.key;
                const uData = childSnapshot.val();
                tbody.innerHTML += `
                    <tr>
                        <td>${uid}</td>
                        <td>${getDeviceLabel(uData.lastDeviceType)}</td>
                        <td>${uData.authorizedDevices ? uData.authorizedDevices.length : 0} 台</td>
                        <td><button class="btn btn-danger" style="padding:5px; font-size:12px;" onclick="window.deleteCloudUser('${uid}')">刪除</button></td>
                    </tr>`;
            });
        } else { tbody.innerHTML = '<tr><td colspan="4">無資料</td></tr>'; }
    });
}

window.deleteCloudUser = async (uid) => {
    if(confirm(`確定刪除 ${uid}？`)) {
        try { await remove(ref(db, 'users/' + uid)); alert("已刪除"); }
        catch(e) { alert("失敗: " + e.message); }
    }
}

window.generateCode = () => {
    const name = document.getElementById('admin-generate-name').value.trim();
    if(!name) return alert("請輸入帳號");
    document.getElementById('generated-code-area').style.display = 'block';
    document.getElementById('display-code').innerText = window.calculateActivationCode(name);
}

// 自動登入檢查
window.onload = async () => {
    const banDisplay = document.getElementById('banned-list-display');
    if(BANNED_USERS.length > 0) banDisplay.innerHTML = "封鎖名單：" + BANNED_USERS.join(", ");
    const savedUser = localStorage.getItem('hg_cloud_session');
    if (savedUser) {
        if (BANNED_USERS.includes(savedUser)) { alert("帳號已停用"); window.logout(); }
        else { window.enterDashboard(savedUser, false); }
    }
}
