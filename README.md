# The Layoff Games · 优化游戏 — Campus Royale / 产业园大逃杀

A cel-shaded 2.5D action battle royale about the AI boom, with MOBA-style melee combat.
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

The PC controls follow the MOBA convention; the phone layout is a left stick plus a
thumb cluster of attack and skill buttons.

| | PC | Phone |
|---|---|---|
| Move | right-click the ground (hold to steer), or arrow keys | left stick |
| Basic attack | right-click an enemy to chase and auto-attack it; left-click swings toward the cursor | attack button (auto-targets the nearest enemy, hold to keep swinging) |
| Skills | Q W E R, cast toward the cursor | skill buttons: tap to auto-aim, or drag to aim |
| Dodge (brief invulnerability) | D or Space | dodge button |
| Drink bubble tea (+40 HP) | F | tea button |
| Stop / pause | S / Esc | ⏸ |

## Combat

- **Basic attack** is a three-hit combo; the third hit is bigger, wider and knocks back.
  You step in automatically to close the gap.
- **Q · Pass the Blame**: throw a wok in a line; the first thing it hits is stunned.
- **W · Keyboard Warrior**: slam the ground, launching everything around you.
- **E · Clock-in Dash**: dash through enemies, hitting each once. You are invulnerable mid-dash.
- **R · Labor Arbitration**: a very large Labor Law book lands on the target area and stuns.
- Hits land with hit-stop, screen shake, knockback, crits and a combo counter.
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

## Code map

| File | What's in it |
|---|---|
| `js/core.js` | math helpers, mouse/keyboard input, touch stick and drag-to-aim buttons, tiny WebAudio synth |
| `js/draw.js` | the 2.5D projection and all the cel-shaded art: characters, terrain, trees, buildings, loot |
| `js/world.js` | game state, map generation, action combat (combos, skills, hit feel), loot, rivals' AI, the circle, hazards, sidekicks |
| `js/bosses.js` | boss framework plus the five attack decks |
| `js/game.js` | match flow, render loop, HUD, skill buttons, minimap, menus, the severance fund |
| `js/i18n.js` | every string, in English and Chinese |

Everything is drawn with canvas primitives: there are no image or audio assets. The
earlier tower-climb version of the game is in the git history.
