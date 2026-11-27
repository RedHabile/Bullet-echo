# Architecture de THE HOLLOW

Ce document décrit comment le jeu tient ensemble. Tout le code de jeu vit dans
`src/game/` (modules TypeScript purs, sans React) ; React (`src/components/`)
n'orchestre que les écrans, le HUD et la boucle réseau.

## 1. Boucle de jeu

- `Game.tsx` crée une seule instance de `Engine`, `Renderer` et `InputManager`.
- Une `requestAnimationFrame` unique appelle `engine.update(dt, inputs)` puis
  `renderer.render(engine, dt)`. Le HUD React est rafraîchi ~12 fois/s
  (toutes les 5 frames) — jamais à 60 Hz.
- `dt` est plafonné (1/25 s) et modulé par `slowMo` (ralenti de mort) et
  `hitStop` (gel d'impact).

## 2. Simulation (`engine.ts`)

- **Survivant** : accération/friction, endurance (sprint bruyant), cachettes
  dans les casiers (avec témoin → le bot vient ouvrir), taser (cône + LOS →
  étourdissement 2,5 s), fusée (zone lumineuse répulsive pour le bot).
- **Boucher bot** : machine à états `dormant → patrol → investigate → chase →
  search → ripopen → stunned`. Pathfinding **BFS sur grille** re-calculé
  périodiquement, audition via événements de bruit, vue par cône + LOS.
- **Boucher humain** (en ligne) : frappe avec fente, sens (révèle le survivant
  à travers les murs, 12 s de recharge).
- **Score** : fusibles 250, chaînes +50×n, frôlements +50, parades +100,
  évasion 1000, bonus de temps, multiplicateur cauchemar ×1,5 (solo).

## 3. Rendu (`render.ts`, `sprites.ts`)

- Le monde (sol texturé, murs **2.5D** extrudés, mobilier solide, graffitis,
  puits de lune) est **pré-cuit une fois** dans un canvas hors-écran par carte.
- L'éclairage est un calque noir percé en `destination-out` :
  - cône de lampe = **éventail de rayons** (`castFan`) → polygone occlus par les murs ;
  - halo ambiant, fusibles, lampes vacillantes, fusées, porte.
- Post-FX : brume dérivante, poussières additives, vignette + pulsation rouge
  synchronisée au battement de cœur, grain de film, stingers chromatiques.
- Les personnages sont dessinés par `sprites.ts`, **paramétrés par skin** —
  les mêmes fonctions servent aux aperçus animés de la boutique.

## 4. Audio (`audio.ts`)

Tout est synthétisé en WebAudio : drone (2 sinus désaccordés + bruit filtré),
battement de cœur planifié selon le danger, pas, cloches de pickup (tierce
mineure), stings (grappes de scies), cri de mort, taser, fusée, porte, évasion.
Compresseur en sortie. Reprise du contexte au premier geste utilisateur.

## 5. Multijoueur (`net.ts`, `server/sessions.ts`, routes `/api/session`)

- **Sessions en mémoire** (`globalThis.Map`) : code 4 lettres, jetons hôte/invité,
  files de messages par camp, TTL 2 min d'inactivité / 1 h max.
- **Transport** : `GET /api/session/[code]` en SSE ; si le flux échoue 3 fois,
  le client passe en **polling 90 ms** (`?poll=1` vide la file). `POST` relaie
  les messages au camp opposé (les `state`/`input` en file ne gardent que le dernier).
- **Autorité** : l'hôte simule. Instantanés ~14 Hz (positions, drapeaux, fusibles,
  fusées, inventaire, événements). L'invité **prédit** son personnage localement
  (`moveAgent` + collisions) et corrige vers la position serveur (snap si > 90 px).
- **Entrées invité** : vecteur + sprint + **compteurs** d'actions (anti-perte).
- **Événements** (`pickup`, `kill`, `taser`, `gate`…) inclus dans les instantanés
  → l'invité rejoue sons/particules/stingers localement.
- **Cosmétiques** : l'hôte envoie son skin dans le `start`, l'invité répond
  `cosmetics` — chacun voit l'autre habillé.

## 6. Méta-jeu (`meta.ts`)

Profil `localStorage` (`hollow.profile.v1`) : âmes, skins possédés/équipés,
statistiques, quêtes du jour (3 tirées par graine de date, `mulberry32`),
prime quotidienne. Les courses solo et en ligne alimentent les quêtes —
le boucher ne valide pas les objectifs du survivant.

## 7. Base de données

Une seule table `hollow_scores` (Drizzle, `src/db/schema.ts`) pour le classement
mondial. Routes `force-dynamic` ; le build ne nécessite pas de base active.
Le healthcheck `/api/health` fait un `select 1`.

## 8. Performance

- Monde pré-cuit + calque lumière réutilisé + sprites de brume/grain pré-rendus.
- DPR plafonné à 2, particules plafonnées (~420), popups/stingers bornés.
- Aucune allocation de grille par frame ; BFS uniquement sur re-path du bot.
- React ne re-rend que le HUD (12 Hz) et les écrans ; le canvas fait le reste.
