# The Layoff Games · 优化游戏 — Five Floors to N+1 / 连闯五家大厂

A 3D action roguelike about the AI boom: melee combos, a lock-on, a dodge with a
perfect-dodge slow-motion window, in a misty forest campus rendered with Three.js.
One run takes you through five tech companies. On each floor you clear two waves, then
its CEO walks out; every stage you clear lets you pick one of three upgrades, and they
stack until the run ends. Make all five sign the severance papers.

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
- **Hit feel.** A long lunge closes the gap, trails and sparks are large, the camera pushes
  in instead of shaking, and the target snaps back. A hit freezes the fighters for a few
  hundredths of a second while sparks, numbers and the camera keep moving, and a finishing
  blow is followed by a short beat of slow motion. All of it is one table of numbers, `FEEL` in `js/world.js`.
- **Training ground** (title screen): five sandbags that never fall and never hit back,
  **B** steps through the weapons.
- When your health is in the red the screen edge pulses, the bubble-tea button throbs and
  a prompt tells you to drink.
- **Q · Pass the Blame**: throw a wok in a line; the first thing it hits is stunned.
- **E · Clock-in Dash**: dash through enemies, hitting each once. Invulnerable mid-dash.
- **R · Labor Arbitration**: a very large Labor Law book lands on the target area and stuns.
- Hits land with hit-stop, screen shake, knockback, crits and a combo counter.
- Health creeps back, up to half, when nothing has hit you for a few seconds, and only two
  rivals (three from the third floor) press the attack at once; the rest circle and wait.
- Rivals fight in melee too. A red wedge on the ground shows where a swing is about to
  land; senior rivals telegraph a dash strike with a red line. Step out or dodge.

On a phone the screen is laid out for thumbs from the first frame, in either orientation:
one attack button in the corner with dodge and the three skills fanned around it, bubble
tea at the bottom, pause by the minimap. The HUD keeps clear of notches and home bars,
menus shrink to fit a phone on its side, the 3D view renders fewer pixels and a smaller
shadow map, and the screen is kept awake during a match.

**Loading and performance.** The page shows a splash at once and the menu as soon as the
engine and game code have arrived; the model library is the last script on the page and
swaps in when it has decoded. The models are trimmed hard (characters stored without
normals, which are worked out again at load so they are shaded smoothly; simplified tree
trunks; WebP textures), so the whole one-file build is about
3.4 MB. At run time each character is a single draw call, trees, bushes, rocks and grass
are split into map cells so only what is in view is drawn, and the 3D view has four
quality levels (pixel ratio, anti-aliasing, shadow size, glow) that the game moves
between by itself to hold the frame rate; you can also pin one in the menu. If the
browser is drawing WebGL in software (hardware acceleration switched off), the game says
so and uses the 2D view.

Camera effects are deliberately restrained: ordinary hits lean the camera slightly, only
heavy hits shake it, and the view eases into a small look-ahead as you run.

English and 中文 are both built in (toggle on the title screen).

## How a run works

- **Five floors.** Penguin Tower, Infinite Scroll, Hardcore Mars, AGI Soon, Safety First,
  in that order. The purple wall is the edge of the floor you are on.
- **Three stages a floor.** Wave one is the company's own AI products and whoever runs
  them, plus a few colleagues. Wave two is bigger and brings middle managers. Then the
  CEO walks out of the building with a close-up of about four seconds (it cannot be
  skipped until the name has been on screen for a moment).
- **Upgrades.** Clearing a wave pays a choice of one from three; a CEO's signature pays a
  choice that counts double. There are nineteen (damage, attack speed, crits, life on hit,
  stamina, cooldowns, extra woks for Q, a harder E, a bigger R, and so on) and each can be
  taken a few times. They last until the run ends. The pause menu shows what you hold.
- **Between stages.** A cleared wave heals a little and a signature heals 60%; resting only
  brings you back to half, so the rest comes from bubble tea and upgrades. After a signature
  everything left on the floor flies to you. Then the shuttle pulls up south of the plaza:
  stand at the stop and it takes you to the next company.
- **The objective** is always on screen under your health: how much of the wave is left
  (one pip per enemy), whose signature you are after, or where the shuttle is. Each new
  one is announced large first; a column of light and chevrons at your feet point at the
  last stragglers, and the minimap shows the floor with everyone on it.
- **It gets harder.** Every floor up, enemies have more health and hit harder, waves are
  larger, and the CEO has more health. The numbers are at the top of `js/rogue.js`.
- **Promotions.** Knock-outs, boxes and signatures fill the ring around your weapon.
  Each grade up (P5 to P10) adds health and damage and heals you.
- **Loot.** Stand next to a container to search it: a crate, two lockers and two safes on
  every floor. Better weapons turn up on higher floors. Valuables come in six colour
  tiers, from a badge lanyard up to the red one: a **signed N+1 agreement**.
- **How it ends.** Go down and you keep half of what you carried. Make all five sign and
  you keep everything, plus a bonus. The severance fund buys better starting kits, and
  each CEO you have ever beaten leaves a stamp on the title screen.
- **CEOs.** Every attack is telegraphed. Beat one and they sign: you get the red item,
  and their AI switches sides for the rest of the run.

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
lighting pass in `js/post.js`) is still there. It has three quality levels of its own (canvas
resolution, whether figures get the soft per-figure light, the lighting pass and the air
effects) that the game moves between to hold the frame rate, starting at the plainest one
when the browser has no graphics acceleration. Canvas 2D is slow at filling thousands of small vector
paths a frame, with or without a graphics card, so almost nothing is drawn that way more
than once: the ground (with its tufts and flowers) is painted into tiles; trees, rocks,
buildings, desks, boxes and strips of tall grass are each painted into a sprite and
blitted; enemies and sidekicks are images repainted about fifteen times a second; the
skill buttons and the minimap's map are cached. A typical frame went from about 2,000
path fills and 270 gradients to about 500 and 30. The world has its own canvas at a
lower pixel ratio than the HUD's, so the HUD stays sharp. While 2D is showing the 3D world and the model library are not built or
decoded at all. The game steps down to it by itself if the
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
| `assets/models/` | the 24 models as GLB files (about 1.7 MB) |
| `assets/models.js` | the same models packed as base64 into one script, which is what the game loads, so it still runs from `file://` and as a single file |
| `tools/pack-models.js` | rebuilds `assets/models.js` from `assets/models/*.glb` |
| `tools/build-models.mjs` | how the GLB files were trimmed from the original packs (needs the downloads listed in CREDITS.md) |
| `vendor/` | Three.js r149 plus its glTF loader and SkeletonUtils (MIT), vendored so the game runs offline |
| `js/world.js` | game state, map generation, action combat (combos, skills, hit feel), loot, rivals' AI, hazards, sidekicks |
| `js/rogue.js` | the run: floors, waves, the upgrades and how they are offered, the objective line |
| `js/bosses.js` | boss framework plus the five attack decks |
| `js/game.js` | match flow, render loop, HUD, skill buttons, minimap, menus, the severance fund |
| `js/i18n.js` | every string, in English and Chinese |

There are no image or audio files; sound is synthesised. The earlier tower-climb,
shooter and battle-royale versions of the game are in the git history.
