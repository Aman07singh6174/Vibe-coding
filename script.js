const boardEl = document.getElementById('board');
const turnLabel = document.getElementById('turnLabel');
const moveCount = document.getElementById('moveCount');
const captureCount = document.getElementById('captureCount');
const lastAction = document.getElementById('lastAction');
const moveLog = document.getElementById('moveLog');
const impactOverlay = document.getElementById('impactOverlay');
const winnerOverlay = document.getElementById('winnerOverlay');
const winnerTitle = document.getElementById('winnerTitle');
const winnerReason = document.getElementById('winnerReason');
const game = new Chess();
let selected = null;
let captureTotal = 0;
let history = [];
const pieceGlyphs = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const unitRoles = { p: 'INF', n: 'CAV', b: 'CMD', r: 'FORT', q: 'HQ', k: 'GEN' };
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
let playMode = 'two-player';
let cpuLevel = 'easy';
let boardFlipped = false;
let cpuThinking = false;
let clockMinutes = 10;
let clockRemaining = { w: 600, b: 600 };
let clockRunning = false;
let clockExpired = false;
let clockInterval = null;
let gameSession = 0;
let lastMoveSquares = [];

function renderBoard() {
    boardEl.innerHTML = '';
    const board = game.board();
    board.forEach((row, rowIndex) => row.forEach((piece, colIndex) => {
        const actualRowIndex = boardFlipped ? 7 - rowIndex : rowIndex;
        const actualColIndex = boardFlipped ? 7 - colIndex : colIndex;
        const actualPiece = board[actualRowIndex][actualColIndex];
        const square = document.createElement('div');
        const squareName = `${files[actualColIndex]}${8 - actualRowIndex}`;
        square.className = `square ${(rowIndex + colIndex) % 2 ? 'dark' : 'light'}`;
        square.dataset.square = squareName;
        if (lastMoveSquares.includes(squareName)) square.classList.add('last-move');
        if (selected === squareName) square.classList.add('selected');
        if (selected) {
            const moves = game.moves({ square: selected, verbose: true });
            const candidate = moves.find(move => move.to === squareName);
            if (candidate) square.classList.add(candidate.captured ? 'capture-target' : 'legal');
        }
        if (actualPiece) {
            const pieceEl = document.createElement('span');
            pieceEl.className = `piece piece-${actualPiece.type} ${actualPiece.color === 'w' ? 'white-piece' : 'black-piece'}`;
            pieceEl.setAttribute('aria-label', `${actualPiece.color === 'w' ? 'White' : 'Black'} ${actualPiece.type}`);
            pieceEl.dataset.role = unitRoles[actualPiece.type];
            pieceEl.textContent = pieceGlyphs[actualPiece.type];
            square.appendChild(pieceEl);
        }
        square.addEventListener('click', () => handleSquare(squareName));
        boardEl.appendChild(square);
    }));
}

function handleSquare(square) {
    if (clockExpired || cpuThinking || (playMode === 'cpu' && game.turn() === 'b')) return;
    const piece = game.get(square);
    if (selected) {
        const move = game.moves({ square: selected, verbose: true }).find(candidate => candidate.to === square);
        if (move) {
            const notation = move.san;
            const captured = Boolean(move.captured);
            game.move({ from: selected, to: square, promotion: 'q' });
            lastMoveSquares = [selected, square];
            history.push({ notation, captured, from: selected, to: square });
            if (captured) { captureTotal++; showImpact(); }
            selected = null;
            startClock();
            updateStatus(notation, captured);
            renderBoard();
            if (playMode === 'cpu' && game.turn() === 'b' && !game.game_over()) makeCpuMove();
            return;
        }
    }
    if (piece && piece.color === game.turn()) selected = square;
    else selected = null;
    renderBoard();
}

function updateStatus(notation, captured) {
    const turn = game.turn() === 'w' ? 'WHITE' : 'BLACK';
    const checkmate = game.in_checkmate();
    turnLabel.textContent = game.game_over() ? (checkmate ? `${turn} CHECKMATED` : 'DRAWN GAME') : `${turn} TO MOVE`;
    moveCount.textContent = String(Math.ceil(game.history().length / 2)).padStart(2, '0');
    captureCount.textContent = String(captureTotal).padStart(2, '0');
    lastAction.textContent = captured ? `${notation} // UNIT DOWN` : `${notation} // LINE SHIFTED`;
    moveLog.innerHTML = history.map((item, index) => `<div class="log-row"><span class="move-num">${String(index + 1).padStart(2, '0')}</span><span class="${item.captured ? 'capture' : ''}">${item.notation}${item.captured ? '  ×' : ''}</span></div>`).join('');
    updateClockDisplay();
    if (checkmate) showWinner(turn === 'w' ? 'BLACK' : 'WHITE', 'BY CHECKMATE');
}

function showImpact() {
    impactOverlay.classList.remove('active');
    void impactOverlay.offsetWidth;
    impactOverlay.classList.add('active');
}

function makeCpuMove() {
    cpuThinking = true;
    const session = gameSession;
    turnLabel.textContent = 'CPU THINKING...';
    window.setTimeout(() => {
        if (session !== gameSession || clockExpired) { cpuThinking = false; return; }
        const moves = game.moves({ verbose: true });
        if (!moves.length) { cpuThinking = false; return; }
        const captures = moves.filter(move => move.captured);
        let choice = moves[Math.floor(Math.random() * moves.length)];
        if (cpuLevel !== 'easy' && captures.length) choice = captures[Math.floor(Math.random() * captures.length)];
        if (cpuLevel === 'hard') {
            choice = moves.sort((a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)))[0];
        }
        const notation = choice.san;
        const captured = Boolean(choice.captured);
        game.move({ from: choice.from, to: choice.to, promotion: 'q' });
        lastMoveSquares = [choice.from, choice.to];
        history.push({ notation, captured, cpu: true, from: choice.from, to: choice.to });
        if (captured) { captureTotal++; showImpact(); }
        cpuThinking = false;
        startClock();
        updateStatus(notation, captured);
        renderBoard();
    }, cpuLevel === 'hard' ? 650 : 350);
}

function formatClock(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function updateClockDisplay() {
    document.querySelector('#whiteClock strong').textContent = formatClock(clockRemaining.w);
    document.querySelector('#blackClock strong').textContent = formatClock(clockRemaining.b);
    document.getElementById('whiteClock').classList.toggle('active', game.turn() === 'w' && !clockExpired);
    document.getElementById('blackClock').classList.toggle('active', game.turn() === 'b' && !clockExpired);
}

function startClock() {
    if (clockRunning || clockExpired) return;
    clockRunning = true;
    clockInterval = window.setInterval(() => {
        const side = game.turn();
        clockRemaining[side] = Math.max(0, clockRemaining[side] - 1);
        updateClockDisplay();
        if (clockRemaining[side] === 0) {
            clockExpired = true;
            window.clearInterval(clockInterval);
            const winner = side === 'w' ? 'BLACK' : 'WHITE';
            turnLabel.textContent = `${winner} WINS ON TIME`;
            lastAction.textContent = `${side === 'w' ? 'WHITE' : 'BLACK'} CLOCK EXPIRED`;
            updateClockDisplay();
            showWinner(winner, 'ON TIME');
        }
    }, 1000);
}

function showWinner(winner, reason) {
    winnerTitle.textContent = `${winner} WINS`;
    winnerReason.textContent = reason;
    winnerOverlay.classList.add('visible');
    winnerOverlay.setAttribute('aria-hidden', 'false');
}

function hideWinner() {
    winnerOverlay.classList.remove('visible');
    winnerOverlay.setAttribute('aria-hidden', 'true');
}

function resetGame() {
    gameSession++;
    window.clearInterval(clockInterval);
    game.reset(); selected = null; captureTotal = 0; history = []; lastMoveSquares = []; cpuThinking = false;
    clockRemaining = { w: clockMinutes * 60, b: clockMinutes * 60 };
    clockRunning = false; clockExpired = false;
    hideWinner();
    turnLabel.textContent = 'WHITE TO MOVE'; moveCount.textContent = '01'; captureCount.textContent = '00';
    lastAction.textContent = playMode === 'cpu' ? 'Your move. The CPU is waiting.' : 'The board is yours.';
    moveLog.innerHTML = '<div class="empty-log">Make a move to begin<br>the combat log.</div>';
    updateClockDisplay();
    renderBoard();
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    playMode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
    document.getElementById('difficultyOptions').classList.toggle('is-hidden', playMode !== 'cpu');
    document.querySelector('.top-meta').lastChild.textContent = playMode === 'cpu' ? ' VS CPU' : ' LOCAL DUEL';
    resetGame();
}));
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
    cpuLevel = button.dataset.level;
    document.querySelectorAll('[data-level]').forEach(item => item.classList.toggle('active', item === button));
}));
document.querySelectorAll('[data-clock]').forEach(button => button.addEventListener('click', () => {
    clockMinutes = Number(button.dataset.clock);
    document.querySelectorAll('[data-clock]').forEach(item => item.classList.toggle('active', item === button));
    resetGame();
}));
document.getElementById('flipButton').addEventListener('click', () => {
    boardFlipped = !boardFlipped;
    document.querySelector('.file-labels').style.flexDirection = boardFlipped ? 'row-reverse' : 'row';
    document.querySelector('.rank-labels').style.flexDirection = boardFlipped ? 'column-reverse' : 'column';
    renderBoard();
});
document.getElementById('resetButton').addEventListener('click', resetGame);
document.getElementById('winnerButton').addEventListener('click', resetGame);
updateClockDisplay();
renderBoard();
