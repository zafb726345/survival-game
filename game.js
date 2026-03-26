(function () {
  "use strict";

  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");

  var refs = {
    health: document.getElementById("health-value"),
    hunger: document.getElementById("hunger-value"),
    stamina: document.getElementById("stamina-value"),
    day: document.getElementById("day-value"),
    wood: document.getElementById("wood-value"),
    stone: document.getElementById("stone-value"),
    fiber: document.getElementById("fiber-value"),
    herb: document.getElementById("herb-value"),
    berry: document.getElementById("berry-value"),
    scrap: document.getElementById("scrap-value"),
    medkit: document.getElementById("medkit-count"),
    campfire: document.getElementById("campfire-count"),
    objectiveWood: document.getElementById("objective-wood"),
    objectiveStone: document.getElementById("objective-stone"),
    objectiveFiber: document.getElementById("objective-fiber"),
    objectiveScrap: document.getElementById("objective-scrap"),
    weather: document.getElementById("weather-pill"),
    time: document.getElementById("time-pill"),
    weapon: document.getElementById("weapon-pill"),
    message: document.getElementById("message-bar"),
    log: document.getElementById("event-log"),
    restartButton: document.getElementById("restart-button"),
  };

  var craftButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-craft]")
  );

  var WORLD_SIZE = 88;
  var TILE_SIZE = 44;
  var PLAYER_RADIUS = 0.24;
  var PLAYER_SPEED = 3.15;
  var ENEMY_COUNT = 16;
  var MAX_LOGS = 6;
  var ATTACK_COOLDOWN = 0.34;
  var GATHER_COOLDOWN = 0.42;
  var WEATHER_LABELS = {
    clear: "Clear",
    rain: "Rain",
    fog: "Fog",
    storm: "Storm",
  };

  var RECIPES = {
    spear: { wood: 4, stone: 2, fiber: 2 },
    medkit: { herb: 3, fiber: 1 },
    campfire: { wood: 5, stone: 3 },
    beacon: { wood: 12, stone: 8, fiber: 6, scrap: 4 },
  };

  var state = null;
  var renderWidth = 1280;
  var renderHeight = 720;
  var lastTimestamp = 0;
  var logDirty = true;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function fract(value) {
    return value - Math.floor(value);
  }

  function hash2(x, y, seed) {
    return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function distanceSquared(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;

    return dx * dx + dy * dy;
  }

  function distance(ax, ay, bx, by) {
    return Math.sqrt(distanceSquared(ax, ay, bx, by));
  }

  function formatTime(hourValue) {
    var safeHour = hourValue % 24;
    var hours = Math.floor(safeHour);
    var minutes = Math.floor((safeHour - hours) * 60);

    return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }

  function getAmbientLight(hourValue) {
    if (hourValue >= 7 && hourValue < 17.5) {
      return 0.94;
    }

    if (hourValue >= 17.5 && hourValue < 20) {
      return lerp(0.94, 0.26, (hourValue - 17.5) / 2.5);
    }

    if (hourValue >= 5 && hourValue < 7) {
      return lerp(0.26, 0.94, (hourValue - 5) / 2);
    }

    return 0.2;
  }

  function getNightLevel(hourValue) {
    return 1 - clamp((getAmbientLight(hourValue) - 0.2) / 0.74, 0, 1);
  }

  function getTerrainAtTile(tileX, tileY) {
    if (
      !state ||
      tileX < 0 ||
      tileX >= state.world.size ||
      tileY < 0 ||
      tileY >= state.world.size
    ) {
      return "mountain";
    }

    return state.world.tiles[tileY][tileX];
  }

  function getTerrainAt(x, y) {
    return getTerrainAtTile(Math.floor(x), Math.floor(y));
  }

  function isWalkableTerrain(terrain) {
    return terrain !== "river" && terrain !== "mountain";
  }

  function getTerrainSpeedMultiplier(terrain) {
    switch (terrain) {
      case "riverbank":
        return 0.93;
      case "marsh":
        return 0.78;
      case "foothill":
        return 0.86;
      default:
        return 1;
    }
  }

  function createWorld() {
    var size = WORLD_SIZE;
    var spawn = {
      x: Math.floor(size * 0.52),
      y: Math.floor(size * 0.72),
    };
    var tiles = [];

    for (var y = 0; y < size; y += 1) {
      var row = [];

      for (var x = 0; x < size; x += 1) {
        var riverX =
          size * 0.45 +
          Math.sin(y * 0.13) * 6 +
          Math.sin(y * 0.051) * 3.5;
        var riverDistance = Math.abs(x - riverX);
        var mountainLine =
          size * 0.17 +
          Math.sin(x * 0.08) * 4 +
          Math.sin(x * 0.029) * 5;
        var noise =
          Math.sin(x * 0.18) * 0.38 +
          Math.sin(y * 0.15) * 0.34 +
          Math.sin((x + y) * 0.08) * 0.25 +
          Math.sin(Math.sqrt((x - 28) * (x - 28) + (y - 24) * (y - 24)) * 0.19) *
            0.16;
        var spawnDistance = distance(x, y, spawn.x, spawn.y);
        var terrain = "jungle";

        if (spawnDistance < 4) {
          terrain = "clearing";
        } else if (riverDistance < 1.05) {
          terrain = "river";
        } else if (riverDistance < 2) {
          terrain = "riverbank";
        } else if (y < mountainLine - 2) {
          terrain = "mountain";
        } else if (y < mountainLine + 1.5) {
          terrain = "foothill";
        } else if (noise > 0.6) {
          terrain = "forest";
        } else if (noise > 0.1) {
          terrain = "jungle";
        } else if (noise > -0.32) {
          terrain = "marsh";
        } else {
          terrain = "clearing";
        }

        row.push(terrain);
      }

      tiles.push(row);
    }

    for (var safeY = spawn.y - 3; safeY <= spawn.y + 3; safeY += 1) {
      for (var safeX = spawn.x - 3; safeX <= spawn.x + 3; safeX += 1) {
        if (safeX >= 0 && safeX < size && safeY >= 0 && safeY < size) {
          tiles[safeY][safeX] = safeX === spawn.x && safeY === spawn.y ? "clearing" : "jungle";
        }
      }
    }

    return {
      size: size,
      spawn: spawn,
      tiles: tiles,
    };
  }

  function spawnResources(world) {
    var resources = [];

    for (var y = 1; y < world.size - 1; y += 1) {
      for (var x = 1; x < world.size - 1; x += 1) {
        var terrain = world.tiles[y][x];
        var roll = Math.random();
        var spawnDistance = distance(x, y, world.spawn.x, world.spawn.y);

        if (spawnDistance < 5) {
          continue;
        }

        if ((terrain === "forest" || terrain === "jungle") && roll < 0.28) {
          resources.push({ type: "tree", x: x + 0.5, y: y + 0.5 });
          continue;
        }

        if ((terrain === "riverbank" || terrain === "marsh") && roll < 0.18) {
          resources.push({ type: "herb", x: x + 0.5, y: y + 0.5 });
          continue;
        }

        if ((terrain === "foothill" || terrain === "clearing") && roll < 0.14) {
          resources.push({ type: "rock", x: x + 0.5, y: y + 0.5 });
          continue;
        }

        if ((terrain === "clearing" || terrain === "riverbank") && roll < 0.035) {
          resources.push({ type: "crate", x: x + 0.5, y: y + 0.5 });
        }
      }
    }

    return resources;
  }

  function findSpawnPoint(minDistance) {
    for (var attempt = 0; attempt < 600; attempt += 1) {
      var x = randomInt(2, state.world.size - 3);
      var y = randomInt(2, state.world.size - 3);

      if (!isWalkableTerrain(getTerrainAtTile(x, y))) {
        continue;
      }

      if (distance(x, y, state.world.spawn.x, state.world.spawn.y) < minDistance) {
        continue;
      }

      return { x: x + 0.5, y: y + 0.5 };
    }

    return {
      x: state.world.spawn.x + minDistance,
      y: state.world.spawn.y - minDistance,
    };
  }

  function spawnEnemies() {
    var enemies = [];

    for (var index = 0; index < ENEMY_COUNT; index += 1) {
      var point = findSpawnPoint(10);
      enemies.push({
        x: point.x,
        y: point.y,
        radius: 0.25,
        health: 46,
        speed: 1.35 + Math.random() * 0.5,
        attackCooldown: Math.random() * 0.8,
        wanderTimer: 0.4 + Math.random() * 1.4,
        wanderAngle: Math.random() * Math.PI * 2,
      });
    }

    return enemies;
  }

  function createInitialState() {
    var world = createWorld();

    state = {
      status: "ready",
      world: world,
      resources: [],
      enemies: [],
      campfires: [],
      player: {
        x: world.spawn.x + 0.5,
        y: world.spawn.y + 0.5,
        health: 100,
        hunger: 100,
        stamina: 100,
        inventory: {
          wood: 0,
          stone: 0,
          fiber: 0,
          herb: 0,
          berry: 2,
          scrap: 0,
        },
        medkits: 0,
        campfireKits: 0,
        hasSpear: false,
        attackCooldown: 0,
        gatherCooldown: 0,
      },
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        sprint: false,
      },
      dayClock: 15,
      dayNumber: 1,
      weather: {
        type: "clear",
        timer: 24,
        flash: 0,
      },
      elapsed: 0,
      camera: { x: 0, y: 0 },
      attackPulse: 0,
      damageFlash: 0,
      nearbyHint: "",
      logs: [],
      message: "Move with WASD or Arrow keys to begin exploring.",
      lastHitLogTime: -10,
    };

    state.resources = spawnResources(world);
    state.enemies = spawnEnemies();
    logDirty = true;
    pushLog("Mission", "Craft a signal beacon to escape the jungle.");

    return state;
  }

  function pushLog(title, detail) {
    state.logs.unshift({ title: title, detail: detail });
    state.logs = state.logs.slice(0, MAX_LOGS);
    state.message = detail;
    logDirty = true;
  }

  function renderLog() {
    if (!logDirty) {
      return;
    }

    refs.log.innerHTML = "";

    state.logs.forEach(function (entry) {
      var item = document.createElement("li");
      var title = document.createElement("strong");
      title.textContent = entry.title;
      item.appendChild(title);
      item.appendChild(document.createTextNode(entry.detail));
      refs.log.appendChild(item);
    });

    logDirty = false;
  }

  function resizeCanvas() {
    var devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    var displayWidth = canvas.clientWidth;
    var displayHeight = canvas.clientHeight;
    var width = Math.floor(displayWidth * devicePixelRatio);
    var height = Math.floor(displayHeight * devicePixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      renderWidth = displayWidth;
      renderHeight = displayHeight;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
  }

  function canOccupy(x, y, radius) {
    var points = [
      [x, y],
      [x + radius, y],
      [x - radius, y],
      [x, y + radius],
      [x, y - radius],
    ];

    for (var index = 0; index < points.length; index += 1) {
      var point = points[index];
      var terrain = getTerrainAt(point[0], point[1]);

      if (!isWalkableTerrain(terrain)) {
        return false;
      }
    }

    return true;
  }

  function moveEntity(entity, dx, dy, radius) {
    var nextX = entity.x + dx;
    var nextY = entity.y + dy;
    var clampedX = clamp(nextX, radius + 0.1, state.world.size - radius - 0.1);
    var clampedY = clamp(nextY, radius + 0.1, state.world.size - radius - 0.1);

    if (canOccupy(clampedX, entity.y, radius)) {
      entity.x = clampedX;
    }

    if (canOccupy(entity.x, clampedY, radius)) {
      entity.y = clampedY;
    }
  }

  function pickNextWeather(current) {
    var options = ["clear", "clear", "rain", "fog", "storm"];
    var next = current;

    while (next === current) {
      next = options[randomInt(0, options.length - 1)];
    }

    return next;
  }

  function updateDayNight(deltaSeconds) {
    var previousClock = state.dayClock;
    state.dayClock += deltaSeconds * 0.14;

    if (state.dayClock >= 24) {
      state.dayClock -= 24;
      state.dayNumber += 1;
      pushLog("Dawn", "Another day begins over the jungle canopy.");
    }

    if (previousClock < 18 && state.dayClock >= 18) {
      pushLog("Nightfall", "Predators grow bolder after sunset.");
    }
  }

  function updateWeather(deltaSeconds) {
    state.weather.timer -= deltaSeconds;

    if (state.weather.timer <= 0) {
      state.weather.type = pickNextWeather(state.weather.type);
      state.weather.timer = 24 + Math.random() * 20;
      pushLog("Weather", "Conditions shifted to " + WEATHER_LABELS[state.weather.type] + ".");
    }

    if (state.weather.type === "storm" && Math.random() < deltaSeconds * 0.6) {
      state.weather.flash = 0.16;
    } else {
      state.weather.flash = Math.max(0, state.weather.flash - deltaSeconds * 0.8);
    }
  }

  function updatePlayer(deltaSeconds) {
    var xAxis = Number(state.input.right) - Number(state.input.left);
    var yAxis = Number(state.input.down) - Number(state.input.up);
    var magnitude = Math.hypot(xAxis, yAxis);
    var moving = magnitude > 0;
    var sprinting = moving && state.input.sprint && state.player.stamina > 5;

    if (moving && state.status === "ready") {
      state.status = "running";
      pushLog("Movement", "The expedition begins. Gather fast and stay alive.");
    }

    if (moving) {
      xAxis /= magnitude;
      yAxis /= magnitude;
      var terrain = getTerrainAt(state.player.x, state.player.y);
      var weatherDrag =
        state.weather.type === "storm" ? 0.86 : state.weather.type === "rain" ? 0.93 : 1;
      var speed =
        PLAYER_SPEED *
        getTerrainSpeedMultiplier(terrain) *
        weatherDrag *
        (sprinting ? 1.52 : 1);

      moveEntity(
        state.player,
        xAxis * speed * deltaSeconds,
        yAxis * speed * deltaSeconds,
        PLAYER_RADIUS
      );
    }

    if (sprinting) {
      state.player.stamina = clamp(state.player.stamina - deltaSeconds * 26, 0, 100);
    } else {
      var campBonus = getNearestCampfireDistance() < 2.2 ? 7 : 0;
      state.player.stamina = clamp(
        state.player.stamina + deltaSeconds * (18 + campBonus),
        0,
        100
      );
    }

    state.player.attackCooldown = Math.max(
      0,
      state.player.attackCooldown - deltaSeconds
    );
    state.player.gatherCooldown = Math.max(
      0,
      state.player.gatherCooldown - deltaSeconds
    );
    state.attackPulse = Math.max(0, state.attackPulse - deltaSeconds * 3);
    state.damageFlash = Math.max(0, state.damageFlash - deltaSeconds * 2.6);
  }

  function updateCampfires(deltaSeconds) {
    var survivors = [];

    state.campfires.forEach(function (campfire) {
      campfire.duration -= deltaSeconds;

      if (campfire.duration > 0) {
        survivors.push(campfire);
      }
    });

    state.campfires = survivors;

    if (getNearestCampfireDistance() < 2.2) {
      state.player.health = clamp(state.player.health + deltaSeconds * 5.5, 0, 100);
    }
  }

  function updateVitals(deltaSeconds) {
    if (state.status !== "running") {
      return;
    }

    state.player.hunger = clamp(state.player.hunger - deltaSeconds * 1.25, 0, 100);

    if (state.player.hunger <= 0) {
      state.player.health = clamp(state.player.health - deltaSeconds * 7, 0, 100);
    }

    if (state.player.health <= 0) {
      state.status = "game-over";
      pushLog("Defeat", "The jungle claimed the expedition.");
    }
  }

  function updateEnemies(deltaSeconds) {
    var nightLevel = getNightLevel(state.dayClock);
    var remainingEnemies = [];

    state.enemies.forEach(function (enemy) {
      var toPlayerX = state.player.x - enemy.x;
      var toPlayerY = state.player.y - enemy.y;
      var distanceToPlayer = Math.hypot(toPlayerX, toPlayerY);
      var detectionRange =
        3.8 + nightLevel * 4.6 + (state.weather.type === "storm" ? 1.2 : 0);

      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaSeconds);
      enemy.wanderTimer -= deltaSeconds;

      if (distanceToPlayer < detectionRange && state.status !== "game-over" && state.status !== "won") {
        var chaseX = toPlayerX / Math.max(distanceToPlayer, 0.001);
        var chaseY = toPlayerY / Math.max(distanceToPlayer, 0.001);
        var chaseSpeed =
          enemy.speed * (1 + nightLevel * 0.35 + (state.weather.type === "storm" ? 0.15 : 0));

        moveEntity(
          enemy,
          chaseX * chaseSpeed * deltaSeconds,
          chaseY * chaseSpeed * deltaSeconds,
          enemy.radius
        );
      } else {
        if (enemy.wanderTimer <= 0) {
          enemy.wanderTimer = 0.8 + Math.random() * 1.8;
          enemy.wanderAngle += (Math.random() - 0.5) * 1.8;
        }

        moveEntity(
          enemy,
          Math.cos(enemy.wanderAngle) * enemy.speed * 0.32 * deltaSeconds,
          Math.sin(enemy.wanderAngle) * enemy.speed * 0.32 * deltaSeconds,
          enemy.radius
        );
      }

      if (
        distance(enemy.x, enemy.y, state.player.x, state.player.y) < 0.84 &&
        enemy.attackCooldown <= 0 &&
        state.status !== "game-over" &&
        state.status !== "won"
      ) {
        enemy.attackCooldown = 1.05;
        state.player.health = clamp(
          state.player.health -
            (8 + nightLevel * 5 + (state.weather.type === "storm" ? 2 : 0)),
          0,
          100
        );
        state.damageFlash = 0.9;

        if (state.elapsed - state.lastHitLogTime > 1.4) {
          pushLog("Attack", "A jungle hunter tore through your guard.");
          state.lastHitLogTime = state.elapsed;
        }

        if (state.player.health <= 0) {
          state.status = "game-over";
          pushLog("Defeat", "The jungle claimed the expedition.");
        }
      }

      if (enemy.health > 0) {
        remainingEnemies.push(enemy);
      }
    });

    state.enemies = remainingEnemies;
  }

  function getNearestCampfireDistance() {
    if (!state.campfires.length) {
      return Infinity;
    }

    var nearest = Infinity;

    state.campfires.forEach(function (campfire) {
      nearest = Math.min(
        nearest,
        distance(campfire.x, campfire.y, state.player.x, state.player.y)
      );
    });

    return nearest;
  }

  function getNearestResource(maxDistance) {
    var nearest = null;
    var bestDistance = maxDistance * maxDistance;

    state.resources.forEach(function (resource) {
      var resourceDistance = distanceSquared(
        resource.x,
        resource.y,
        state.player.x,
        state.player.y
      );

      if (resourceDistance < bestDistance) {
        nearest = resource;
        bestDistance = resourceDistance;
      }
    });

    return nearest;
  }

  function addInventoryItem(name, amount) {
    state.player.inventory[name] += amount;
  }

  function gatherNearestResource() {
    if (state.player.gatherCooldown > 0 || state.status === "game-over" || state.status === "won") {
      return;
    }

    var resource = getNearestResource(1.05);

    if (!resource) {
      pushLog("Search", "No useful resource is close enough to gather.");
      state.player.gatherCooldown = GATHER_COOLDOWN;
      return;
    }

    var detail = "";

    switch (resource.type) {
      case "tree":
        addInventoryItem("wood", randomInt(2, 3));
        addInventoryItem("fiber", randomInt(1, 2));
        detail = "Collected timber and vine fiber from the jungle.";
        break;
      case "rock":
        addInventoryItem("stone", randomInt(2, 3));
        detail = "Chipped useful stone from the foothills.";
        break;
      case "herb":
        addInventoryItem("herb", randomInt(1, 2));
        addInventoryItem("berry", randomInt(1, 2));
        detail = "Gathered herbs and fresh berries by the wet ground.";
        break;
      case "crate":
        addInventoryItem("scrap", randomInt(1, 2));
        detail = "Recovered metal scrap from abandoned supplies.";
        break;
      default:
        detail = "Found something useful.";
        break;
    }

    state.resources = state.resources.filter(function (entry) {
      return entry !== resource;
    });
    state.player.gatherCooldown = GATHER_COOLDOWN;
    pushLog("Gathered", detail);
  }

  function useMedkit() {
    if (state.player.medkits <= 0) {
      pushLog("Supplies", "No medkits left in the pack.");
      return;
    }

    if (state.player.health >= 100) {
      pushLog("Supplies", "Health is already full.");
      return;
    }

    state.player.medkits -= 1;
    state.player.health = clamp(state.player.health + 42, 0, 100);
    pushLog("Recovery", "You patched wounds with a field medkit.");
  }

  function eatBerry() {
    if (state.player.inventory.berry <= 0) {
      pushLog("Rations", "No berries left to eat.");
      return;
    }

    if (state.player.hunger >= 100) {
      pushLog("Rations", "You are not hungry right now.");
      return;
    }

    state.player.inventory.berry -= 1;
    state.player.hunger = clamp(state.player.hunger + 22, 0, 100);
    pushLog("Rations", "You ate wild berries to steady yourself.");
  }

  function placeCampfire() {
    if (state.player.campfireKits <= 0) {
      pushLog("Camp", "No campfire kits crafted yet.");
      return;
    }

    if (getTerrainAt(state.player.x, state.player.y) === "marsh") {
      pushLog("Camp", "The ground is too wet here for a stable fire.");
      return;
    }

    if (getNearestCampfireDistance() < 2.4) {
      pushLog("Camp", "A campfire is already warming this area.");
      return;
    }

    state.player.campfireKits -= 1;
    state.campfires.push({
      x: state.player.x,
      y: state.player.y,
      duration: 85,
    });
    pushLog("Camp", "A campfire crackles to life.");
  }

  function performAttack() {
    if (state.player.attackCooldown > 0 || state.status === "game-over" || state.status === "won") {
      return;
    }

    var range = state.player.hasSpear ? 1.35 : 0.85;
    var damage = state.player.hasSpear ? 34 : 18;
    var target = null;
    var bestDistance = range * range;

    state.enemies.forEach(function (enemy) {
      var enemyDistance = distanceSquared(enemy.x, enemy.y, state.player.x, state.player.y);

      if (enemyDistance <= bestDistance) {
        target = enemy;
        bestDistance = enemyDistance;
      }
    });

    state.player.attackCooldown = ATTACK_COOLDOWN;
    state.attackPulse = 1;

    if (!target) {
      pushLog("Combat", "Your swing cuts only rain and fog.");
      return;
    }

    target.health -= damage;
    target.x += (target.x - state.player.x) * 0.08;
    target.y += (target.y - state.player.y) * 0.08;

    if (target.health <= 0) {
      if (Math.random() < 0.35) {
        addInventoryItem("scrap", 1);
      }

      pushLog("Combat", "You dropped a stalking hunter in the undergrowth.");
    } else {
      pushLog("Combat", "A clean hit lands on the charging hunter.");
    }
  }

  function hasResources(recipeName) {
    var recipe = RECIPES[recipeName];
    var inventory = state.player.inventory;

    return Object.keys(recipe).every(function (name) {
      return inventory[name] >= recipe[name];
    });
  }

  function spendResources(recipeName) {
    var recipe = RECIPES[recipeName];

    Object.keys(recipe).forEach(function (name) {
      state.player.inventory[name] -= recipe[name];
    });
  }

  function craftItem(recipeName) {
    if (state.status === "game-over" || state.status === "won") {
      return;
    }

    if (recipeName === "spear" && state.player.hasSpear) {
      pushLog("Crafting", "You already have a spear equipped.");
      return;
    }

    if (!hasResources(recipeName)) {
      pushLog("Crafting", "Not enough resources for that recipe.");
      return;
    }

    spendResources(recipeName);

    switch (recipeName) {
      case "spear":
        state.player.hasSpear = true;
        pushLog("Crafting", "Stone spear crafted. Reach and damage improved.");
        break;
      case "medkit":
        state.player.medkits += 1;
        pushLog("Crafting", "A medkit is packed and ready.");
        break;
      case "campfire":
        state.player.campfireKits += 1;
        pushLog("Crafting", "Campfire kit assembled for a safer rest.");
        break;
      case "beacon":
        state.status = "won";
        pushLog("Extraction", "The signal beacon fires skyward. Rescue is incoming.");
        break;
      default:
        break;
    }
  }

  function refreshNearbyHint() {
    var resource = getNearestResource(1.1);
    var terrain = getTerrainAt(state.player.x, state.player.y);

    if (resource) {
      var label = {
        tree: "tree cluster",
        rock: "stone deposit",
        herb: "herb patch",
        crate: "supply crate",
      }[resource.type];
      state.nearbyHint = "Press E to gather the nearby " + label + ".";
      return;
    }

    if (terrain === "marsh") {
      state.nearbyHint = "Marsh slows movement. Riverbanks usually hold herbs.";
      return;
    }

    if (terrain === "foothill") {
      state.nearbyHint = "Foothills often hide stone deposits.";
      return;
    }

    state.nearbyHint = "";
  }

  function updateUI() {
    var inventory = state.player.inventory;

    refs.health.textContent = String(Math.round(state.player.health));
    refs.hunger.textContent = String(Math.round(state.player.hunger));
    refs.stamina.textContent = String(Math.round(state.player.stamina));
    refs.day.textContent = String(state.dayNumber);
    refs.wood.textContent = String(inventory.wood);
    refs.stone.textContent = String(inventory.stone);
    refs.fiber.textContent = String(inventory.fiber);
    refs.herb.textContent = String(inventory.herb);
    refs.berry.textContent = String(inventory.berry);
    refs.scrap.textContent = String(inventory.scrap);
    refs.medkit.textContent = String(state.player.medkits);
    refs.campfire.textContent = String(state.player.campfireKits);
    refs.objectiveWood.textContent = inventory.wood + " / 12";
    refs.objectiveStone.textContent = inventory.stone + " / 8";
    refs.objectiveFiber.textContent = inventory.fiber + " / 6";
    refs.objectiveScrap.textContent = inventory.scrap + " / 4";
    refs.weather.textContent = WEATHER_LABELS[state.weather.type];
    refs.time.textContent = formatTime(state.dayClock);
    refs.weapon.textContent = state.player.hasSpear ? "Stone Spear" : "Knife";

    if (state.status === "game-over") {
      refs.message.textContent = "You were overwhelmed. Restart to try again.";
    } else if (state.status === "won") {
      refs.message.textContent = "Signal sent. Rescue is on the way.";
    } else if (state.nearbyHint) {
      refs.message.textContent = state.nearbyHint;
    } else {
      refs.message.textContent = state.message;
    }

    craftButtons.forEach(function (button) {
      var recipeName = button.getAttribute("data-craft");
      var disabled =
        !hasResources(recipeName) ||
        state.status === "game-over" ||
        state.status === "won" ||
        (recipeName === "spear" && state.player.hasSpear);

      button.disabled = disabled;
    });

    renderLog();
  }

  function getCamera() {
    var worldPixelSize = state.world.size * TILE_SIZE;
    var targetX = state.player.x * TILE_SIZE - renderWidth / 2;
    var targetY = state.player.y * TILE_SIZE - renderHeight / 2;

    state.camera.x = clamp(targetX, 0, Math.max(0, worldPixelSize - renderWidth));
    state.camera.y = clamp(targetY, 0, Math.max(0, worldPixelSize - renderHeight));

    return state.camera;
  }

  function getScreenPosition(worldX, worldY, camera) {
    return {
      x: worldX * TILE_SIZE - camera.x,
      y: worldY * TILE_SIZE - camera.y,
    };
  }

  function drawCircle(x, y, radius, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTile(tileX, tileY, terrain, screenX, screenY) {
    var noise = hash2(tileX, tileY, 1);
    var fillStyle = "#284030";

    switch (terrain) {
      case "forest":
        fillStyle = "rgb(" +
          Math.floor(20 + noise * 18) + "," +
          Math.floor(57 + noise * 24) + "," +
          Math.floor(31 + noise * 16) + ")";
        break;
      case "jungle":
        fillStyle = "rgb(" +
          Math.floor(26 + noise * 16) + "," +
          Math.floor(76 + noise * 18) + "," +
          Math.floor(43 + noise * 18) + ")";
        break;
      case "marsh":
        fillStyle = "rgb(" +
          Math.floor(40 + noise * 16) + "," +
          Math.floor(59 + noise * 12) + "," +
          Math.floor(39 + noise * 12) + ")";
        break;
      case "clearing":
        fillStyle = "rgb(" +
          Math.floor(76 + noise * 14) + "," +
          Math.floor(86 + noise * 16) + "," +
          Math.floor(53 + noise * 12) + ")";
        break;
      case "riverbank":
        fillStyle = "rgb(" +
          Math.floor(68 + noise * 14) + "," +
          Math.floor(88 + noise * 14) + "," +
          Math.floor(61 + noise * 10) + ")";
        break;
      case "foothill":
        fillStyle = "rgb(" +
          Math.floor(84 + noise * 12) + "," +
          Math.floor(81 + noise * 10) + "," +
          Math.floor(58 + noise * 10) + ")";
        break;
      case "mountain":
        fillStyle = "rgb(" +
          Math.floor(64 + noise * 16) + "," +
          Math.floor(68 + noise * 16) + "," +
          Math.floor(70 + noise * 18) + ")";
        break;
      case "river":
        fillStyle = "rgb(" +
          Math.floor(42 + noise * 10) + "," +
          Math.floor(95 + noise * 15) + "," +
          Math.floor(124 + noise * 16) + ")";
        break;
      default:
        break;
    }

    ctx.fillStyle = fillStyle;
    ctx.fillRect(screenX, screenY, TILE_SIZE + 1, TILE_SIZE + 1);

    if (terrain === "river") {
      ctx.strokeStyle = "rgba(196, 228, 239, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenX + 4, screenY + TILE_SIZE * (0.22 + noise * 0.2));
      ctx.quadraticCurveTo(
        screenX + TILE_SIZE * 0.5,
        screenY + TILE_SIZE * (0.1 + noise * 0.22),
        screenX + TILE_SIZE - 4,
        screenY + TILE_SIZE * (0.3 + noise * 0.2)
      );
      ctx.stroke();
    }

    if (terrain === "mountain") {
      ctx.fillStyle = "rgba(236, 242, 242, 0.09)";
      ctx.beginPath();
      ctx.moveTo(screenX + TILE_SIZE * 0.18, screenY + TILE_SIZE * 0.82);
      ctx.lineTo(screenX + TILE_SIZE * 0.48, screenY + TILE_SIZE * 0.18);
      ctx.lineTo(screenX + TILE_SIZE * 0.82, screenY + TILE_SIZE * 0.82);
      ctx.closePath();
      ctx.fill();
    }

    if (terrain === "forest" || terrain === "jungle") {
      ctx.fillStyle = "rgba(228, 247, 228, 0.06)";
      drawCircle(
        screenX + TILE_SIZE * (0.24 + noise * 0.2),
        screenY + TILE_SIZE * (0.22 + noise * 0.25),
        3 + noise * 3,
        ctx.fillStyle
      );
      drawCircle(
        screenX + TILE_SIZE * (0.7 - noise * 0.15),
        screenY + TILE_SIZE * (0.72 - noise * 0.15),
        2 + noise * 2,
        ctx.fillStyle
      );
    }
  }

  function renderWorld(camera) {
    var startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
    var startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
    var endX = Math.min(state.world.size, Math.ceil((camera.x + renderWidth) / TILE_SIZE) + 1);
    var endY = Math.min(state.world.size, Math.ceil((camera.y + renderHeight) / TILE_SIZE) + 1);

    for (var y = startY; y < endY; y += 1) {
      for (var x = startX; x < endX; x += 1) {
        drawTile(
          x,
          y,
          state.world.tiles[y][x],
          x * TILE_SIZE - camera.x,
          y * TILE_SIZE - camera.y
        );
      }
    }
  }

  function renderResources(camera) {
    state.resources.forEach(function (resource) {
      var screen = getScreenPosition(resource.x, resource.y, camera);

      if (
        screen.x < -30 ||
        screen.x > renderWidth + 30 ||
        screen.y < -30 ||
        screen.y > renderHeight + 30
      ) {
        return;
      }

      if (resource.type === "tree") {
        ctx.fillStyle = "#5d3f24";
        ctx.fillRect(screen.x - 3, screen.y + 2, 6, 10);
        drawCircle(screen.x, screen.y - 2, 12, "#4f7d3f");
        drawCircle(screen.x - 8, screen.y + 2, 8, "#3a6231");
        drawCircle(screen.x + 8, screen.y + 3, 8, "#31592b");
      }

      if (resource.type === "rock") {
        ctx.fillStyle = "#9ca5a4";
        ctx.beginPath();
        ctx.moveTo(screen.x - 12, screen.y + 8);
        ctx.lineTo(screen.x - 6, screen.y - 10);
        ctx.lineTo(screen.x + 8, screen.y - 8);
        ctx.lineTo(screen.x + 12, screen.y + 4);
        ctx.lineTo(screen.x, screen.y + 12);
        ctx.closePath();
        ctx.fill();
      }

      if (resource.type === "herb") {
        ctx.strokeStyle = "#8ccc79";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y + 8);
        ctx.lineTo(screen.x - 5, screen.y - 5);
        ctx.moveTo(screen.x, screen.y + 8);
        ctx.lineTo(screen.x + 5, screen.y - 3);
        ctx.moveTo(screen.x, screen.y + 8);
        ctx.lineTo(screen.x + 1, screen.y - 8);
        ctx.stroke();
        drawCircle(screen.x + 7, screen.y - 6, 4, "#5e7ad7");
      }

      if (resource.type === "crate") {
        ctx.fillStyle = "#7b5d39";
        ctx.fillRect(screen.x - 10, screen.y - 10, 20, 20);
        ctx.strokeStyle = "#d4b275";
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x - 10, screen.y - 10, 20, 20);
      }
    });
  }

  function renderCampfires(camera) {
    state.campfires.forEach(function (campfire) {
      var screen = getScreenPosition(campfire.x, campfire.y, camera);
      var pulse = 1 + Math.sin(state.elapsed * 5 + campfire.x) * 0.1;

      drawCircle(screen.x, screen.y, 28 * pulse, "rgba(234, 155, 72, 0.09)");
      drawCircle(screen.x, screen.y, 16 * pulse, "rgba(255, 186, 86, 0.14)");
      ctx.fillStyle = "#6a4022";
      ctx.fillRect(screen.x - 10, screen.y + 6, 20, 3);
      ctx.fillRect(screen.x - 2, screen.y + 1, 14, 3);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y + 8);
      ctx.quadraticCurveTo(screen.x - 10, screen.y - 6, screen.x, screen.y - 18);
      ctx.quadraticCurveTo(screen.x + 10, screen.y - 8, screen.x + 2, screen.y + 8);
      ctx.fillStyle = "#f0b25c";
      ctx.fill();
      drawCircle(screen.x - 1, screen.y - 6, 6, "#ffe395");
    });
  }

  function renderEnemies(camera) {
    state.enemies.forEach(function (enemy) {
      var screen = getScreenPosition(enemy.x, enemy.y, camera);

      if (
        screen.x < -50 ||
        screen.x > renderWidth + 50 ||
        screen.y < -50 ||
        screen.y > renderHeight + 50
      ) {
        return;
      }

      drawCircle(screen.x, screen.y, 14, "#201714");
      drawCircle(screen.x, screen.y + 4, 10, "#392720");
      drawCircle(screen.x - 5, screen.y - 2, 2.2, "#f2684d");
      drawCircle(screen.x + 5, screen.y - 2, 2.2, "#f2684d");
    });
  }

  function renderPlayer(camera) {
    var screen = getScreenPosition(state.player.x, state.player.y, camera);

    if (state.attackPulse > 0) {
      drawCircle(
        screen.x,
        screen.y,
        (state.player.hasSpear ? 38 : 26) * state.attackPulse,
        "rgba(239, 217, 182, 0.12)"
      );
    }

    drawCircle(screen.x, screen.y, 14, "#d6b27a");
    drawCircle(screen.x, screen.y + 6, 10, "#9d734a");
    ctx.fillStyle = "#4d5b83";
    ctx.fillRect(screen.x - 12, screen.y - 4, 8, 12);
    ctx.fillStyle = "#6d4730";
    ctx.fillRect(screen.x - 4, screen.y + 12, 4, 9);
    ctx.fillRect(screen.x + 1, screen.y + 12, 4, 9);

    if (state.player.hasSpear) {
      ctx.strokeStyle = "#d3c39c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(screen.x + 4, screen.y - 10);
      ctx.lineTo(screen.x + 20, screen.y - 22);
      ctx.stroke();
      ctx.fillStyle = "#d9d9d9";
      ctx.beginPath();
      ctx.moveTo(screen.x + 20, screen.y - 22);
      ctx.lineTo(screen.x + 16, screen.y - 28);
      ctx.lineTo(screen.x + 25, screen.y - 25);
      ctx.closePath();
      ctx.fill();
    }
  }

  function renderWeatherAndLighting(camera) {
    if (state.weather.type === "rain" || state.weather.type === "storm") {
      var rainDrops = state.weather.type === "storm" ? 160 : 90;
      ctx.strokeStyle =
        state.weather.type === "storm"
          ? "rgba(210, 224, 255, 0.36)"
          : "rgba(200, 220, 236, 0.22)";
      ctx.lineWidth = state.weather.type === "storm" ? 2 : 1.4;

      for (var index = 0; index < rainDrops; index += 1) {
        var x =
          ((index * 23.7 + state.elapsed * 520) % (renderWidth + 60)) - 20;
        var y =
          ((index * 47.4 + state.elapsed * 700 + hash2(index, 2, 8) * renderHeight) %
            (renderHeight + 80)) -
          40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 9, y + 18);
        ctx.stroke();
      }
    }

    if (state.weather.type === "fog" || state.weather.type === "storm") {
      var fogStrength = state.weather.type === "storm" ? 0.16 : 0.13;
      ctx.fillStyle = "rgba(224, 234, 236," + fogStrength + ")";
      drawCircle(renderWidth * 0.18, renderHeight * 0.24, 90, ctx.fillStyle);
      drawCircle(renderWidth * 0.52, renderHeight * 0.2, 130, ctx.fillStyle);
      drawCircle(renderWidth * 0.82, renderHeight * 0.68, 120, ctx.fillStyle);
      drawCircle(renderWidth * 0.34, renderHeight * 0.8, 100, ctx.fillStyle);
    }

    var lightLevel = getAmbientLight(state.dayClock);
    var nightOverlay = 0.12 + (1 - lightLevel) * 0.62;

    if (state.weather.type === "fog") {
      nightOverlay += 0.08;
    }

    if (state.weather.type === "storm") {
      nightOverlay += 0.12;
    }

    var playerScreen = getScreenPosition(state.player.x, state.player.y, camera);
    var visibilityRadius =
      TILE_SIZE *
      (7.7 - getNightLevel(state.dayClock) * 2.4 - (state.weather.type === "fog" ? 1.8 : 0));

    if (state.weather.type === "storm") {
      visibilityRadius -= TILE_SIZE * 0.8;
    }

    visibilityRadius = Math.max(TILE_SIZE * 3.4, visibilityRadius);

    ctx.save();
    ctx.fillStyle = "rgba(4, 7, 8, " + clamp(nightOverlay, 0.16, 0.74) + ")";
    ctx.fillRect(0, 0, renderWidth, renderHeight);
    ctx.globalCompositeOperation = "destination-out";
    var gradient = ctx.createRadialGradient(
      playerScreen.x,
      playerScreen.y,
      visibilityRadius * 0.2,
      playerScreen.x,
      playerScreen.y,
      visibilityRadius
    );
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.94)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(playerScreen.x, playerScreen.y, visibilityRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state.weather.flash > 0) {
      ctx.fillStyle = "rgba(236, 243, 255, " + state.weather.flash * 0.7 + ")";
      ctx.fillRect(0, 0, renderWidth, renderHeight);
    }

    if (state.damageFlash > 0) {
      ctx.fillStyle = "rgba(170, 30, 20, " + state.damageFlash * 0.16 + ")";
      ctx.fillRect(0, 0, renderWidth, renderHeight);
    }
  }

  function renderCanvasHud() {
    ctx.save();
    ctx.fillStyle = "rgba(6, 12, 10, 0.5)";
    ctx.fillRect(16, 16, 320, 80);
    ctx.strokeStyle = "rgba(225, 236, 228, 0.1)";
    ctx.strokeRect(16, 16, 320, 80);

    ctx.fillStyle = "#eef4ef";
    ctx.font = "700 18px 'Avenir Next Condensed', sans-serif";
    ctx.fillText("Objective: Craft Signal Beacon", 30, 42);
    ctx.font = "500 14px 'Avenir Next Condensed', sans-serif";
    ctx.fillStyle = "rgba(228, 236, 230, 0.78)";
    ctx.fillText(
      "Hunters nearby: " + String(state.enemies.length) + " | Weather: " + WEATHER_LABELS[state.weather.type],
      30,
      68
    );
    ctx.fillText(
      state.nearbyHint || "Gather wood, stone, fiber, and scrap to escape.",
      30,
      88
    );
    ctx.restore();
  }

  function renderEndOverlay() {
    if (state.status !== "game-over" && state.status !== "won") {
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(5, 9, 9, 0.62)";
    ctx.fillRect(0, 0, renderWidth, renderHeight);
    ctx.fillStyle = "rgba(12, 20, 18, 0.88)";
    ctx.fillRect(renderWidth / 2 - 220, renderHeight / 2 - 110, 440, 220);
    ctx.strokeStyle = "rgba(225, 236, 229, 0.1)";
    ctx.strokeRect(renderWidth / 2 - 220, renderHeight / 2 - 110, 440, 220);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4f8f4";
    ctx.font = "700 42px 'Avenir Next Condensed', sans-serif";
    ctx.fillText(
      state.status === "won" ? "Rescue Incoming" : "Expedition Lost",
      renderWidth / 2,
      renderHeight / 2 - 24
    );
    ctx.font = "500 18px 'Avenir Next Condensed', sans-serif";
    ctx.fillStyle = "rgba(227, 236, 229, 0.82)";
    ctx.fillText(
      state.status === "won"
        ? "The beacon broke through the storm."
        : "The jungle outlasted you this time.",
      renderWidth / 2,
      renderHeight / 2 + 18
    );
    ctx.fillText("Press Restart Expedition to play again.", renderWidth / 2, renderHeight / 2 + 50);
    ctx.restore();
  }

  function render() {
    resizeCanvas();
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    var camera = getCamera();
    renderWorld(camera);
    renderResources(camera);
    renderCampfires(camera);
    renderEnemies(camera);
    renderPlayer(camera);
    renderWeatherAndLighting(camera);
    renderCanvasHud();
    renderEndOverlay();
    updateUI();
  }

  function gameLoop(timestamp) {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    var deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
    lastTimestamp = timestamp;
    state.elapsed += deltaSeconds;

    if (state.status !== "game-over" && state.status !== "won") {
      updateDayNight(deltaSeconds);
      updateWeather(deltaSeconds);
      updatePlayer(deltaSeconds);
      updateCampfires(deltaSeconds);
      updateEnemies(deltaSeconds);
      updateVitals(deltaSeconds);
    }

    refreshNearbyHint();
    render();
    window.requestAnimationFrame(gameLoop);
  }

  function restartGame() {
    state = createInitialState();
    lastTimestamp = 0;
    render();
  }

  function onKeyDown(event) {
    var key = event.key.toLowerCase();

    if (key === "arrowup" || key === "w") {
      event.preventDefault();
      state.input.up = true;
      return;
    }

    if (key === "arrowdown" || key === "s") {
      event.preventDefault();
      state.input.down = true;
      return;
    }

    if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      state.input.left = true;
      return;
    }

    if (key === "arrowright" || key === "d") {
      event.preventDefault();
      state.input.right = true;
      return;
    }

    if (key === "shift") {
      state.input.sprint = true;
      return;
    }

    if (event.repeat) {
      return;
    }

    if (key === "e") {
      gatherNearestResource();
      return;
    }

    if (key === " ") {
      event.preventDefault();
      performAttack();
      return;
    }

    if (key === "q") {
      useMedkit();
      return;
    }

    if (key === "r") {
      eatBerry();
      return;
    }

    if (key === "f") {
      placeCampfire();
    }
  }

  function onKeyUp(event) {
    var key = event.key.toLowerCase();

    if (key === "arrowup" || key === "w") {
      state.input.up = false;
      return;
    }

    if (key === "arrowdown" || key === "s") {
      state.input.down = false;
      return;
    }

    if (key === "arrowleft" || key === "a") {
      state.input.left = false;
      return;
    }

    if (key === "arrowright" || key === "d") {
      state.input.right = false;
      return;
    }

    if (key === "shift") {
      state.input.sprint = false;
    }
  }

  function attachEvents() {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", render);
    refs.restartButton.addEventListener("click", restartGame);

    craftButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        craftItem(button.getAttribute("data-craft"));
      });
    });
  }

  state = createInitialState();
  attachEvents();
  render();
  window.requestAnimationFrame(gameLoop);
})();
