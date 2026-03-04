const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

app.use(express.static('public'));

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getOrCreateRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      hostId: null,
      participants: new Map(),
      questions: [],
      currentQuestion: -1,
      hasStarted: false,
      answersByQuestion: new Map(),
      scoreboard: new Map()
    });
  }
  return rooms.get(code);
}

function buildDistractors(room, questionIndex, goodAnswer) {
  const candidates = room.questions
    .map((q, idx) => (idx !== questionIndex ? q.answer.trim() : null))
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const generated = [
    `${goodAnswer} (version remix)`,
    `${goodAnswer} en acoustique`,
    `${goodAnswer} - édition live`,
    `${goodAnswer} (fausse piste)`
  ];

  const merged = [...candidates, ...generated]
    .filter((v) => v.toLowerCase() !== goodAnswer.toLowerCase())
    .filter((v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);

  const distractors = [];
  while (merged.length && distractors.length < 3) {
    const pick = Math.floor(Math.random() * merged.length);
    distractors.push(merged.splice(pick, 1)[0]);
  }

  while (distractors.length < 3) {
    distractors.push(`Proposition ${distractors.length + 2}`);
  }

  return distractors;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function currentLeaderboard(room) {
  return [...room.scoreboard.entries()]
    .map(([socketId, score]) => ({
      name: room.participants.get(socketId)?.name || 'Joueur',
      score
    }))
    .sort((a, b) => b.score - a.score);
}

io.on('connection', (socket) => {
  socket.on('host:createRoom', (_, callback) => {
    let code = randomRoomCode();
    while (rooms.has(code)) {
      code = randomRoomCode();
    }

    const room = getOrCreateRoom(code);
    room.hostId = socket.id;
    room.hasStarted = false;
    socket.join(code);

    callback({ roomCode: code });
  });

  socket.on('host:setQuestions', ({ roomCode, questions }, callback) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) {
      callback({ ok: false, message: 'Salle introuvable.' });
      return;
    }

    room.questions = questions
      .filter((q) => q.prompt?.trim() && q.answer?.trim())
      .map((q) => ({ prompt: q.prompt.trim(), answer: q.answer.trim() }));
    room.currentQuestion = -1;
    room.answersByQuestion.clear();
    room.scoreboard.forEach((_, key) => room.scoreboard.set(key, 0));

    callback({ ok: true, questionCount: room.questions.length });
    io.to(roomCode).emit('game:questionsUpdated', { questionCount: room.questions.length });
  });

  socket.on('player:join', ({ roomCode, name }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) {
      callback({ ok: false, message: 'Code de salle invalide.' });
      return;
    }

    room.participants.set(socket.id, { name: name?.trim() || 'Joueur' });
    room.scoreboard.set(socket.id, room.scoreboard.get(socket.id) || 0);
    socket.join(roomCode);

    callback({ ok: true, started: room.hasStarted });
    io.to(room.hostId).emit('host:players', {
      players: [...room.participants.values()].map((p) => p.name)
    });
  });

  socket.on('host:startGame', ({ roomCode }, callback) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) {
      callback({ ok: false, message: 'Salle introuvable.' });
      return;
    }

    if (!room.questions.length) {
      callback({ ok: false, message: 'Ajoutez au moins une question.' });
      return;
    }

    room.hasStarted = true;
    room.currentQuestion = -1;
    room.answersByQuestion.clear();
    room.scoreboard.forEach((_, key) => room.scoreboard.set(key, 0));
    io.to(roomCode).emit('game:started', { totalQuestions: room.questions.length });
    callback({ ok: true });
  });

  socket.on('host:nextQuestion', ({ roomCode }, callback) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) {
      callback({ ok: false, message: 'Salle introuvable.' });
      return;
    }

    const next = room.currentQuestion + 1;
    if (next >= room.questions.length) {
      const leaderboard = currentLeaderboard(room);
      io.to(roomCode).emit('game:finished', { leaderboard });
      callback({ ok: true, done: true });
      return;
    }

    room.currentQuestion = next;
    const question = room.questions[next];
    const wrong = buildDistractors(room, next, question.answer);
    const choices = shuffle([question.answer, ...wrong]);
    room.answersByQuestion.set(next, new Map());

    io.to(roomCode).emit('game:question', {
      index: next + 1,
      total: room.questions.length,
      prompt: question.prompt,
      choices
    });

    callback({ ok: true, done: false });
  });

  socket.on('player:answer', ({ roomCode, choice }, callback) => {
    const room = rooms.get(roomCode);
    if (!room || room.currentQuestion < 0) {
      callback({ ok: false, message: 'Aucune question active.' });
      return;
    }

    const answers = room.answersByQuestion.get(room.currentQuestion);
    if (!answers || answers.has(socket.id)) {
      callback({ ok: false, message: 'Réponse déjà envoyée.' });
      return;
    }

    answers.set(socket.id, choice);

    callback({ ok: true });
  });

  socket.on('host:reveal', ({ roomCode }, callback) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.currentQuestion < 0) {
      callback({ ok: false, message: 'Impossible de révéler.' });
      return;
    }

    const question = room.questions[room.currentQuestion];
    const answers = room.answersByQuestion.get(room.currentQuestion) || new Map();
    answers.forEach((choice, playerId) => {
      if (choice === question.answer) {
        room.scoreboard.set(playerId, (room.scoreboard.get(playerId) || 0) + 1);
      }
    });

    const leaderboard = currentLeaderboard(room);
    io.to(roomCode).emit('game:reveal', {
      correctAnswer: question.answer,
      leaderboard
    });

    callback({ ok: true });
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, code) => {
      if (room.hostId === socket.id) {
        io.to(code).emit('game:stopped', { message: 'Le maître du jeu a quitté la partie.' });
        rooms.delete(code);
        return;
      }

      if (room.participants.delete(socket.id)) {
        room.scoreboard.delete(socket.id);
        io.to(room.hostId).emit('host:players', {
          players: [...room.participants.values()].map((p) => p.name)
        });
      }

      if (!room.participants.size && !room.hostId) {
        rooms.delete(code);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Blind test app running on http://localhost:${PORT}`);
});
