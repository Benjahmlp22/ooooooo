# ASTILLERO // ÓRBITA

Juego técnico de construcción espacial en 2D. HTML + CSS + JavaScript puro,
sin dependencias ni build: abre `index.html` en el navegador y juega.

## Qué es

Diseñas una nave bloque a bloque en el astillero, la validas como un problema
de ingeniería (masa, empuje, combustible, electricidad, par de giro) y
despegas a un espacio abierto sin gravedad con física newtoniana, donde
oleadas de naves hostiles te obligan a comprobar si tu diseño era tan bueno
como parecía.

### Construcción
- Grilla libre con **10 tipos de bloque**: cabina, casco, blindaje, tanque,
  batería, reactor, propulsor, RCS, giroscopio y láser.
- Todo bloque direccional es **girable** (`R`): los propulsores empujan hacia
  donde apuntan, los láseres disparan hacia donde apuntan.
- Deshacer/rehacer (`Ctrl+Z` / `Ctrl+Y`), zoom, pan, borrador automático.
- Validación en vivo: cabina única, conectividad (los bloques sueltos se
  marcan en rojo), avisos de ingeniería y **centro de masa visible** —
  un diseño asimétrico girará al acelerar.

### Vuelo
- Sin gravedad: cada propulsor aplica su fuerza **en su posición real**, con
  el par resultante sobre el centro de masa. La activación por tecla decide
  qué propulsores encienden según su orientación y su brazo de palanca.
- **SAS** (`T`) amortigua la rotación con giroscopios y RCS; `X` frena el giro.
- **Hitboxes exactas por bloque**: los láseres se resuelven por raycast contra
  la caja de cada bloque; las colisiones nave-nave se resuelven por pares de
  bloques con impulsos físicos.
- **Recursos**: los propulsores queman combustible, los láseres y giroscopios
  consumen electricidad, los reactores convierten combustible en energía.
- **Averías**: un tanque dañado tiene fugas que vacían el depósito *y empujan
  la nave*; una batería dañada produce cortocircuitos; un reactor dañado
  rinde la mitad y humea. Perder un bloque estructural desprende todo lo que
  quede desconectado de la cabina.
- Daño por bloque: perder la cabina es perder la nave.

### Enemigos
Las naves hostiles usan exactamente la misma física, bloques, combustible y
electricidad que el jugador. Tres diseños (dron, interceptor, corbeta) con
estrategias de combate intercambiables (cazador, orbitador).

### Estética
Minimalista y cinematográfica: vectores finos monocromos con acentos de
color funcional, parallax de estrellas en 3 capas, estelas de velocidad,
zoom dinámico con la velocidad, sacudida de cámara y sonido 100% procedural
(WebAudio, sin assets).

### Hangar
Guarda tus naves, publícalas con firma de constructor y compártelas mediante
**códigos de nave** (`ORBITA1.…`) que cualquiera puede importar.

## Controles

| Contexto | Tecla | Acción |
|---|---|---|
| Astillero | LMB / RMB | colocar / borrar |
| Astillero | `R` | rotar bloque |
| Astillero | `1`–`0` | seleccionar bloque |
| Astillero | rueda / MMB | zoom / mover vista |
| Astillero | `Ctrl+Z` / `Ctrl+Y` | deshacer / rehacer |
| Vuelo | `W`/`S` | empuje adelante / atrás |
| Vuelo | `A`/`D` | girar |
| Vuelo | `Q`/`E` | desplazamiento lateral |
| Vuelo | `Espacio` | disparar láseres |
| Vuelo | `T` / `X` | SAS / frenar giro |
| Vuelo | `Esc` | volver al astillero |
| Global | `M` | silenciar |

## Arquitectura: un archivo por patrón de diseño

```
js/
├── core/
│   ├── const.js         utilidades matemáticas compartidas
│   ├── eventbus.js      OBSERVER — bus de eventos que desacopla simulación,
│   │                    sonido, partículas, cámara y HUD
│   ├── sfx.js           SINGLETON — motor de audio procedural
│   └── camera.js        cámara con seguimiento, zoom dinámico y shake
├── data/
│   └── blocks.js        FACTORY — definiciones de bloque dirigidas por datos
│                        + fábrica de instancias vivas
├── fx/
│   ├── starfield.js     parallax de estrellas y nebulosas
│   └── particles.js     OBJECT POOL — partículas sin asignación en caliente
├── sim/
│   ├── ship.js          cuerpo rígido compuesto: masa, inercia, propulsión,
│   │                    recursos, fugas, raycast por bloque, daño
│   └── world.js         colisiones por impulsos, oleadas, raycast global
├── ai/
│   └── ai.js            STRATEGY — comportamientos de IA intercambiables
├── build/
│   ├── commands.js      COMMAND — ediciones reversibles (undo/redo)
│   └── builder.js       modelo del plano: validación y estadísticas
├── storage/
│   └── hangar.js        FACADE — persistencia y códigos de intercambio
├── states/
│   ├── statemachine.js  STATE — máquina de estados del juego
│   ├── buildstate.js    estado CONSTRUIR
│   ├── flightstate.js   estado VUELO
│   └── hangarstate.js   estado HANGAR
└── main.js              SINGLETON — raíz de composición y bucle principal
```

Sin frameworks, sin bundler, sin red: funciona abriendo `index.html`
directamente (los guardados viven en `localStorage`).
