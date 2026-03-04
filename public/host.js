const socket = io();
let roomCode = '';
const questions = [];

const createBtn = document.getElementById('create-room');
const roomCodeEl = document.getElementById('room-code');
const qrEl = document.getElementById('qr');
const questionForm = document.getElementById('question-form');
const promptInput = document.getElementById('prompt');
const answerInput = document.getElementById('answer');
const listEl = document.getElementById('question-list');
const saveQuestionsBtn = document.getElementById('save-questions');
const playersEl = document.getElementById('players');
const statusEl = document.getElementById('host-status');
const startBtn = document.getElementById('start-game');
const nextBtn = document.getElementById('next-question');
const revealBtn = document.getElementById('reveal');
const leaderboardEl = document.getElementById('leaderboard');

function renderQuestions() {
  listEl.innerHTML = '';
  questions.forEach((q, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${q.prompt} → ${q.answer}`;
    listEl.appendChild(li);
  });
}

function renderLeaderboard(entries) {
  leaderboardEl.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${entry.name} : ${entry.score}`;
    leaderboardEl.appendChild(li);
  });
}

createBtn.addEventListener('click', () => {
  socket.emit('host:createRoom', {}, ({ roomCode: code }) => {
    roomCode = code;
    roomCodeEl.textContent = `Code de salle: ${code}`;
    const joinUrl = `${window.location.origin}/join.html?room=${code}`;
    qrEl.innerHTML = '';
    QRCode.toCanvas(joinUrl, { width: 180 }, (err, canvas) => {
      if (!err) {
        qrEl.appendChild(canvas);
      }
    });
    statusEl.textContent = 'Salle prête. Préparez vos questions.';
  });
});

questionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  questions.push({
    prompt: promptInput.value,
    answer: answerInput.value
  });
  promptInput.value = '';
  answerInput.value = '';
  renderQuestions();
});

saveQuestionsBtn.addEventListener('click', () => {
  if (!roomCode) {
    statusEl.textContent = 'Créez une salle avant de sauvegarder.';
    return;
  }

  socket.emit('host:setQuestions', { roomCode, questions }, (res) => {
    statusEl.textContent = res.ok
      ? `${res.questionCount} question(s) enregistrée(s).`
      : res.message;
  });
});

startBtn.addEventListener('click', () => {
  socket.emit('host:startGame', { roomCode }, (res) => {
    statusEl.textContent = res.ok ? 'Partie lancée ✅' : res.message;
  });
});

nextBtn.addEventListener('click', () => {
  socket.emit('host:nextQuestion', { roomCode }, (res) => {
    statusEl.textContent = res.done ? 'Partie terminée.' : 'Question envoyée.';
  });
});

revealBtn.addEventListener('click', () => {
  socket.emit('host:reveal', { roomCode }, (res) => {
    statusEl.textContent = res.ok ? 'Réponse révélée.' : res.message;
  });
});

socket.on('host:players', ({ players }) => {
  playersEl.textContent = players.join(', ') || '-';
});

socket.on('game:reveal', ({ leaderboard, correctAnswer }) => {
  statusEl.textContent = `Bonne réponse: ${correctAnswer}`;
  renderLeaderboard(leaderboard);
});

socket.on('game:finished', ({ leaderboard }) => {
  statusEl.textContent = 'Partie finie 🏁';
  renderLeaderboard(leaderboard);
});
