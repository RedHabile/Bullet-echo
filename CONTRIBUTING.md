# Contribuer à THE HOLLOW

Merci de vouloir nourrir l'asile. 🕯️

## Mise en place

```bash
npm install
cp .env.example .env        # PostgreSQL local requis pour le classement
npx drizzle-kit push
npm run dev
```

## Règles du jeu (dev)

- **TypeScript strict** — pas de `any` sauvage, pas de `@ts-ignore`.
- Le code de jeu (`src/game/`) reste **sans React** ; React orchestre, le canvas exécute.
- 60 fps avant tout : pré-cuire ce qui est statique, borner les allocations par frame.
- Tout le texte visible est **en français**.
- Ne commitez **jamais** `.env` ni de secrets (le `.gitignore` est là pour ça).

## Branches & commits

- Branches : `feat/…`, `fix/…`, `docs/…`, `perf/…`.
- Commits impératifs et courts : `feat: ajoute le piège à ours`, `fix: fuite SSE à la reconnexion`.

## Checklist avant PR

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

- [ ] Les trois commandes passent.
- [ ] Solo testé : début de partie < 10 s, pause, restart `R`, fin, classement.
- [ ] En ligne testé à deux onglets : créer → rejoindre → chasse → revanche → quitter.
- [ ] Tactile vérifié (joystick + boutons) si vous touchez au HUD.
- [ ] Pas de régression de perf visible (compteur FPS mental : ça doit rester fluide).

## Signaler un bug

Ouvrez une issue avec : navigateur + appareil, mode (solo/en ligne), rôle,
étapes pour reproduire, et ce que le boucher a fait de vous.
