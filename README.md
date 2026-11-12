# The Layoff Games · 优化游戏 — Campus Royale / 产业园大逃杀

A cel-shaded 2.5D loot-and-extract battle royale about the AI boom.
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

| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | left thumb |
| Aim & shoot | mouse | right thumb (auto-aims and fires if you let go) |
| Dash (brief invulnerability) | Space / Shift / right-click | 💨 |
| Drink bubble tea (+40 HP) | F | 🧋 |
| Switch weapon | Q / E, 1–5, wheel | 🔁 |
| Pause | Esc or P | ⏸ |

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

Weapons: stapler (infinite), mech keyboard (shotgun of keycaps), iced americano (lobbed
splash, goes over shields), resignation letter (piercing paper plane) and the Labor Law
(a boomerang, as it should be). Plaid shirts are armour.

## Code map

| File | What's in it |
|---|---|
| `js/core.js` | math helpers, keyboard/mouse/touch input, tiny WebAudio synth |
| `js/draw.js` | the 2.5D projection and all the cel-shaded art: characters, terrain, trees, buildings, loot |
| `js/world.js` | game state, map generation, player, loot, rivals' AI, the circle, hazards, sidekicks |
| `js/bosses.js` | boss framework plus the five attack decks |
| `js/game.js` | match flow, render loop, HUD, minimap, menus, the severance fund |
| `js/i18n.js` | every string, in English and Chinese |

Everything is drawn with canvas primitives: there are no image or audio assets. The
earlier tower-climb version of the game is in the git history.
