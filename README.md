# The Layoff Games · 优化游戏

A 2.5D arena shooter about the AI boom. The AI writes the code, the docs and the
layoff emails; 10,000 employees are invited to a "performance review" in the tower.
You are employee #0035. Grab whatever is on the desk, survive five elimination
floors, and make every CEO sign N+1 for everyone.

**Parody and fiction.** Not affiliated with or endorsed by any person or company
named. Nobody gets hurt — the bosses just sign the severance papers.

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
| Switch weapon | Q / E, 1–5, wheel | 🔁 |
| Pause / mute | Esc or P / M | ⏸ |

English and 中文 are both built in (toggle on the title screen).

## How a floor works

1. **Performance review.** Minions pour in. Every few seconds the floor turns red and
   a countdown starts — get into a green zone before it hits zero. Coworkers who
   don't make it turn to dust and the headcount ticker drops.
2. **The CEO steps out of the elevator.** Every attack is telegraphed; dash through
   what you can't outrun.
3. **Pick an employee benefit** (paid leave, side hustle, union card…) and go up.

| Floor | Boss | Signature moves |
|---|---|---|
| 1 Penguin Tower | 马化腾 · Pony | red-envelope fans, penguin squads, the gauntlet *snap* |
| 2 Infinite Scroll Inc. | 张一鸣 · Yiming | feed lanes that sweep the floor, homing "recommended for you" notes, delayed gratification |
| 3 Hardcore Mars Corp. | Elon | rocket rain, the not-a-flamethrower, a truck charge that stuns him when he hits the wall |
| 4 AGI Soon Ltd. | Sam | GPU spirals, agent swarms, a funding round you must interrupt — and the board fires him once |
| 5 Safety First Labs | Dario | orbiting shields, a 15,000-word essay beam, "I can't help with that" reflection, escalating ASL phases |

Weapons come from delivery crates: stapler (infinite), mech keyboard (shotgun of
keycaps), iced americano (lobbed splash — goes over shields), resignation letter
(piercing paper plane), and the Labor Law (a boomerang, as it should be).

## Code map

| File | What's in it |
|---|---|
| `js/core.js` | math helpers, keyboard/mouse/touch input, tiny WebAudio synth |
| `js/draw.js` | the 2.5D projection, procedurally drawn characters, floor/wall/desks |
| `js/world.js` | game state, player, weapons, minions, hazards (bullets, zones, lasers), coworkers |
| `js/bosses.js` | boss framework plus the five attack decks |
| `js/game.js` | floors, review mechanic, render loop, HUD, menus |
| `js/i18n.js` | every string, in English and Chinese |

Everything is drawn with canvas primitives — there are no image or audio assets.
`index.html?floor=3` jumps to a floor and `?floor=3&boss=1` straight to its boss.
