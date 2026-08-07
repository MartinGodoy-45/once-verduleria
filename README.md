# once · verdulería

PWA de autoservicio para la verdulería dentro del minimarket "once" (barrio Alunai, La Rioja).

## Cómo funciona ahora

- Catálogo de cliente (`index.html` / `app.js`): lee la vista `catalogo_disponible` de Supabase, que muestra cada producto con el precio del **lote más urgente que esté en salón**. Si un producto no tiene ningún lote activo en salón, no aparece — el stock y el precio ya no viven en `productos`, viven en `lotes`.
- Carrito en memoria (se pierde si recargás la página — es lo esperado en esta etapa).
- Al pagar, crea el pedido y sus items en Supabase (`pedidos` + `pedido_items`), y la confirmación de pago descuenta stock del lote más urgente en salón (falla con error claro si no alcanza).
- Métodos de pago: efectivo y transferencia (quedan en estado `pendiente_*` hasta confirmación manual).
- Panel de admin (`admin.html`): login, pedidos pendientes de confirmar, resumen del día, y un botón a `compras.html`.
- Compras y mermas (`compras.html`): cada compra crea un **lote** nuevo con fecha, estado de madurez al llegar (Recién llega / A mitad / Para vender ya) y ubicación (switch Depósito / Salón). Si el producto tiene un % de margen configurado, sugiere un precio para ese lote que confirmás con un toque. Los lotes en depósito se pasan a salón con un toque desde la pestaña "Depósito".
- Instalable como app (manifest + service worker) — el service worker está **desactivado a propósito** (`SERVICE_WORKER_ACTIVO = false` en `app.js`) mientras seguimos iterando seguido; si algo se ve desactualizado en el celular, hay que borrar los datos del sitio desde el navegador, no alcanza con refrescar.

## Base de datos (Supabase, proyecto "once")

Tablas: `productos`, `compras`, `mermas`, `lotes`, `pedidos`, `pedido_items`.
Vista pública: `catalogo_disponible` (precio/stock por lote más urgente).
Funciones (RPC): `crear_pedido`, `confirmar_metodo_pago`, `obtener_estado_pedido`, `obtener_items_pedido`, `registrar_compra`, `registrar_merma`.

## Cómo probarla ahora mismo, sin instalar nada

Es HTML/CSS/JS puro, sin build.

```bash
cd once-verduleria
python3 -m http.server 8000
```

Y entrar a `http://localhost:8000` desde el navegador.

## Qué falta

- [ ] Integración real con Mercado Pago (QR dinámico + webhook)
- [ ] Balanza conectada (Web Serial API) para productos por peso — diseño acordado, pendiente de hardware real para construir y probar:
  - Cada puesto = una PC/tablet con su balanza enchufada (Web Serial solo lee el puerto físico de esa misma máquina, ningún celular se conecta directo a una balanza ajena).
  - Cada balanza tiene un QR fijo pegado ("Balanza 1", "Balanza 2", ...). El cliente ya tiene la PWA abierta (entró por un QR general suelto en el salón/mostrador) y al escanear el de una balanza puntual, su celular se pone a "escuchar" el peso que esa balanza publica en vivo.
  - La misma PC de cada puesto también sirve como terminal de compra directa, para quien prefiera no usar su propio teléfono (personas mayores, niños, etc.) — mismo software, sin escanear nada.
  - Para que una balanza no le muestre su peso a dos personas a la vez (alguien en su celu + alguien comprando directo en la PC), cada balanza tiene un solo modo activo por vez: "compartida" (publica para celulares, default) o "compra directa" (alguien la está usando en la PC misma; quien escanee el QR en ese momento ve un aviso de "en uso", no un peso). Cambia de modo solo, sin arbitraje raro.
  - El protocolo exacto para leer cada balanza depende de la marca — no se puede definir sin tenerla en mano.
- [ ] Lógica de "maduración → oferta" (día del lote → % de descuento sugerido), a definir en otro chat de estrategia comercial y traer acá para implementar
- [ ] Reemplazar los íconos placeholder de `icons/` por unos de verdad
- [ ] Decidir qué hacer con `productos.precio_oferta` / `productos.categoria` (columnas ya creadas, sin usar todavía)
- [ ] Umbral de kg para la oferta por volumen (hoy fijo en `UMBRAL_KG_OFERTA = 2` dentro de app.js, igual para todos los productos): en algún momento podría convenir que sea editable por producto desde la pantalla de compras, en vez de un número fijo en el código.
- [ ] Ofertas combo entre productos distintos (ej: "2kg banana + 2kg naranja = $X"): hoy el sistema solo sabe hacer ofertas de un producto contra sí mismo (por cantidad o por maduración). Combos cruzados entre productos es una idea a futuro, sin diseñar todavía.

## Credenciales

`app.js`, `admin.js` y `compras.js` ya tienen el Project URL y la anon key del proyecto **once** de Supabase — son públicas por diseño, no hace falta esconderlas. La `service_role key` (la que sí es secreta) no está en ningún lado de este proyecto: solo va a usarse del lado del servidor cuando armemos el webhook de Mercado Pago.
