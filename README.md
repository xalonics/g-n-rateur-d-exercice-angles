# Blind Test Physique (orchestre)

Application multijoueur simple :
- Le maître du jeu crée une salle et partage un QR code.
- Les participants rejoignent depuis leur téléphone.
- Le maître du jeu prépare les questions à l'avance (question + bonne réponse/titre).
- À chaque question, l'application affiche 4 propositions : 1 bonne + 3 mauvaises générées automatiquement.

## Lancer

```bash
npm install
npm start
```

Puis ouvrir :
- `http://localhost:3000/host.html` pour le maître du jeu
- `http://localhost:3000/join.html` pour un participant
