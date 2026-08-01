# once · verdulería

PWA de autoservicio para la verdulería dentro del minimarket "once" (barrio Alunai, La Rioja).

## Qué hace esta primera versión

- Muestra el catálogo real desde Supabase (tabla `productos`, solo lo que está `disponible = true`)
- Carrito en memoria (se pierde si recargás la página — es lo esperado en esta etapa)
- Al pagar, crea el pedido y sus items en Supabase (`pedidos` + `pedido_items`)
- Métodos de pago: efectivo y transferencia (quedan en estado `pendiente_*` hasta confirmación manual)
- Pantalla de espera que consulta el estado del pedido cada 3 segundos (polling, no Realtime)
- Instalable como app (manifest + service worker) — el shell queda en caché, los datos de Supabase nunca se cachean

## Cómo probarla ahora mismo, sin instalar nada

Es HTML/CSS/JS puro, sin build. Podés abrirla con cualquier servidor estático simple:

```bash
cd once-verduleria
python3 -m http.server 8000
```

Y entrar a `http://localhost:8000` desde el navegador.

## Cómo seguir en Claude Code

1. Instalá Claude Code (`npm install -g @anthropic-ai/claude-code` o desde claude.com/code)
2. Descomprimí este proyecto en una carpeta, o subilo a un repo de GitHub y cloná
3. Corré `claude` adentro de la carpeta del proyecto
4. Contale a Claude Code en qué quedamos (podés pegarle este README) y seguí desde ahí — el panel de admin para tu ex, el webhook de Mercado Pago, o lo que decidas primero

## Qué falta (a propósito, para ir de lo simple a lo difícil)

- [x] Panel de admin para tu ex (`admin.html`, login con Supabase Auth, pendientes de confirmar, ventas del día)
- [ ] Integración real con Mercado Pago (QR dinámico + webhook)
- [ ] Balanza conectada (Web Serial API) para productos por peso
- [ ] Pantalla de carga rápida de compras/mermas
- [ ] Reemplazar los íconos placeholder de `icons/` por unos de verdad
- [ ] Deploy (GitHub Pages es la opción más simple, igual que en tus otros proyectos)

## Credenciales

`app.js` ya tiene el Project URL y la anon key del proyecto **once** de Supabase — son públicas por diseño, no hace falta esconderlas. La `service_role key` (la que sí es secreta) no está en ningún lado de este proyecto: solo va a usarse del lado del servidor cuando armemos el webhook de Mercado Pago.
