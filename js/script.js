const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const themeLabel = document.querySelector('.theme-label');
const menuButton = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const resumeDialog = document.getElementById('resume-dialog');
const scheduleDialog = document.getElementById('schedule-dialog');
const terminalDialog = document.getElementById('terminal-dialog');
const terminalInput = document.getElementById('terminal-input');
const terminalOutput = document.getElementById('terminal-output');

const preferredTheme = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function setTheme(theme) {
    root.dataset.theme = theme;
    const isDark = theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(isDark));
    themeLabel.textContent = isDark ? 'Light' : 'Dark';
    if (window.lastSimulation) drawDistribution(window.lastSimulation);
}

setTheme(preferredTheme);

themeButton.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
});

menuButton.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.textContent = isOpen ? 'Close' : 'Menu';
});

navLinks.addEventListener('click', (event) => {
    if (event.target.matches('a, button')) {
        navLinks.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.textContent = 'Menu';
    }
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
document.getElementById('year').textContent = new Date().getFullYear();

function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
}

document.querySelectorAll('[data-open-resume]').forEach((button) => button.addEventListener('click', () => openDialog(resumeDialog)));
document.querySelectorAll('[data-open-schedule]').forEach((button) => button.addEventListener('click', () => openDialog(scheduleDialog)));
document.querySelectorAll('[data-open-terminal]').forEach((button) => button.addEventListener('click', () => {
    openDialog(terminalDialog);
    requestAnimationFrame(() => terminalInput.focus());
}));
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
}));

// Project lab tabs
const labTabs = [...document.querySelectorAll('[role="tab"]')];
labTabs.forEach((tab) => tab.addEventListener('click', () => {
    labTabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute('aria-selected', String(selected));
        document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
    });
    if (tab.id === 'options-tab' && window.lastSimulation) drawDistribution(window.lastSimulation);
}));

// Monte Carlo demo
const simulationInputs = {
    spot: document.getElementById('spot'),
    strike: document.getElementById('strike'),
    volatility: document.getElementById('volatility'),
    days: document.getElementById('days')
};

function normalRandom() {
    const u = Math.max(Math.random(), Number.EPSILON);
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function runSimulation() {
    const spot = Number(simulationInputs.spot.value);
    const strike = Number(simulationInputs.strike.value);
    const volatility = Number(simulationInputs.volatility.value) / 100;
    const time = Number(simulationInputs.days.value) / 365;
    const rate = 0.04;
    const prices = [];
    let payoffTotal = 0;

    for (let index = 0; index < 10000; index += 1) {
        const terminal = spot * Math.exp((rate - volatility ** 2 / 2) * time + volatility * Math.sqrt(time) * normalRandom());
        prices.push(terminal);
        payoffTotal += Math.max(terminal - strike, 0);
    }

    const value = Math.exp(-rate * time) * payoffTotal / prices.length;
    document.getElementById('option-price').textContent = value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    document.getElementById('simulation-note').textContent = `10,000 paths · ${simulationInputs.days.value} days`;
    window.lastSimulation = prices;
    drawDistribution(prices);
}

function drawDistribution(prices) {
    const canvas = document.getElementById('price-chart');
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const sorted = [...prices].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * .01)];
    const high = sorted[Math.floor(sorted.length * .99)];
    const binCount = 30;
    const bins = Array(binCount).fill(0);

    prices.forEach((price) => {
        const position = Math.floor((price - low) / (high - low) * binCount);
        if (position >= 0 && position < binCount) bins[position] += 1;
    });

    const max = Math.max(...bins);
    const gap = 4;
    const barWidth = (width - gap * (binCount - 1)) / binCount;
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(root).getPropertyValue('--accent').trim();
    bins.forEach((count, index) => {
        const barHeight = (count / max) * (height - 32);
        context.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
    });
}

function syncSimulationLabels() {
    document.getElementById('spot-output').textContent = `$${simulationInputs.spot.value}`;
    document.getElementById('strike-output').textContent = `$${simulationInputs.strike.value}`;
    document.getElementById('vol-output').textContent = `${simulationInputs.volatility.value}%`;
    document.getElementById('days-output').textContent = simulationInputs.days.value;
}

Object.values(simulationInputs).forEach((input) => input.addEventListener('input', syncSimulationLabels));
document.getElementById('run-simulation').addEventListener('click', runSimulation);
runSimulation();

// Connect Four demo
const rows = 6;
const columns = 7;
let board = Array.from({ length: rows }, () => Array(columns).fill(0));
let gameOver = false;
let aiThinking = false;
const boardElement = document.getElementById('connect-board');
const gameStatus = document.getElementById('game-status');

function openRow(state, column) {
    for (let row = rows - 1; row >= 0; row -= 1) if (state[row][column] === 0) return row;
    return -1;
}

function winningState(state, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            if (state[row][column] !== player) continue;
            for (const [rowStep, columnStep] of directions) {
                let connected = 1;
                for (let step = 1; step < 4; step += 1) {
                    const nextRow = row + rowStep * step;
                    const nextColumn = column + columnStep * step;
                    if (state[nextRow]?.[nextColumn] === player) connected += 1;
                    else break;
                }
                if (connected === 4) return true;
            }
        }
    }
    return false;
}

const moveOrder = [3, 2, 4, 1, 5, 0, 6];

function validMoves(state) {
    return moveOrder.filter((column) => openRow(state, column) >= 0);
}

function scoreWindow(values) {
    const humanCount = values.filter((value) => value === 1).length;
    const aiCount = values.filter((value) => value === 2).length;
    const points = [0, 1, 10, 100, 1000];
    return points[aiCount] - points[humanCount];
}

function evaluateBoard(state) {
    let score = 0;
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column <= columns - 4; column += 1) score += scoreWindow([0, 1, 2, 3].map((step) => state[row][column + step]));
    }
    for (let row = 0; row <= rows - 4; row += 1) {
        for (let column = 0; column < columns; column += 1) score += scoreWindow([0, 1, 2, 3].map((step) => state[row + step][column]));
    }
    for (let row = 0; row <= rows - 4; row += 1) {
        for (let column = 0; column <= columns - 4; column += 1) score += scoreWindow([0, 1, 2, 3].map((step) => state[row + step][column + step]));
    }
    for (let row = 3; row < rows; row += 1) {
        for (let column = 0; column <= columns - 4; column += 1) score += scoreWindow([0, 1, 2, 3].map((step) => state[row - step][column + step]));
    }
    return score;
}

function minimax(state, depth, alpha, beta, maximizing) {
    if (winningState(state, 2)) return 1000000 + depth;
    if (winningState(state, 1)) return -1000000 - depth;
    const moves = validMoves(state);
    if (depth === 0 || moves.length === 0) return evaluateBoard(state);

    if (maximizing) {
        let value = -Infinity;
        for (const column of moves) {
            const row = openRow(state, column);
            state[row][column] = 2;
            value = Math.max(value, minimax(state, depth - 1, alpha, beta, false));
            state[row][column] = 0;
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return value;
    }

    let value = Infinity;
    for (const column of moves) {
        const row = openRow(state, column);
        state[row][column] = 1;
        value = Math.min(value, minimax(state, depth - 1, alpha, beta, true));
        state[row][column] = 0;
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
    }
    return value;
}

function bestAIMove() {
    let bestScore = -Infinity;
    let bestColumn = validMoves(board)[0];
    for (const column of validMoves(board)) {
        const row = openRow(board, column);
        board[row][column] = 2;
        const score = minimax(board, 5, -Infinity, Infinity, false);
        board[row][column] = 0;
        if (score > bestScore) {
            bestScore = score;
            bestColumn = column;
        }
    }
    return bestColumn;
}

function renderBoard() {
    boardElement.innerHTML = '';
    board.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `connect-cell${cell === 1 ? ' player' : ''}${cell === 2 ? ' ai' : ''}`;
        button.setAttribute('role', 'gridcell');
        button.setAttribute('aria-label', `Row ${rowIndex + 1}, column ${columnIndex + 1}${cell === 1 ? ', your piece' : cell === 2 ? ', computer piece' : ', empty'}`);
        button.disabled = gameOver || aiThinking || openRow(board, columnIndex) < 0;
        button.addEventListener('click', () => playColumn(columnIndex));
        boardElement.appendChild(button);
    }));
}

function finishTurn(player) {
    if (winningState(board, player)) {
        gameOver = true;
        gameStatus.textContent = player === 1 ? 'You connected four' : 'Browser wins this round';
        renderBoard();
        return true;
    }
    if (board.every((row) => row.every(Boolean))) {
        gameOver = true;
        gameStatus.textContent = 'Draw game';
        renderBoard();
        return true;
    }
    return false;
}

function playColumn(column) {
    if (gameOver || aiThinking) return;
    const row = openRow(board, column);
    if (row < 0) return;
    board[row][column] = 1;
    if (finishTurn(1)) return;
    aiThinking = true;
    gameStatus.textContent = 'Browser is thinking…';
    renderBoard();
    window.setTimeout(() => {
        const move = bestAIMove();
        board[openRow(board, move)][move] = 2;
        aiThinking = false;
        if (!finishTurn(2)) {
            gameStatus.textContent = 'Your move';
            renderBoard();
        }
    }, 360);
}

document.getElementById('reset-game').addEventListener('click', () => {
    board = Array.from({ length: rows }, () => Array(columns).fill(0));
    gameOver = false;
    aiThinking = false;
    gameStatus.textContent = 'Your move';
    renderBoard();
});
renderBoard();

// Scheduling request
const dateOptions = document.getElementById('date-options');
const candidateDates = [];
const cursor = new Date();
cursor.setDate(cursor.getDate() + 1);
while (candidateDates.length < 3) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) candidateDates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
}

candidateDates.forEach((date, index) => {
    const label = document.createElement('label');
    const value = date.toISOString().slice(0, 10);
    const display = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    label.innerHTML = `<input type="radio" name="date" value="${value}" ${index === 0 ? 'required' : ''}><span>${display}</span>`;
    dateOptions.appendChild(label);
});

document.getElementById('schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = new Date(`${data.get('date')}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const subject = encodeURIComponent(`30-minute call request from ${data.get('visitorName')}`);
    const body = encodeURIComponent(`Hi Jacob,\n\nI'd like to request a 30-minute call on ${date} at ${data.get('time')} Pacific time.\n\nBest,\n${data.get('visitorName')}`);
    window.location.href = `mailto:jmcgreen07@gmail.com?subject=${subject}&body=${body}`;
});

// Portfolio terminal
const terminalCommands = {
    help: () => ['Available commands:', 'about · experience · projects · lab · skills', 'resume · schedule · contact · theme · clear'],
    whoami: () => ['visitor — currently exploring Jacob McGreen’s portfolio'],
    about: () => navigateTo('about'),
    experience: () => navigateTo('experience'),
    projects: () => navigateTo('work'),
    lab: () => navigateTo('lab'),
    skills: () => ['Python, Java, C++, C, TypeScript, JavaScript, SQL, React', 'Spring, FastAPI, Next.js, Angular, AWS, MongoDB'],
    resume: () => { terminalDialog.close(); openDialog(resumeDialog); return []; },
    schedule: () => { terminalDialog.close(); openDialog(scheduleDialog); return []; },
    contact: () => ['Email: jmcgreen07@gmail.com', 'Location: Palo Alto Networks HQ · Santa Clara, California'],
    theme: () => { themeButton.click(); return [`Theme changed to ${root.dataset.theme}.`]; },
    clear: () => { terminalOutput.innerHTML = ''; return []; }
};

function navigateTo(id) {
    terminalDialog.close();
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
    return [];
}

function printTerminal(lines, className = '') {
    lines.forEach((line) => {
        const paragraph = document.createElement('p');
        paragraph.className = className;
        paragraph.textContent = line;
        terminalOutput.appendChild(paragraph);
    });
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

document.getElementById('terminal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const command = terminalInput.value.trim().toLowerCase();
    if (!command) return;
    printTerminal([`$ ${command}`], 'command');
    terminalInput.value = '';
    if (terminalCommands[command]) printTerminal(terminalCommands[command]());
    else printTerminal([`Command not found: ${command}. Type “help”.`], 'error');
});

document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openDialog(terminalDialog);
        requestAnimationFrame(() => terminalInput.focus());
    }
});
