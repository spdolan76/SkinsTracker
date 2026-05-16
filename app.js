import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

const totalHoles = 18;

// Hardcoded Course Specifications: White Tees at The Links at Hiawatha Landing
const HiawathaCourseData = [
    { hole: 1, par: 4, yards: 375 }, { hole: 2, par: 4, yards: 377 }, { hole: 3, par: 3, yards: 149 },
    { hole: 4, par: 4, yards: 361 }, { hole: 5, par: 4, yards: 345 }, { hole: 6, par: 3, yards: 188 },
    { hole: 7, par: 5, yards: 476 }, { hole: 8, par: 4, yards: 375 }, { hole: 9, par: 5, yards: 453 },
    { hole: 10, par: 4, yards: 337 }, { hole: 11, par: 4, yards: 350 }, { hole: 12, par: 5, yards: 517 },
    { hole: 13, par: 3, yards: 144 }, { hole: 14, par: 4, yards: 322 }, { hole: 15, par: 4, yards: 401 },
    { hole: 16, par: 4, yards: 384 }, { hole: 17, par: 3, yards: 171 }, { hole: 18, par: 5, yards: 470 }
];

let currentSkinsCountGlobal = 0;

// Render basic input infrastructure matrix dynamically
function initScorecardElements() {
    const body = document.getElementById('scorecardBody');
    body.innerHTML = '';
    
    HiawathaCourseData.forEach(hd => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/40 transition-colors";
        tr.innerHTML = `
            <td class="p-3 font-semibold text-slate-400">Hole ${hd.hole}</td>
            <td class="p-3 text-center font-black bg-slate-850/40 text-slate-300 border-x border-slate-750/30">${hd.par}</td>
            <td class="p-3 text-center font-mono font-medium text-xs text-slate-500 bg-slate-850/10">${hd.yards}</td>
            ${[0,1,2,3].map(pIdx => `
                <td class="p-1.5">
                    <input type="number" min="1" max="15" data-hole="${hd.hole}" data-player="${pIdx}" 
                    class="score-input hole-${hd.hole} w-full bg-slate-950 border border-slate-700/80 rounded py-2 text-center font-black text-lg text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors" 
                    oninput="sendScoreToFirebase(this)">
                </td>
            `).join('')}
        `;
        body.appendChild(tr);
    });
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

// Event Stream Listener monitoring cloud realtime engine updates
onValue(ref(db, 'round'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Sync configuration details safely if fields aren't actively being typed in
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

    // Sync metrics safely
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

// Calculation Loop Engine enforcing Birdies or Better rule logic
function localCalculateEngine(data) {
    const totalRoundPot = (data.config && data.config.potPerHole) ? parseFloat(data.config.potPerHole) : 80;
    const players = (data.config && data.config.playerNames) ? data.config.playerNames : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    
    let skinsCount = {};
    let totalSkinsWon = 0;
    let payouts = {};
    
    players.forEach((p, idx) => { skinsCount[idx] = 0; payouts[idx] = 0; });

    const logContainer = document.getElementById('analysisLog');
    logContainer.innerHTML = '';
    
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
            if (!scoreVal || isNaN(scoreVal)) validHole = false;
            holeScores.push({ playerIndex: pIdx, score: scoreVal });
        }

        if (!validHole) {
            createLogEntry(h, `Scores incomplete`, `Awaiting data`, 'text-slate-500');
            return;
        }

        const minScore = Math.min(...holeScores.map(s => s.score));
        const lowest = holeScores.filter(s => s.score === minScore);

        // Under-par condition lock check
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
    });

    // Handle Split Payout distribution math across the pool
    const skinValue = totalSkinsWon > 0 ? (totalRoundPot / totalSkinsWon) : 0;

    roundSkinsDraft.forEach(skin => {
        createLogEntry(skin.hole, skin.msg, `Pays $${skinValue.toFixed(2)}`, 'text-emerald-400 font-bold bg-emerald-950/20 border-emerald-900/50');
    });

    // Trigger toast flag condition if a new skin registers 
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

// Kickstart Construction
initScorecardElements();
