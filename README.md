# dofus-mecanicas

Interactive, Spanish-language tutorials that explain DOFUS combat mechanics one rule at a time.

Live site: https://hyperxq.github.io/dofus-mecanicas/

## Guides

| Guide | Folder | Status |
|---|---|---|
| Selatrop (Eliotrope) portals | `selatrop-portales/` | In progress |
| Line of sight | `linea-de-vision/` | Planned |
| Xelor mobility | `xelor-movilidad/` | Planned |

## Structure

Each guide is a self-contained static folder served by GitHub Pages; there is no build step.

- `selatrop-portales/js/rules.js` holds the pure game rules (portal queue, routing, projection, line of sight, areas, pushes and pulls).
- `tests/` covers those rules with `node:test`.

```sh
npm test
```

## Sources

- [Torrente Arcano – Selotrop guide](https://www.torrentearcano.com/selotrop)
- [Eliotrope Guide by Zekalfra](https://eliotrope.net/)

Rules marked as approximations in the guides (tie-breaks, push order, push into portals) should be verified in the current game client.

## Disclaimer

Unofficial fan project, not affiliated with or endorsed by Ankama. DOFUS is a trademark of Ankama.
