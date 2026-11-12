# The Layoff Games · 优化游戏 — Campus Royale / 产业园大逃杀

A 2.5D action battle royale about the AI boom: melee combos, a lock-on, a dodge with a
perfect-dodge slow-motion window, and a campus lit by a WebGL shader.
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
| Attack | left-click: tap for the three-hit combo, hold to charge a spin attack | attack button: tap to combo, hold to charge |
| Dodge | Space (no direction held = hop backwards) | dodge button |
| Lock on | right-click or Tab | automatic (nearest target) |
| Skills | Q, E (or Shift), R; aimed at your lock or the cursor | skill buttons: tap to auto-aim, or drag to aim |
| Drink bubble tea (+50 HP) | F | tea button |
| Pause | Esc | ⏸ |

## Combat

- **Attack** is a three-hit combo; the third hit is bigger, wider and knocks back. You step
  in automatically to close the gap. **Hold** attack to wind up a spin that launches
  everything around you.
- **Dodge** gives a moment of invulnerability. Dodge just as an attack is about to land
  and it is a **perfect dodge**: the world drops into slow motion while you keep full speed.
- **Q · Pass the Blame**: throw a wok in a line; the first thing it hits is stunned.
- **E · Clock-in Dash**: dash through enemies, hitting each once. Invulnerable mid-dash.
- **R · Labor Arbitration**: a very large Labor Law book lands on the target area and stuns.
- Hits land with hit-stop, screen shake, knockback, crits and a combo counter.
- Health creeps back when nothing has hit you for a few seconds, and no more than two
  rivals will press you at once.
- Rivals fight in melee too. A red wedge on the ground shows where a swing is about to
  land; senior rivals telegraph a dash strike with a red line. Step out or dodge.

English and 中文 are both built in (toggle on the title screen).

## How a match works

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
| Penguin Tower | 马化腾 · Pony | red-envelope fans, penguin squads, the gauntlet snap | penguins |
| Infinite Scroll Inc. | 张一鸣 · Yiming | feed lanes sweeping the plaza, homing "recommended for you" notes, delayed gratification | **Doubao** → orders you a bubble tea now and then |
| Hardcore Mars Corp. | Elon | rocket rain, the not-a-flamethrower, a truck charge that stuns him on the wall | drones |
| AGI Soon Ltd. | Sam | GPU spirals, agent swarms, a funding round to interrupt, and the board fires him once | **GPT bot** → shoots at range for you |
| Safety First Labs | Dario | orbiting shields, a 15,000-word essay beam, "I can't help with that" reflection, escalating ASL phases | **Claude crab** → pinches whatever gets close |

Weapons are melee and tiered: stapler → resignation-letter fan → mech keyboard →
whiteboard → the Labor Law. Picking up a better one equips it automatically and also
scales your skills. Plaid shirts are armour. Dario's safeguards orbit him at a distance:
slip between them to get into melee range.

## How it's drawn

Everything is drawn in code with Canvas 2D: figures go through a scratch canvas so a
single soft light (warm upper-left, cool lower-right) can be laid over each one, tree
canopies are built from shaded leaf clusters, and every object casts a shadow away from
one sun whose angle lengthens from noon to dusk over a match. That picture is then run
through one WebGL fragment shader (`js/post.js`): procedural grass and dirt texture,
pools of dappled sunlight under drifting cloud shadow, mist, sun shafts, bloom, soft
focus in the distance, film grain and the noon-to-dusk grade. The lighting pass can be
switched off in the menu, and switches itself off if the device can't hold a frame rate.

## Code map

| File | What's in it |
|---|---|
| `js/core.js` | math helpers, mouse/keyboard input, touch stick and drag-to-aim buttons, tiny WebAudio synth |
| `js/draw.js` | the 2.5D projection, sunlight and shadows, and all the art: characters, terrain, trees, buildings, loot |
| `js/post.js` | the WebGL lighting pass |
| `js/world.js` | game state, map generation, action combat (combos, skills, hit feel), loot, rivals' AI, the circle, hazards, sidekicks |
| `js/bosses.js` | boss framework plus the five attack decks |
| `js/game.js` | match flow, render loop, HUD, skill buttons, minimap, menus, the severance fund |
| `js/i18n.js` | every string, in English and Chinese |

There are no image or audio assets. The earlier tower-climb and shooter versions of
the game are in the git history.
