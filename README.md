![THE HOLLOW — bureau d'admission de l'asile](public/images/menu-desk.jpg)

# THE HOLLOW 🕯️

**Chasse d'horreur dans le navigateur, en français.** Cinq fusibles. Une porte. Deux ailes de l'asile.
Et le boucher qui rôde — seul contre son IA, ou en **multijoueur en ligne** avec un ami : l'un chasse, l'autre survit.

![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f?logo=drizzle&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Licence](https://img.shields.io/badge/licence-MIT-a3122a)
<!-- Remplacez VOTRE-PSEUDO par votre compte GitHub pour activer le badge CI : -->
<!-- ![CI](https://github.com/VOTRE-PSEUDO/the-hollow/actions/workflows/ci.yml/badge.svg) -->

---

## ✨ Fonctionnalités

### 🔦 Le jeu
- **Horreur à éclairage dynamique** : faisceau de lampe occlus par les murs (raycasting), ténèbres quasi totales, lampes qui grésillent, puits de lune à travers les barreaux, brume, grain de film, poussières en suspension.
- **Le boucher** : IA qui patrouille, **entend vos pas de course**, poursuit à vue, fouille votre dernière position connue et **ouvre les casiers s'il vous a vu vous cacher**. Ses yeux rouges luisent à travers le noir.
- **Deux cartes** : *L'Asile* et *Les Cellules* — murs en 2.5D, mobilier solide (lits sanglés, tables de morgue, chaudière, étagères…) qui sert de couverture.
- **Armes** : ⚡ taser (étourdit le boucher, +100 pts de parade) et 🔥 fusée éclairante (le repousse, aveugle un joueur-boucher).
- **Feedback juteux** : screen shake, hit-stop, ralenti à la mort, particules, sang persistant, jumpscare, battement de cœur qui s'accélère avec la menace — **audio 100 % synthétisé** (WebAudio, zéro fichier son).
- **60 fps** desktop & mobile : monde pré-cuit, éclairage sur calque réutilisé, DPR plafonné, HUD React à ~12 Hz.
- **Contrôles** : clavier ZQSD/WASD + souris-free, **joystick flottant tactile** et boutons contextuels.

### 🌐 Multijoueur en ligne (sessions, pas de split-screen)
- Créez une session → **code à 4 lettres** à partager → l'ami rejoint depuis son appareil.
- Rôles au choix : 🕯️ Survivant ou 🔪 Boucher. **Vos skins sont visibles par l'adversaire.**
- Netcode : **hôte autoritaire** (~14 instantanés/s), **prédiction client + interpolation** côté invité, flux **SSE avec repli automatique en polling**, reconnexion, détection d'adversaire muet, revanche instantanée.

### 🗂️ Méta-jeu
- **Menu « bureau d'admission »** : dossiers, tampons, papier vieilli, lampe vacillante.
- **Quêtes journalières** (3 contrats/jour, graine liée à la date) + prime de connexion.
- **Monnaie d'âmes** : score ÷ 10, bonus d'évasion, victoires en ligne, contrats.
- **Marché noir** : 6 skins de survivant, 6 skins de boucher, 5 teintes de lampe — avec **aperçus animés en canvas**.
- **Dossier du patient** : statistiques complètes, nom consigné, **registre local + classement mondial PostgreSQL**.

## 🖼️ Aperçus

| L'asile de nuit | Le bureau d'admission | Ne le laissez pas vous trouver |
|---|---|---|
| ![couloir](public/images/menu-bg.jpg) | ![bureau](public/images/menu-desk.jpg) | ![jumpscare](public/images/jumpscare.jpg) |

## 🎮 Contrôles

| Action | Clavier | Tactile |
|---|---|---|
| Se déplacer | `ZQSD` / `WASD` / flèches | joystick flottant (moitié gauche) |
| Courir (bruyant !) | `MAJ` | bouton **COURIR** (maintenir) |
| Se cacher / sortir · frapper | `E` / `ESPACE` | **CACHER** / **FRAPPER** |
| Taser · fusée | `F` · `G` | **TASER** · **FUSÉE** |
| Sens du boucher | `Q` | **SENS** |
| Pause · son · rejouer | `ESC` · `M` · `R` | boutons HUD |

## 🚀 Démarrage rapide

```bash
git clone https://github.com/VOTRE-PSEUDO/the-hollow.git
cd the-hollow
npm install

# PostgreSQL local (ou utilisez Neon / Supabase / etc.)
docker run -d --name hollow-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app_db postgres:16-alpine

cp .env.example .env          # adaptez DATABASE_URL si besoin
npx drizzle-kit push          # crée la table du classement
npm run dev                   # http://localhost:3000
```

> 🔊 Casque conseillé, lumière éteinte. L'audio se débloque au premier clic (politique des navigateurs).

### Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run start` | serveur de production |
| `npm exec tsc -- --noEmit` | vérification TypeScript |
| `npx next typegen` | types des routes App Router |
| `npx drizzle-kit push` | applique le schéma à la base |

## 🧱 Stack & structure

**Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · Drizzle ORM · PostgreSQL · Canvas 2D · WebAudio · SSE**

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts          # sonde de santé (DB)
│   │   ├── scores/route.ts          # classement mondial (GET/POST)
│   │   └── session/
│   │       ├── route.ts             # créer / rejoindre une session
│   │       └── [code]/route.ts      # relais temps réel : SSE + polling + POST
│   ├── globals.css                  # thème horreur complet
│   ├── layout.tsx · page.tsx
├── components/
│   ├── Game.tsx                     # boucle de jeu, HUD, réseau, écrans
│   └── Menu.tsx                     # bureau d'admission, quêtes, boutique, dossier
├── game/
│   ├── engine.ts                    # simulation autoritaire + prédiction invité
│   ├── render.ts                    # monde pré-cuit 2.5D, éclairage raycast, post-FX
│   ├── sprites.ts                   # personnages paramétrés par skin
│   ├── map.ts                       # 2 plans, BFS, LOS, collisions
│   ├── audio.ts                     # synthèse WebAudio (drone, cœur, stings…)
│   ├── input.ts                     # clavier + joystick tactile
│   ├── net.ts                       # client de session (SSE → repli polling)
│   ├── meta.ts                      # profil, âmes, quêtes, skins (localStorage)
│   └── types.ts
├── server/sessions.ts               # sessions en mémoire (TTL, files de messages)
└── db/                              # client + schéma Drizzle
```

### 🌐 Comment marche le multijoueur
1. `POST /api/session` crée une session (code + jetons) ou rejoint.
2. Chaque camp ouvre `GET /api/session/[code]` en **SSE** ; si le flux est bloqué (proxy), le client bascule seul en **polling 90 ms**.
3. L'invité envoie ses entrées (~14 Hz, compteurs d'actions fiables) ; l'hôte simule et diffuse des instantanés ; l'invité **prédit son propre personnage** et corrige en douceur.
4. Événements (pickup, taser, kill, porte…) voyagent dans les instantanés → mêmes particules/sons des deux côtés.

## 📦 Déploiement

- **Solo + classement** : n'importe quel hébergeur Next.js + PostgreSQL (Vercel + Neon, etc.).
- **Multijoueur en ligne** : les sessions vivent **en mémoire du processus** → déployez sur un **serveur Node persistant** (Railway, Render, Fly.io, VPS…). Un Dockerfile est fourni :

```bash
docker build -t the-hollow .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://…" the-hollow
# puis appliquez le schéma une fois :
docker run --rm -e DATABASE_URL="postgresql://…" the-hollow npx drizzle-kit push
```

> ⚠️ Sur du serverless multi-instances, le mode en ligne ne fonctionnera pas de façon fiable (mémoire non partagée). Le solo, lui, fonctionne partout.

## 🗺️ Pistes d'évolution
- Sessions persistantes (Redis) pour le serverless · matchmaking · spectateur
- Troisième carte · nouveaux objets (pièges à ours, générateurs)
- Manette (Gamepad API) · vibration fine · mode daltonien
- Classement hebdomadaire · succès (achievements)

## 🤝 Contribuer
Lisez [CONTRIBUTING.md](CONTRIBUTING.md) — branches, style de commits et la checklist de validation avant PR.
L'architecture détaillée vit dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 📄 Licence
[MIT](LICENSE) — faites-en bon usage. L'asile, lui, ne rend rien.
