# The Layoff Games · 优化游戏 — Campus Royale / 产业园大逃杀

A 3D action battle royale about the AI boom: melee combos, a lock-on, a dodge with a
perfect-dodge slow-motion window, in a misty forest campus rendered with Three.js.
Thirty employees drop into a tech campus and there is one headcount left.
Search boxes, lockers and safes, stay inside the shrinking **optimization circle**,
then either catch a shuttle out with everything in your bag or be the last one employed.

**Parody and fiction.** Not affiliated with or endorsed by any person or company
named. Nobody gets hurt: they go up in a puff of smoke, or sign the severance papers.

## Play

No build step, no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

To get the whole game as one shareable file:

```bash
node tools/build-standalone.js
```

| | PC | Phone |
|---|---|---|
| Move | WASD / arrow keys | left stick |
| Light attack | left-click (hold to charge) | the big red button (hold to charge) |
| Heavy attack | right-click | keep tapping the red button: the string runs on into the launcher and the slam |
| Dodge roll | Space (no direction held = roll backwards) | dodge button |
| Lock on | Tab or middle-click | automatic (nearest target) |
| Skills | Q, E (or Shift), R; aimed at your lock or the cursor | skill buttons: tap to auto-aim, or drag to aim |
| Drink bubble tea (+50 HP) | F | tea button |
| Pause | Esc | ⏸ |

## Combat

The moveset borrows its shape from hunting-action games: committed swings, two attack
buttons that branch, a stamina bar, and big monsters you can knock over.

- **Light, light, light**: two sweeps and an overhead chop. (The stapler is quick and gets a
  fourth hit.)
- **Heavy** branches off wherever you are in the string: on its own it is a lunging
  **thrust**; after two lights it is a **launcher** that throws the target into the air;
  after a chop or another heavy it is a **leaping slam** with a shockwave.
- **Hold** light attack to charge through three levels, then release for a spin that grows
  with each level.
- **Stamina** (the yellow tube) pays for dodges, heavy attacks and charging, and comes back
  after a moment's rest.
- **Dodge** is a roll with a moment of invulnerability. Roll just as an attack is about to
  land and it is a **perfect dodge**: the world drops into slow motion, stamina comes back,
  and your next hit is a **counter** for extra damage. Attack straight out of any roll for
  a **dash cut**.
- **Toppling a boss.** Heavy hits fill the yellow bar under the boss's health. Fill it and
  the boss falls over for three seconds and takes half as much damage again.
- When your health is in the red the screen edge pulses, the bubble-tea button throbs and
  a prompt tells you to drink.
- **Q · Pass the Blame**: throw a wok in a line; the first thing it hits is stunned.
- **E · Clock-in Dash**: dash through enemies, hitting each once. Invulnerable mid-dash.
- **R · Labor Arbitration**: a very large Labor Law book lands on the target area and stuns.
- Hits land with hit-stop, screen shake, knockback, crits and a combo counter.
- Health creeps back when nothing has hit you for a few seconds, and no more than two
  rivals will press you at once.
- Rivals fight in melee too. A red wedge on the ground shows where a swing is about to
  land; senior rivals telegraph a dash strike with a red line. Step out or dodge.

On a phone the screen is laid out for thumbs from the first frame, in either orientation:
one attack button in the corner with dodge and the three skills fanned around it, bubble
tea at the bottom, pause by the minimap. The HUD keeps clear of notches and home bars,
menus shrink to fit a phone on its side, the 3D view renders fewer pixels and a smaller
shadow map, and the screen is kept awake during a match.

Camera effects are deliberately restrained: ordinary hits lean the camera slightly, only
heavy hits shake it, and the view eases into a small look-ahead as you run.

English and 中文 are both built in (toggle on the title screen).

## How a match works

- **Objectives.** There is always one thing to do next, shown under your health with a
  yellow arrow pointing the way and a reward for doing it: search two boxes, knock out
  two rivals, then go and make the nearest CEO sign, then the next one.
- **Promotions.** Knock-outs, boxes and signatures fill the ring around your weapon.
  Each grade up (P5 to P10) adds health and damage and heals you.
- **CEO entrances.** The first time you walk up to a CEO the fight pauses for a close-up.
  Any attack key skips it. Each CEO you beat leaves a stamp on the title screen for good.
- **Loot.** Stand next to a container to search it. Crates are everywhere; lockers sit at
  small work sites; safes are inside the five CEO plazas. Valuables come in six colour
  tiers, from a badge lanyard up to the red one: a **signed N+1 agreement**.
- **The circle.** The purple optimization circle shrinks in five phases over about five
  minutes and hurts more each phase. The minimap shows the next circle as a dashed ring.
- **Rivals.** The other 29 employees loot, rotate with the circle, fight you and each
  other, flee when hurt, and sometimes take the shuttle themselves. Tall grass hides you
  from them until you shoot.
- **Extract or win.** Shuttles arrive 40 seconds in. Stand at a stop for 5 seconds to
  bank everything you carry into your severance fund, which buys better starting kits.
  Or be the last one standing for a bonus. Get optimized and you lose what you carried.
- **CEOs.** Each plaza has a boss who only wakes when you walk in. Every attack is
  telegraphed. Beat one and they sign: you get the red item, and their AI switches sides.

| Plaza | Boss | Signature moves | Guards → sidekick |
|---|---|---|---|
| Penguin Tower | 马花藤 · Ponny | red-envelope fans, penguin squads, the gauntlet snap | penguins |
| Infinite Scroll Inc. | 张二鸣 · Erming | feed lanes sweeping the plaza, homing "recommended for you" notes, delayed gratification | **Doubao** → orders you a bubble tea now and then |
| Hardcore Mars Corp. | 马一龙 · Eelon | rocket rain, the not-a-flamethrower, a truck charge that stuns him on the wall | drones |
| AGI Soon Ltd. | 奥特慢 · Samm | GPU spirals, agent swarms, a funding round to interrupt, and the board fires him once | **GPT bot** → shoots at range for you |
| Safety First Labs | 大里奥 · Darioo | orbiting shields, a 15,000-word essay beam, "I can't help with that" reflection, escalating ASL phases | **Claude crab** → pinches whatever gets close |

Weapons are melee and tiered: stapler → resignation-letter fan → mech keyboard →
whiteboard → the Labor Law. Picking up a better one equips it automatically and also
scales your skills. Plaid shirts are armour. Darioo's safeguards orbit him at a distance:
slip between them to get into melee range.

## How it's drawn

The simulation is a flat plane (x, y, plus a height), and two renderers can draw it.

**3D (default).** `js/r3world.js` and `js/r3actors.js` draw the world with Three.js: a
third-person chase camera looking north, a sun with soft shadow maps whose angle and
colour run from noon to dusk over a match, exponential fog, instanced wind-swayed grass,
lanterns that light up towards evening, and a final full-screen shader that adds bloom,
sun shafts, the colour grade and grain.

The people, robots, trees, rocks, desks, loot containers, street lights and parked cars are
free CC0 models (see [CREDITS.md](CREDITS.md)), packed into `assets/models.js` and loaded
by `js/r3models.js`. The five bosses are those same bodies recoloured, with glasses and
hair added in code. The buildings are modern offices built in code (`js/r3office.js`):
glass curtain walls whose windows light up towards evening, and one silhouette per
company. Everyone shares one skeleton and one set of animation clips (idle,
walk, punch, hit, defeat, sit, cheer). The office weapons, the penguins, Doubao, the crab
and the drones are still built in code, as are the ground textures. If the model bundle
is missing or fails to decode, the renderer keeps its built-in capsule-and-box shapes.
Trees and buildings between you and the camera sink out of the way so you stay visible.
The HUD, name tags and damage numbers are a 2D canvas layered on top.

**2D (fallback).** The earlier Canvas 2D renderer (`js/draw.js`, plus the optional WebGL
lighting pass in `js/post.js`) is still there. The game steps down to it by itself if the
3D view can't hold a frame rate in the first few seconds, and you can switch either way
with the Graphics button in the menu.

## Code map

| File | What's in it |
|---|---|
| `js/core.js` | math helpers, mouse/keyboard input, touch stick and drag-to-aim buttons, tiny WebAudio synth |
| `js/draw.js` | the 2D renderer: projection, sunlight and shadows, and all its art |
| `js/post.js` | the WebGL lighting pass for the 2D renderer |
| `js/r3world.js` | 3D renderer: scene, procedural textures, static world, camera, sun and fog, post shader |
| `js/r3actors.js` | 3D renderer: character and creature rigs, per-frame sync of everything that moves, effects, the 2D overlay |
| `js/r3models.js` | 3D renderer: loads the model library, animated character rigs, the bosses' looks, model trees, desks and containers |
| `js/r3office.js` | 3D renderer: the office buildings (curtain-wall textures, lobbies, the five headquarters) |
| `assets/models.js` | the model library: 26 trimmed GLB files as base64 (about 7 MB), so the game still runs from `file://` |
| `tools/build-models.mjs` | how `assets/models.js` was made from the source packs (needs the downloads listed in CREDITS.md) |
| `vendor/` | Three.js r149 plus its glTF loader and SkeletonUtils (MIT), vendored so the game runs offline |
| `js/world.js` | game state, map generation, action combat (combos, skills, hit feel), loot, rivals' AI, the circle, hazards, sidekicks |
| `js/bosses.js` | boss framework plus the five attack decks |
| `js/game.js` | match flow, render loop, HUD, skill buttons, minimap, menus, the severance fund |
| `js/i18n.js` | every string, in English and Chinese |

There are no image or audio files; sound is synthesised. The earlier tower-climb and
shooter versions of the game are in the git history.
