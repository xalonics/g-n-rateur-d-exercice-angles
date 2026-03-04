const socket = io();

let roomCode = '';

const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const joinForm = document.getElementById('join-form');
const statusEl = document.getElementById('join-status');
const questionTitleEl = document.getElementById('question-title');
const choicesEl = document.getElementById('choices');
const feedbackEl = document.getElementById('feedback');
const leaderboardEl = document.getElementById('leaderboard');

const params = new URLSearchParams(window.location.search);
if (params.has('room')) {
  roomInput.value = params.get('room');
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  roomCode = roomInput.value.trim().toUpperCase();

  socket.emit('player:join', { roomCode, name: nameInput.value.trim() }, (res) => {
    statusEl.textContent = res.ok ? 'Connecté ! En attente du lancement.' : res.message;
  });
});

function renderLeaderboard(entries) {
  leaderboardEl.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${entry.name} : ${entry.score}`;
    leaderboardEl.appendChild(li);
  });
}

socket.on('game:started', () => {
  statusEl.textContent = 'La partie commence !';
});

socket.on('game:question', ({ prompt, choices, index, total }) => {
  feedbackEl.textContent = '';
  questionTitleEl.textContent = `Q${index}/${total} — ${prompt}`;
  choicesEl.innerHTML = '';

  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = choice;
    btn.addEventListener('click', () => {
      socket.emit('player:answer', { roomCode, choice }, (res) => {
        feedbackEl.textContent = res.ok ? 'Réponse envoyée ✅' : res.message;
      });
    });
    choicesEl.appendChild(btn);
  });
});

socket.on('game:reveal', ({ correctAnswer, leaderboard }) => {
  feedbackEl.textContent = `Bonne réponse : ${correctAnswer}`;
  renderLeaderboard(leaderboard);
});

socket.on('game:finished', ({ leaderboard }) => {
  questionTitleEl.textContent = 'Partie terminée 🏁';
  choicesEl.innerHTML = '';
  renderLeaderboard(leaderboard);
});

socket.on('game:stopped', ({ message }) => {
  statusEl.textContent = message;
  choicesEl.innerHTML = '';
});
