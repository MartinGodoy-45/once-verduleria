# once · verdulería

PWA de autoservicio para la verdulería dentro del minimarket "once" (barrio Alunai, La Rioja).

## Cómo funciona ahora

- **Catálogo de cliente** (`index.html` / `app.js`): lee la vista `catalogo_disponible` de Supabase, que muestra cada producto con el precio del **lote más urgente que esté en salón**. Si un producto no tiene ningún lote activo en salón, no aparece — el stock y el precio ya no viven en `productos`, viven en `lotes`.
- **Oferta por volumen**: si un lote tiene descuento activo (`precio` por debajo de `precio_original`), el catálogo muestra el precio original como cartel normal + una cinta "-XX%" sobre la foto + "Llevando 2kg: $X" como gancho. Pero el cobro real cambia según cuánto pesás: **menos de 2kg se cobra al precio original, 2kg o más se cobra al precio con descuento** — es un umbral real, no solo visual (constante `UMBRAL_KG_OFERTA` en `app.js`, hoy fija en 2kg para todos los productos). La función `precioPorCantidad()` centraliza esta cuenta y la usan tanto la pantalla de pesaje como el carrito y el pedido final, así el número nunca queda descolgado del cobro real.
- Carrito en memoria (se pierde si recargás la página — es lo esperado en esta etapa).
- Al pagar, crea el pedido y sus items en Supabase (`pedidos` + `pedido_items`), y la confirmación de pago descuenta stock del lote más urgente en salón (falla con error claro si no alcanza).
- **Métodos de pago**: efectivo, transferencia, y **pago combinado** (parte efectivo + parte transferencia — el cliente escribe cuánto paga en efectivo y el resto se calcula solo como transferencia). Quedan en estado `pendiente_*` hasta confirmación manual en el panel.
- **Panel de admin** (`admin.html`): login, pedidos pendientes de confirmar (incluye los de pago combinado, mostrando el desglose de los dos montos), resumen del día, y un botón a `compras.html`.
- **Compras y mermas** (`compras.html`), con 5 pestañas:
  - **Compra**: cada compra crea un **lote** nuevo con fecha, estado de madurez al llegar (Recién llega / A mitad / Para vender ya, con botones), ubicación (switch Depósito / Salón), y margen objetivo editable por producto. Si el producto tiene margen configurado, sugiere un precio para ese lote — el campo queda editable (no es "aceptar o nada", podés escribir cualquier número) y se guarda con un toque. Tiene un "+ Nuevo producto" para dar de alta un producto sin salir de esta pantalla ni tocar Supabase.
  - **Merma**: registra la baja y descuenta del lote más urgente automáticamente.
  - **Depósito**: lista los lotes que están ahí esperando, con un botón para pasarlos a salón.
  - **Maduración**: sugerencias automáticas de "bajar precio" o "dar de baja" según cuántos días lleva cada lote y su perfil de maduración (ver sección de abajo). Confirmación manual, nunca automática — mismo criterio del precio por margen: aparece el campo editable con el número sugerido ya seleccionado, vos decidís.
  - **Precio**: editar a mano el precio de cualquier lote activo de cualquier producto, sin depender de ninguna sugerencia.
- Instalable como app (manifest + service worker) — el service worker está **desactivado a propósito** (`SERVICE_WORKER_ACTIVO = false` en `app.js`) mientras seguimos iterando seguido. Las tres páginas (`app.js`, `admin.js`, `compras.js`) desregistran cualquier Service Worker viejo que encuentren, para que ninguna quede pegada mostrando una copia vieja de sí misma.

## Maduración: cómo funciona la memoria de etapas

Cada producto puede tener un `perfil_maduracion` (A, B, C, D, E1, E2 — ver tabla `reglas_maduracion`), que define, según los días transcurridos desde que entró el lote, qué % de descuento sugerir o si conviene retirarlo. Detalles importantes:

- El % de descuento de cada etapa es siempre **contra el precio original del lote** (`precio_original`), nunca contra el precio actual — así no se pisan descuentos unos sobre otros.
- Cada lote guarda `etapa_madurez_confirmada`: la última etapa (día) para la que el admin ya definió un precio. La sugerencia **no vuelve a aparecer** para una etapa ya confirmada, aunque el precio que hayas puesto no coincida exactamente con el sugerido — se respeta la decisión manual. Solo vuelve a sugerir algo cuando el lote avanza a una etapa posterior.
- Guardar un precio desde la pestaña Maduración o desde la pestaña Precio actualiza esta memoria (vía la función `confirmar_precio_maduracion`); un update directo a la tabla `lotes` en Supabase (a mano) no la actualiza — si algún día se edita un lote directo en la base para algo relacionado a maduración, tenerlo en cuenta.
- El campo `avance_madurez_pct` de cada lote (0 / 50 / 90, según el botón elegido al cargar la compra) adelanta el reloj: un lote que entra "para vender ya" llega antes a sus etapas de descuento que uno que entra "recién llega", aunque hayan entrado el mismo día.

## Base de datos (Supabase, proyecto "once")

Tablas: `productos`, `compras`, `mermas`, `lotes`, `pedidos`, `pedido_items`, `reglas_maduracion`.
Vistas: `catalogo_disponible` (precio/stock del lote más urgente, pública), `sugerencias_maduracion` (qué lotes necesitan atención), `lotes_legible` (lotes con el nombre del producto al lado, para navegar en el Table Editor sin ver solo UUIDs).
Funciones (RPC): `crear_pedido`, `confirmar_metodo_pago` (incluye pago combinado), `obtener_estado_pedido`, `obtener_items_pedido`, `registrar_compra`, `registrar_merma`, `confirmar_precio_maduracion`.

`productos.stock` quedó vestigial de una versión anterior (antes de que existieran los lotes) — no lo actualiza nada hoy, ignorarlo.

## Cómo probarla ahora mismo, sin instalar nada

Es HTML/CSS/JS puro, sin build.

```bash
cd once-verduleria
python3 -m http.server 8000
```

Y entrar a `http://localhost:8000` desde el navegador.

## Qué falta

- [ ] Integración real con Mercado Pago (QR dinámico + webhook): al elegir MP, la app tiene que llevar al cliente directo a la app de Mercado Pago con el monto ya cargado (deep link), no solo mostrar un QR estático. Para el caso de pago combinado con MP: se paga primero la parte en efectivo en el mostrador y después la parte de MP (a confirmar si ese orden es el correcto — quedó como supuesto, no decidido).
- [ ] Balanza conectada (Web Serial API) para productos por peso — diseño acordado, pendiente de hardware real para construir y probar:
  - Cada puesto = una PC/tablet con su balanza enchufada (Web Serial solo lee el puerto físico de esa misma máquina, ningún celular se conecta directo a una balanza ajena).
  - Cada balanza tiene un QR fijo pegado ("Balanza 1", "Balanza 2", ...). El cliente ya tiene la PWA abierta (entró por un QR general suelto en el salón/mostrador) y al escanear el de una balanza puntual, su celular se pone a "escuchar" el peso que esa balanza publica en vivo.
  - La misma PC de cada puesto también sirve como terminal de compra directa, para quien prefiera no usar su propio teléfono (personas mayores, niños, etc.) — mismo software, sin escanear nada.
  - Para que una balanza no le muestre su peso a dos personas a la vez, cada balanza tiene un solo modo activo por vez: "compartida" (publica para celulares, default) o "compra directa" (alguien la está usando en la PC misma; quien escanee el QR en ese momento ve un aviso de "en uso", no un peso). Cambia de modo solo, sin arbitraje raro.
  - El protocolo exacto para leer cada balanza depende de la marca — no se puede definir sin tenerla en mano.
- [ ] Reemplazar los íconos placeholder de `icons/` por unos de verdad (ya se rehicieron una vez, con "once" centrado — sirven como base pero no son un logo final)
- [ ] Decidir qué hacer con `productos.precio_oferta` / `productos.categoria` — **ya resuelto**: se eliminaron esas columnas y `categoria` se renombró a `perfil_maduracion`, que sí se usa. Dejar esta línea tachada como recordatorio de que ya no hay nada pendiente ahí.
- [ ] Umbral de kg para la oferta por volumen (hoy fijo en `UMBRAL_KG_OFERTA = 2` dentro de `app.js`, igual para todos los productos): en algún momento podría convenir que sea editable por producto desde la pantalla de compras, en vez de un número fijo en el código.
- [ ] Ofertas combo entre productos distintos (ej: "2kg banana + 2kg naranja = $X"): hoy el sistema solo sabe hacer ofertas de un producto contra sí mismo (por cantidad o por maduración). Combos cruzados entre productos es una idea a futuro, sin diseñar todavía.
- [ ] Integración del flujo de pedidos por WhatsApp de Florencia al sistema (bajo volumen hoy — no automatizar con herramientas no oficiales por riesgo de baneo de WhatsApp; retomar si el volumen crece).
- [ ] Perfil B de maduración (lechuga, acelga) pasa directo de precio normal a "retirar", sin ninguna etapa de remate intermedia — en la práctica se puede sacar la parte fea (por peso) y seguir vendiendo el resto más barato. Evaluar en el chat de estrategia si conviene agregarle un paso de remate antes del retiro total, como tienen los demás perfiles.

## Credenciales

`app.js`, `admin.js` y `compras.js` ya tienen el Project URL y la anon key del proyecto **once** de Supabase — son públicas por diseño, no hace falta esconderlas. La `service_role key` (la que sí es secreta) no está en ningún lado de este proyecto: solo va a usarse del lado del servidor cuando armemos el webhook de Mercado Pago.
