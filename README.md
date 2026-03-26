# Jungle Survival

A self-contained browser survival prototype inspired by a cinematic open-world jungle concept.

## Run

Open [index.html](/Users/nafisharzoo/Documents/jungle-survival/index.html) directly in a browser.

If your browser blocks local scripts, serve the folder with a static server:

```bash
cd /Users/nafisharzoo/Documents
python3 -m http.server 8123
```

Then open `http://localhost:8123/jungle-survival/`.

## Controls

- `WASD` or `Arrow keys`: move
- `Shift`: sprint
- `E`: gather nearest resource
- `Space`: attack
- `R`: eat berry
- `Q`: use medkit
- `F`: place campfire

## Goal

Collect enough resources to craft the `Signal Beacon` and escape.

## Crafting

- `Stone Spear`: `4 wood`, `2 stone`, `2 fiber`
- `Medkit`: `3 herb`, `1 fiber`
- `Campfire Kit`: `5 wood`, `3 stone`
- `Signal Beacon`: `12 wood`, `8 stone`, `6 fiber`, `4 scrap`
