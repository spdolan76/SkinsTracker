import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// !!! PASTE YOUR COPIED CONFIG OBJECT DIRECTLY HERE FROM FIREBASE CONSOLE !!!
const firebaseConfig = {
  apiKey: "AIzaSyCidvULMz_g32saznq15q3lJrtnufd_xIo",
  authDomain: "golfleagueskins.firebaseapp.com",
  projectId: "golfleagueskins",
  storageBucket: "golfleagueskins.firebasestorage.app",
  messagingSenderId: "1079188950398",
  appId: "1:1079188950398:web:eeda309172314e79eb772f",
  measurementId: "G-RCWCWS954E"
};

// Initialize Cloud Connections
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const totalHoles = 18;
// Hardcoded Course Specifications: The Links at Hiawatha Landing (Par 72 layout)
const HiawathaPars = [
    4, 4, 4, 4, 3, 5, 4, 3, 5, // Front 9 (Par 36)
    4, 4, 4, 3, 4, 5, 4, 3, 5  // Back 9  (Par 36)
];

let currentSkinsCountGlobal = 0;

// Render basic input infrastructure markup
function initScorecardElements() {
    const body = document.getElementById('scorecardBody');
    body.innerHTML = '';
    for (let i = 1; i <= totalHoles; i++) {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/40 transition-colors";
        tr.innerHTML = `
            <td class="p-3 font-semibold text-slate-400">Hole ${i}</td>
            <td class="p-3 text-center font-bold bg-slate-850/40 text-slate-400">${HiawathaPars[i-1]}</td>
            ${[0,1,2,3].map(pIdx => `
                <td class="p-1.5">
                    <input type="number" min="1" max="15" data-hole="${i}" data-player="${pIdx}" 
                    class="score-input hole-${i} w-full bg-slate-950 border border-slate-700/80 rounded py-2 text-center font-black text-lg text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors" 
                    oninput="sendScoreToFirebase(this)">
                </td>
            `).join('')}
        `;
        body.appendChild(tr);
    }
}

// Bind handlers to window context to work with inline declarative DOM triggers
window.sendScoreToFirebase = function(inputEl) {
    const hole = inputEl.dataset.hole;
    const playerIndex = inputEl.dataset.player;
    const val = parseInt(inputEl.value) || null;
    set(ref(db, `round/scores/hole_${hole}/p_${playerIndex}`), val);
};

window.sendConfigToFirebase = function() {
    const potVal = parseFloat(document.getElementById('potPerHole').value) || 0;
    const pNames = Array.from(document.querySelectorAll('.player-name')).map(i => i.value || 'Player');
    set(ref(db, 'round/config'), { potPerHole: potVal, playerNames: pNames });
};

// Notification Toast Trigger 
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

// Event Stream Listener monitoring cloud realtime engine
onValue(ref(db, 'round'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Sync configuration details safely if not active input focus state
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

    // Sync metrics without changing ongoing entry coordinates
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

// Calculation Loop Engine containing Hiawatha Business Rules
function localCalculateEngine(data) {
    const totalRoundPot = (data.config && data.config.potPerHole) ? parseFloat(data.config.potPerHole) : 80;
    const players = (data.config && data.config.playerNames) ? data.config.playerNames : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    
    let skinsCount = {};
    let totalSkinsWon = 0;
    let payouts = {};
    
    players.forEach((p, idx) => { skinsCount[idx] = 0; payouts[idx] = 0; });

    const logContainer = document.getElementById('analysisLog');
    logContainer.innerHTML = '';
    
    // Clear styles
    document.querySelectorAll('.score-input').forEach(el => el.classList.remove('skin-winner-cell'));

    let roundSkinsDraft = [];

    for (let h = 1; h <= totalHoles; h++) {
        const holeData = data.scores ? data.scores[`hole_${h}`] : null;
        const targetPar = HiawathaPars[h - 1];
        let validHole = true;
        let holeScores = [];

        for (let pIdx = 0; pIdx < 4; pIdx++) {
            const scoreVal = holeData ? parseInt(holeData[`p_${pIdx}`]) : null;
            if (!scoreVal || isNaN(scoreVal)) validHole = false;
            holeScores.push({ playerIndex: pIdx, score: scoreVal });
        }

        if (!validHole) {
            createLogEntry(h, `Scores incomplete`, `Awaiting data`, 'text-slate-500');
            continue;
        }

        const minScore = Math.min(...holeScores.map(s => s.score));
        const lowest = holeScores.filter(s => s.score === minScore);

        // Under-par skin validation constraint check
        if (lowest.length === 1 && minScore < targetPar) {
            const winnerIdx = lowest[0].playerIndex;
            skinsCount[winnerIdx]++;
            totalSkinsWon++;
            
            const matchEl = document.querySelector(`[data-hole="${h}"][data-player="${winnerIdx}"]`);
            if (matchEl) matchEl.classList.add('skin-winner-cell');

            const scoreRelation = (targetPar - minScore === 1) ? 'Birdie' : 'Eagle+';
            roundSkinsDraft.push({ hole: h, msg: `${players[winnerIdx]} carded a ${scoreRelation} (${minScore})`, winnerName: players[winnerIdx] });
        } else {
            if (lowest.length === 1 && minScore === targetPar) {
                createLogEntry(h, `Par (${minScore}) cannot secure skin`, `No Skin`, 'text-slate-400');
            } else {
                createLogEntry(h, `Halved at ${minScore}`, `No Skin`, 'text-slate-400');
            }
        }
    }

    // Handle Split Payout distribution variables
    const skinValue = totalSkinsWon > 0 ? (totalRoundPot / totalSkinsWon) : 0;

    roundSkinsDraft.forEach(skin => {
        createLogEntry(skin.hole, skin.msg, `Pays $${skinValue.toFixed(2)}`, 'text-emerald-400 font-bold bg-emerald-950/20 border-emerald-900/50');
    });

    // Check if new skin event happened since last snapshot stream context update to fire push notification banner
    if (totalSkinsWon > currentSkinsCountGlobal && currentSkinsCountGlobal !== 0) {
        const latestSkin = roundSkinsDraft[roundSkinsDraft.length - 1];
        if (latestSkin) {
            triggerInAppNotification(`🔥 Skin Secured on Hole ${latestSkin.hole} by ${latestSkin.winnerName}!`);
        }
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

// Kickstart Layout Markup Construction
initScorecardElements();
