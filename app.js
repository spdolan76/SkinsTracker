import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// !!! PASTE YOUR COPIED CONFIG OBJECT DIRECTLY HERE FROM FIREBASE CONSOLE !!!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "...",
    appId: "..."
};

// Initialize Cloud Connections
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Official Layout Architecture: White Tees at The Links at Hiawatha Landing
const HiawathaCourseData = [
    { hole: 1, par: 4, yards: 375 }, { hole: 2, par: 4, yards: 377 }, { hole: 3, par: 3, yards: 149 },
    { hole: 4, par: 4, yards: 361 }, { hole: 5, par: 4, yards: 345 }, { hole: 6, par: 3, yards: 188 },
    { hole: 7, par: 5, yards: 476 }, { hole: 8, par: 4, yards: 375 }, { hole: 9, par: 5, yards: 453 },
    { hole: 10, par: 4, yards: 337 }, { hole: 11, par: 4, yards: 350 }, { hole: 12, par: 5, yards: 517 },
    { hole: 13, par: 3, yards: 144 }, { hole: 14, par: 4, yards: 322 }, { hole: 15, par: 4, yards: 401 },
    { hole: 16, par: 4, yards: 384 }, { hole: 17, par: 3, yards: 171 }, { hole: 18, par: 5, yards: 470 }
];

let currentSkinsCountGlobal = 0;
let isSignUpMode = false;
let dbUnsubscribe = null;

/* ==========================================================================
   AUTHENTICATION WORKFLOW ENGINE
   ========================================================================== */

const authOverlay = document.getElementById('authOverlay');
const appContent = document.getElementById('appContent');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
const authToggleText = document.getElementById('authToggleText');
const authError = document.getElementById('authError');
const userDisplay = document.getElementById('userDisplay');
const logoutBtn = document.getElementById('logoutBtn');

// Monitor Authentication Lifecycle States
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logged In -> Pivot viewports
        authOverlay.classList.add('hidden');
        appContent.classList.remove('opacity-0', 'pointer-events-none');
        userDisplay.innerText = user.email;
        
        initScorecardElements();
        startDatabaseRealtimeSync();
    } else {
        // Logged Out -> Reset viewports & drop heavy listener hooks
        authOverlay.classList.remove('hidden');
        appContent.classList.add('opacity-0', 'pointer-events-none');
        if (dbUnsubscribe) {
            dbUnsubscribe();
            dbUnsubscribe = null;
        }
    }
});

// Exposed globally to escape module scope restrictions and run perfectly on UI click events
window.toggleAuthMode = function() {
    isSignUpMode = !isSignUpMode;
    authError.classList.add('hidden');
    authForm.reset();
    
    if (isSignUpMode) {
        authTitle.innerText = "Create Account";
        authSubtitle.innerText = "Register a new email to join the league";
        authSubmitBtn.innerText = "Sign Up";
        authToggleText.innerText = "Already have an account?";
        authToggleBtn.innerText = "Log In Instead";
    } else {
        authTitle.innerText = "League Login";
        authSubtitle.innerText = "Sign in to access the live skins dashboard";
        authSubmitBtn.innerText = "Log In";
        authToggleText.innerText = "Need an account?";
        authToggleBtn.innerText = "Sign Up Instead";
    }
};

/ Authentication Form Dispatcher Submission Hook
authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Explicitly grab the latest values right at submission execution
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    
    authError.classList.add('hidden');

    if (isSignUpMode) {
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Success! Force overlay clear and clean form
                authOverlay.classList.add('hidden');
                authForm.reset();
            })
            .catch(err => {
                console.error("Sign Up Error Details:", err);
                displayAuthError(err.message);
            });
    } else {
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                authOverlay.classList.add('hidden');
                authForm.reset();
            })
            .catch(err => {
                console.error("Log In Error Details:", err);
                displayAuthError(err.message);
            });
    }
});

logoutBtn.addEventListener('click', () => signOut(auth));

function displayAuthError(rawMsg) {
    authError.innerText = rawMsg.replace("Firebase: ", "");
    authError.classList.remove('hidden');
}

/* ==========================================================================
   CORE SCORECARD LOGIC ENGINE (BIRDIE OR BETTER SCORING RULESET)
   ========================================================================== */

function initScorecardElements() {
    const body = document.getElementById('scorecardBody');
    body.innerHTML = '';
    
    HiawathaCourseData.forEach(hd => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/40 transition-colors";
        const doublePar = hd.par * 2;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-slate-400">Hole ${hd.hole}</td>
            <td class="p-3 text-center font-black bg-slate-850/40 text-slate-300 border-x border-slate-750/30">${hd.par}</td>
            <td class="p-3 text-center font-mono font-medium text-xs text-slate-500 bg-slate-850/10">${hd.yards}</td>
            ${[0,1,2,3].map(pIdx => `
                <td class="p-1.5">
                    <input type="number" min="0" max="${doublePar}" data-hole="${hd.hole}" data-player="${pIdx}" 
                    class="score-input hole-${hd.hole} w-full bg-slate-950 border border-slate-700/80 rounded py-2 text-center font-black text-lg text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors" 
                    oninput="sendScoreToFirebase(this)">
                </td>
            `).join('')}
        `;
        body.appendChild(tr);
    });
}

window.sendScoreToFirebase = function(inputEl) {
    if (!auth.currentUser) return; // Fail-silent protection block
    
    const hole = parseInt(inputEl.dataset.hole);
    const playerIndex = inputEl.dataset.player;
    const holeSpecs = HiawathaCourseData.find(hd => hd.hole === hole);
    const maxAllowed = holeSpecs ? holeSpecs.par * 2 : 10; 

    let val = inputEl.value === "" ? null : parseInt(inputEl.value);

    // Hard Enforce 0-to-Double Par rules before dispatching database network syncs
    if (val !== null) {
        if (val < 0) { val = 0; inputEl.value = 0; }
        else if (val > maxAllowed) { val = maxAllowed; inputEl.value = maxAllowed; }
    }

    set(ref(db, `round/scores/hole_${hole}/p_${playerIndex}`), val);
};

window.sendConfigToFirebase = function() {
    if (!auth.currentUser) return;
    const potVal = parseFloat(document.getElementById('potPerHole').value) || 0;
    const pNames = Array.from(document.querySelectorAll('.player-name')).map(i => i.value || 'Player');
    set(ref(db, 'round/config'), { potPerHole: potVal, playerNames: pNames });
};

function startDatabaseRealtimeSync() {
    dbUnsubscribe = onValue(ref(db, 'round'), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.config) {
            if(document.activeElement !== document.getElementById('potPerHole')) {
                document.getElementById('potPerHole').value = data.config.potPerHole || 80;
            }
            const nameInputs = document.querySelectorAll('.player-name');
            const labels = document.querySelectorAll('.player-lbl');
            (data.config.playerNames || []).forEach((name, i) => {
                if(nameInputs[i] && document.activeElement !== nameInputs[i]) nameInputs[i].value = name;
                if(labels[i]) labels[i].innerText = name;
            });
        }

        if (data.scores) {
            document.querySelectorAll('.score-input').forEach(input => {
                if (document.activeElement === input) return; 
                const h = input.dataset.hole;
                const p = input.dataset.player;
                input.value = (data.scores[`hole_${h}`] && data.scores[`hole_${h}`][`p_${p}`]) ? data.scores[`hole_${h}`][`p_${p}`] : '';
            });
        }

        localCalculateEngine(data);
    });
}

function localCalculateEngine(data) {
    const totalRoundPot = (data.config && data.config.potPerHole) ? parseFloat(data.config.potPerHole) : 80;
    const players = (data.config && data.config.playerNames) ? data.config.playerNames : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    
    let skinsCount = {};
    let totalSkinsWon = 0;
    let payouts = {};
    
    players.forEach((p, idx) => { skinsCount[idx] = 0; payouts[idx] = 0; });
    document.getElementById('analysisLog').innerHTML = '';
    
    // Clear previous cell green highlights safely before calculation refresh loops
    document.querySelectorAll('.score-input').forEach(el => el.classList.remove('skin-winner-cell'));

    let roundSkinsDraft = [];

    HiawathaCourseData.forEach(hd => {
        const h = hd.hole;
        const holeData = data.scores ? data.scores[`hole_${h}`] : null;
        const targetPar = hd.par;
        let validHole = true;
        let holeScores = [];

        for (let pIdx = 0; pIdx < 4; pIdx++) {
            const scoreVal = holeData ? parseInt(holeData[`p_${pIdx}`]) : null;
            if (scoreVal === null || isNaN(scoreVal)) validHole = false;
            holeScores.push({ playerIndex: pIdx, score: scoreVal });
        }

        if (!validHole) {
            createLogEntry(h, `Scores incomplete`, `Awaiting data`, 'text-slate-500');
            return;
        }

        const minScore = Math.min(...holeScores.map(s => s.score));
        const lowest = holeScores.filter(s => s.score === minScore);

        // Core Requirement Rule: Score must be strictly lone lowest AND lower than par (Birdie or better)
        if (lowest.length === 1 && minScore < targetPar) {
            const winnerIdx = lowest[0].playerIndex;
            skinsCount[winnerIdx]++;
            totalSkinsWon++;
            
            const matchEl = document.querySelector(`[data-hole="${h}"][data-player="${winnerIdx}"]`);
            if (matchEl) matchEl.classList.add('skin-winner-cell');

            const scoreRelation = (targetPar - minScore === 1) ? 'Birdie' : 'Eagle+';
            roundSkinsDraft.push({ hole: h, msg: `${players[winnerIdx]} carded a ${scoreRelation} (${minScore})`, winnerName: players[winnerIdx] });
        } else {
            createLogEntry(h, lowest.length === 1 ? `Par (${minScore}) cannot secure skin` : `Halved at ${minScore}`, `No Skin`, 'text-slate-400');
        }
    });

    const skinValue = totalSkinsWon > 0 ? (totalRoundPot / totalSkinsWon) : 0;
    roundSkinsDraft.forEach(skin => createLogEntry(skin.hole, skin.msg, `Pays $${skinValue.toFixed(2)}`, 'text-emerald-400 font-bold bg-emerald-950/20 border-emerald-900/50'));

    if (totalSkinsWon > currentSkinsCountGlobal && currentSkinsCountGlobal !== 0) {
        const latestSkin = roundSkinsDraft[roundSkinsDraft.length - 1];
        if (latestSkin) triggerInAppNotification(`🔥 Skin Secured on Hole ${latestSkin.hole} by ${latestSkin.winnerName}!`);
    }
    currentSkinsCountGlobal = totalSkinsWon;

    players.forEach((p, idx) => { payouts[idx] = skinsCount[idx] * skinValue; });
    renderLedger(players, skinsCount, payouts, totalRoundPot, totalSkinsWon);
}

function createLogEntry(holeNum, text, status, wrapperClasses = '') {
    const logContainer = document.getElementById('analysisLog');
    const item = document.createElement('div');
    item.className = `flex justify-between p-2.5 bg-slate-900/40 rounded border border-slate-700/60 ${wrapperClasses}`;
    item.innerHTML = `<span><strong>Hole ${holeNum}:</strong> ${text}</span> <span class="text-xs font-mono font-medium opacity-90 self-center">${status}</span>`;
    logContainer.appendChild(item);
}

function renderLedger(players, skins, payouts, totalPot, totalSkinsWon) {
    document.getElementById('totalPotDisplay').innerText = `Total Pot: $${totalPot} (${totalSkinsWon} Skins Found)`;
    const container = document.getElementById('payoutContainer');
    container.innerHTML = '';
    
    players.forEach((player, idx) => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center bg-slate-900/50 p-3.5 rounded-xl border border-slate-700/80";
        row.innerHTML = `
            <div>
                <div class="font-extrabold text-slate-200 tracking-wide">${player}</div>
                <div class="text-xs text-slate-400 mt-0.5">${skins[idx]} Skin(s) Registered</div>
            </div>
            <div class="text-2xl font-mono font-black ${payouts[idx] > 0 ? 'text-emerald-400' : 'text-slate-600'}">
                $${payouts[idx].toFixed(2)}
            </div>
        `;
        container.appendChild(row);
    });
}

function triggerInAppNotification(message) {
    const banner = document.getElementById('notificationBanner');
    const text = document.getElementById('notificationText');
    text.innerText = message;
    banner.classList.remove('opacity-0', 'pointer-events-none');
    banner.classList.add('opacity-100');
    setTimeout(() => {
        banner.classList.remove('opacity-100');
        banner.classList.add('opacity-0', 'pointer-events-none');
    }, 4000);
}
