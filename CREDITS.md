# Credits

## 3D models

Every model in `assets/models.js` is released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain), so no
attribution is required. Credit where it is due anyway:

| What | Pack | Author | Got from |
|---|---|---|---|
| People (office workers, suits, the five bosses' bodies) and their animations | Ultimate Animated Character Pack | [Quaternius](https://quaternius.com) | opengameart.org |
| Trees, pine, bushes, rocks | Stylized Nature MegaKit | [Quaternius](https://quaternius.com) | opengameart.org |
| Chest, crate | KayKit Dungeon Remastered | [Kay Lousberg](https://kaylousberg.com) | github.com/KayKit-Game-Assets |
| Desk, cabinet | KayKit Furniture Bits | [Kay Lousberg](https://kaylousberg.com) | github.com/KayKit-Game-Assets |
| Street lights, parked cars | KayKit City Builder Bits | [Kay Lousberg](https://kaylousberg.com) | github.com/KayKit-Game-Assets |
| Robots (AI agents, the GPT sidekick) | RobotExpressive | Tomás Laulhé, modified by Don McCurdy | three.js examples |

The models were trimmed for size with `tools/build-models.mjs`: unused animation clips
removed, textures shrunk, normal maps dropped, vertex data quantised. Colours are adjusted
at load time (skin tones, robot tints, green bushes).

## Code

- [three.js](https://threejs.org) r149, with `GLTFLoader` and `SkeletonUtils` from its
  examples — MIT licence, see `vendor/three.LICENSE`.

Everything else (game code, office buildings, office weapons, the bosses' glasses and hair,
penguins, Doubao, the crab, drones, textures, sound) is made in this repository.
