# ASTILLERO // ÓRBITA

> En este repositorio viven dos juegos hermanos:
> **ASTILLERO // ÓRBITA** (raíz, `index.html`) — construye naves y combate — y
> **ODISEA // DERIVA** (`deriva/index.html`) — supervivencia a bordo de una
> nave que no puedes editar: gestiona oxígeno, energía y combustible, sella
> brechas, sofoca incendios, descifra señales, escapa de anomalías
> gravitatorias y suelta carga para aligerar. Mismo estilo minimalista,
> mismos patrones de diseño, cero dependencias.

Juego técnico de construcción espacial en 2D. HTML + CSS + JavaScript puro,
sin dependencias ni build: abre `index.html` en el navegador y juega.

## Qué es

Diseñas una nave bloque a bloque en el astillero, la validas como un problema
de ingeniería (masa, empuje, combustible, electricidad, par de giro) y
despegas a un espacio abierto sin gravedad con física newtoniana, donde
oleadas de naves hostiles te obligan a comprobar si tu diseño era tan bueno
como parecía.

### Construcción
- Grilla libre con **15 tipos de bloque en 6 categorías** (mando, estructura,
  propulsión, energía, armas, defensa): cabina, giroscopio, casco, blindaje,
  tren de aterrizaje, propulsor, motor pesado, RCS, tanque, batería, reactor,
  panel solar, láser, cañón y generador de escudo.
- Todo bloque direccional es **girable** (`R`): los propulsores empujan hacia
  donde apuntan, las armas disparan hacia donde apuntan, el tren se orienta.
- Renderizado **sin costuras**: los bloques contiguos se funden en un casco
  unificado (contorno solo en los bordes expuestos).
- Deshacer/rehacer (`Ctrl+Z` / `Ctrl+Y`), zoom, pan, borrador automático.
- Validación en vivo: cabina única, conectividad (los bloques sueltos se
  marcan en rojo), avisos de ingeniería y **centro de masa visible** —
  un diseño asimétrico girará al acelerar.

### Vuelo
- Física newtoniana: cada propulsor aplica su fuerza **en su posición real**,
  con el par resultante sobre el centro de masa. La activación por tecla
  decide qué propulsores encienden según su orientación y brazo de palanca.
- Dos modos conmutables (`G`): **ASISTIDO** (amortiguación automática de giro
  y deriva, vuelo accesible) y **REALISTA** (newtoniano puro, solo SAS).
- **SAS** (`T`) amortigua la rotación con giroscopios y RCS; `X` frena el giro.
- **Hitboxes exactas por bloque**: láseres por raycast contra la caja de cada
  bloque; **proyectiles de cañón** físicos con retroceso, gravedad e impulso
  de impacto; colisiones nave-nave por pares de bloques con impulsos.
- **Escudos**: burbuja que absorbe láseres y proyectiles, se recarga con
  energía tras 2.5 s sin recibir daño.
- **Recursos**: propulsores queman combustible; armas, giroscopios y escudos
  consumen electricidad; reactores y paneles solares la generan.
- **Averías y reparación**: tanques con fugas que vacían el depósito *y
  empujan la nave*, baterías en cortocircuito, reactores humeantes. Mantén
  `R` para **soldar en vuelo** el bloque más dañado (consume energía); al
  superar el 50% de casco la fuga queda sellada.
- Daño por bloque: perder la cabina es perder la nave; lo desconectado se
  desprende como escombros.

### Planetas
Dos cuerpos a gran escala: **VERDANIA** (gravedad terrestre, atmósfera con
arrastre, cielo, árboles, arbustos, hierba y rocas) y la luna **CENIZA**
(baja gravedad, sin aire, rocas y cráteres). Gravedad newtoniana g·(R/r)²,
**calentamiento de reentrada** con plasma, viento audible, y aterrizaje con
contacto físico por bloque — el tren de aterrizaje triplica la velocidad de
contacto segura.

### Enemigos
Las naves hostiles usan exactamente la misma física, bloques, combustible y
electricidad que el jugador. Cuatro diseños (dron, interceptor, corbeta,
cañonera con escudo) con estrategias intercambiables (cazador, orbitador)
que pilotan por **igualación de velocidad**: interceptan con punto de
adelanto, mantienen distancia de tiro, orbitan, se separan entre sí,
esquivan planetas y se retiran si están malheridos.

### Estética
Minimalista y cinematográfica: vectores finos monocromos con acentos de
color funcional, casco sin costuras, parallax de estrellas en 3 capas,
**pasada de luces aditivas** (toberas, láseres, explosiones, escudos, plasma),
estelas de velocidad, zoom dinámico, **cámara con fuerzas G** (se desplaza
contra la aceleración sentida y se inclina con la fuerza centrífuga, con
lector de G en el HUD) y sonido 100% procedural con compresor maestro
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
| Vuelo | `Espacio` | disparar (láseres y cañones) |
| Vuelo | `R` | reparar / soldar fugas |
| Vuelo | `T` / `X` | SAS / frenar giro |
| Vuelo | `G` | modo ASISTIDO ⇄ REALISTA |
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
│   ├── particles.js     OBJECT POOL — partículas sin asignación en caliente
│   └── lights.js        pasada de luces aditivas (pseudo-shader 2D)
├── sim/
│   ├── planets.js       gravedad, atmósfera, superficie procedural
│   ├── ship.js          cuerpo rígido compuesto: masa, inercia, propulsión,
│   │                    recursos, fugas, escudos, reparación, daño
│   └── world.js         colisiones, suelo planetario, proyectiles, oleadas
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
