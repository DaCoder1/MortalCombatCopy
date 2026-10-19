# Mortal Klash

A Mortal Kombat–style 2D fighting game that runs in the browser. It's plain HTML5 canvas and JavaScript with no build step, and the art and sound are all generated in code.

**Play online:** https://dacoder1.github.io/MortalCombatCopy/ (deployed from `main` by GitHub Actions).

**Play locally:** open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and go to `http://localhost:8000`.

## Features

- **7 kombatants**, each with their own specials and fatalities:
  - Scorch, Frostbane and Venom (palette-swap ninjas)
  - Jin Lo (monk)
  - Vexa (special forces)
  - Krane (mercenary)
  - Raizen (thunder god)
- **Classic MK controls**: high and low punch, high and low kick, and a dedicated **block** button. You also get the uppercut (↓ + HP), sweep (← + LK), roundhouse (← + HK), jump kicks, throws, juggles and chip damage.
- **Special moves**: spear ("GET OVER HERE!"), teleport punch, ice freeze, slide, acid spit, force ball, fireball, flying kick, energy rings, cannonball, lightning, torpedo and teleport. Projectiles can be ducked.
- **FINISH HIM/HER → FATALITY**, with 8 fatalities across 7 styles: burn to the bone, spine/head rip, heart rip, body explosion, deep-freeze shatter, acid melt and electrocution.
- **Arcade presentation**:
  - "ROUND 1 / FIGHT!" announcer (speech synthesis), plus FLAWLESS VICTORY and combo counter
  - Best-of-3 rounds, 99-second timer and dragon-medallion round markers
  - Blood and gore particles, hit-freeze and screen shake
- **Stages**: The Pit (moonlit bridge over the spikes), the Courtyard (temple, crowd and throne) and the Lair (dungeon with bones and lava cracks). Each has parallax and animated torches.
- **1 Player** ladder against every other fighter with rising AI difficulty, plus continues and an ending. **2 Players** local versus. The title screen runs a CPU-vs-CPU attract demo.
- Retro "digitized" pixel filter with scanlines, a synthesized taiko soundtrack, and gamepad support.

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Move / jump / crouch | W A S D | Arrow keys |
| High punch (HP) | U | Num 7 or `.` |
| Low punch (LP) | J | Num 4 or `,` |
| High kick (HK) | O | Num 9 or `'` |
| Low kick (LK) | L | Num 6 or `;` |
| Block | I / K / Space | Num 8 / 5 / 0 or `/` |

In 1-player mode, either key set controls your fighter.

Other keys:

- `Enter`: pause and show the move list
- `P`: pixel filter
- `M`: music
- `B`: blood
- `F`: fullscreen

Every character's special moves and fatalities are listed under **MOVE LIST** on the title screen and in the pause menu.

## Code layout

| File | Purpose |
|---|---|
| `js/data.js` | Constants, skeleton poses, move data, the character roster |
| `js/render.js` | Pose solver (angles → joints), fighter/costume drawing, arcade text |
| `js/stages.js` | Procedurally painted stages with parallax |
| `js/fighter.js` | Fighter state machine, input buffer and special-move detection, hits |
| `js/match.js` | Rounds, KO/finish flow, projectiles, gore particles, fatalities, HUD |
| `js/ai.js` | CPU opponent |
| `js/audio.js` | Synthesized sound effects, announcer and music |
| `js/game.js` | Input, menus/scenes, main loop |

The fighters, names and art are original creations inspired by the classic arcade game's style. No copyrighted assets are used.
