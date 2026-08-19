import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Conexión a Supabase (proyecto "once") ---
// Estas dos claves son públicas por diseño, está bien que vivan acá.
const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- Estado en memoria ---
let productos = []
let categorias = []
let promociones = []
let categoriaFiltroActiva = '' // '' = "Todo"
let carrito = {} // { producto_id: cantidad }
let pedidoActualId = null
let pedidoNumeroCorto = null
let pollingInterval = null

const elBadgePedido = document.getElementById('badge-pedido')

// Crea el pedido en la base la primera vez que el cliente agrega algo,
// no recién al pagar -- así ya tiene su número asignado desde el arranque
// (lo vamos a necesitar para el mostrador, y después para la balanza).
async function asegurarPedido() {
  if (pedidoActualId) return
  const { data, error } = await supabase.rpc('crear_pedido')
  if (error || !data || !data[0]) {
    console.error(error)
    return
  }
  pedidoActualId = data[0].id
  pedidoNumeroCorto = data[0].numero_corto
  elBadgePedido.textContent = 'Pedido #' + pedidoNumeroCorto
  elBadgePedido.classList.remove('oculto')
}

// --- Elementos ---
const elLista = document.getElementById('lista-productos')
const elBarraCarrito = document.getElementById('barra-carrito')
const elCarritoCantidad = document.getElementById('carrito-cantidad')
const elCarritoTotal = document.getElementById('carrito-total')
const elCarritoTotal2 = document.getElementById('carrito-total-2')
const elListaCarrito = document.getElementById('lista-carrito')

const vistaCatalogo = document.getElementById('vista-catalogo')
const vistaCarrito = document.getElementById('vista-carrito')
const vistaPago = document.getElementById('vista-pago')
const vistaEspera = document.getElementById('vista-espera')

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// Umbral de "compra por volumen": si hay oferta activa en el lote (precio_original
// distinto del precio actual) y la cantidad pesada llega a este número de kg,
// se cobra el precio con descuento para TODO el peso. Por debajo, precio normal.
const UMBRAL_KG_OFERTA = 2

function precioPorCantidad(p, cantidad) {
  const tieneOferta = p.precio_original && Number(p.precio_original) > Number(p.precio)

  // La rebaja por maduración (lote) siempre gana sobre una promo de marketing.
  if (tieneOferta) {
    if (cantidad >= UMBRAL_KG_OFERTA) return Number(p.precio)
    return Number(p.precio_original)
  }

  // Sin rebaja por maduración activa: recién ahí se puede aplicar un
  // descuento de marketing (ej. "15% en Aromáticas").
  const promoMkt = descuentoMarketingVigente(p)
  if (promoMkt) {
    return Number(p.precio) * (1 - promoMkt.descuento_pct / 100)
  }

  return Number(p.precio)
}

function mostrar(vista) {
  ;[vistaCarrito, vistaPago, vistaEspera, document.getElementById('vista-pesaje')].forEach(v => v.classList.add('oculto'))
  if (vista) vista.classList.remove('oculto')
}

// --- Cargar catálogo ---
async function cargarProductos() {
  const [resProductos, resCategorias, resPromociones] = await Promise.all([
    supabase.from('catalogo_disponible').select('*').order('nombre'),
    supabase.from('categorias').select('*').order('orden'),
    supabase.from('promociones').select('*').eq('activa', true)
  ])

  if (resProductos.error) {
    elLista.innerHTML = `<p class="muted">No se pudo cargar el catálogo. Probá de nuevo en un rato.</p>`
    console.error(resProductos.error)
    return
  }

  productos = resProductos.data
  categorias = resCategorias.data || []
  // Filtramos acá las vigentes por fecha (no todas las "activa=true" están
  // necesariamente dentro de su rango de fecha_desde/fecha_hasta hoy)
  const hoy = new Date().toISOString().slice(0, 10)
  promociones = (resPromociones.data || []).filter(promo =>
    promo.fecha_desde <= hoy && (!promo.fecha_hasta || promo.fecha_hasta >= hoy)
  )

  renderProductos()
  renderPromoDestacada()
  iniciarHeroRotativo()
}

const elPromoStrip = document.getElementById('promo-strip')
const elPromoStripTitulo = document.getElementById('promo-strip-titulo')
const elPromoStripDetalle = document.getElementById('promo-strip-detalle')

// Muestra el banner superior SOLO si hay una promoción marcada como
// "destacada" en la base -- si no hay ninguna, el banner queda oculto
// (nunca se inventa contenido de relleno).
function renderPromoDestacada() {
  const destacada = promociones.find(p => p.destacada)
  if (!destacada) {
    elPromoStrip.classList.add('oculto')
    return
  }

  let detalle = destacada.descripcion || ''
  if (destacada.tipo === 'oferta_producto') {
    const prod = productos.find(p =>
      // La promoción sabe a qué producto aplica a través de promocion_productos,
      // que no traemos acá todavía -- por ahora usamos el nombre de la promo.
      destacada.nombre.toLowerCase().includes(p.nombre.toLowerCase())
    )
    if (prod) detalle = `${prod.nombre} a ${formatoMoneda(destacada.precio_oferta)}${prod.tipo === 'peso' ? '/kg' : ''}`
  } else if (destacada.tipo === 'descuento_porcentual') {
    detalle = `${destacada.descuento_pct}% de descuento`
  } else if (destacada.tipo === 'nxm') {
    detalle = `Llevá ${destacada.cantidad_lleva} y pagá ${destacada.cantidad_paga}`
  } else if (destacada.tipo === 'combo') {
    detalle = `Combo por ${formatoMoneda(destacada.precio_combo)}`
  }

  elPromoStripTitulo.textContent = destacada.nombre
  elPromoStripDetalle.textContent = detalle
  elPromoStrip.classList.remove('oculto')
}

// --- Hero rotativo ---
// Arma una lista de "escenas" (producto fresco o promoción real) y las va
// rotando cada pocos segundos. Si no hay nada especial que mostrar, cae en
// un mensaje genérico pero con foto real de un producto -- nunca queda vacío
// ni muestra un cartel de "oferta" inventado.
let heroInterval = null
let heroEscenas = []
let heroIndice = 0

const elHeroEyebrow = document.getElementById('hero-eyebrow')
const elHeroTitulo = document.getElementById('hero-titulo')
const elHeroSubtitulo = document.getElementById('hero-subtitulo')
const elHeroNota = document.getElementById('hero-nota')
const elHeroImgPrincipal = document.getElementById('hero-img-principal')
const elHeroImgSecundaria = document.getElementById('hero-img-secundaria')

function armarEscenasHero() {
  const escenas = []

  // 1. Una escena por cada promoción activa (la info real ya calculada)
  promociones.forEach(promo => {
    if (promo.tipo === 'oferta_producto') {
      escenas.push({
        eyebrow: 'OFERTA DE LA SEMANA',
        titulo: promo.nombre,
        subtitulo: `Ahora a ${formatoMoneda(promo.precio_oferta)}${promo.descripcion ? ' — ' + promo.descripcion : ''}`,
      })
    } else if (promo.tipo === 'descuento_porcentual') {
      escenas.push({
        eyebrow: 'DESCUENTO ACTIVO',
        titulo: promo.nombre,
        subtitulo: `${promo.descuento_pct}% menos, ya aplicado en cada producto.`,
      })
    } else if (promo.tipo === 'nxm') {
      escenas.push({
        eyebrow: 'PROMO',
        titulo: promo.nombre,
        subtitulo: `Llevás ${promo.cantidad_lleva} y pagás ${promo.cantidad_paga}.`,
      })
    } else if (promo.tipo === 'combo') {
      escenas.push({
        eyebrow: 'COMBO',
        titulo: promo.nombre,
        subtitulo: `Todo junto por ${formatoMoneda(promo.precio_combo)}.`,
      })
    }
  })

  // 2. Si no hay ninguna promoción activa, mostramos 1-2 productos frescos
  // al azar como escena por defecto (con foto real si el producto la tiene)
  if (escenas.length === 0 && productos.length > 0) {
    const disponibles = [...productos].sort(() => Math.random() - 0.5).slice(0, 3)
    disponibles.forEach(p => {
      escenas.push({
        eyebrow: 'FRESCO HOY',
        titulo: p.nombre,
        subtitulo: `${formatoMoneda(p.precio)}${p.tipo === 'peso' ? '/kg' : ''} · elegido para vos`,
        foto: p.foto_url || null,
      })
    })
  }

  return escenas
}

function mostrarEscenaHero(escena) {
  if (!escena) return
  elHeroEyebrow.textContent = escena.eyebrow
  elHeroTitulo.innerHTML = escena.titulo
  elHeroSubtitulo.textContent = escena.subtitulo
  if (escena.foto) {
    elHeroImgPrincipal.src = escena.foto
  }
}

function iniciarHeroRotativo() {
  heroEscenas = armarEscenasHero()
  heroIndice = 0
  if (heroInterval) clearInterval(heroInterval)

  if (heroEscenas.length === 0) return // se queda con el texto por defecto del HTML

  mostrarEscenaHero(heroEscenas[0])
  if (heroEscenas.length > 1) {
    heroInterval = setInterval(() => {
      heroIndice = (heroIndice + 1) % heroEscenas.length
      mostrarEscenaHero(heroEscenas[heroIndice])
    }, 5000)
  }
}

// Devuelve, si existe, el % de descuento de marketing vigente para un producto
// (por categoría o por producto específico). Regla de negocio: la rebaja
// automática por maduración (precio_original del lote) siempre gana sobre
// esto -- por eso precioPorCantidad() chequea primero esa condición.
function descuentoMarketingVigente(producto) {
  return promociones.find(promo =>
    promo.tipo === 'descuento_porcentual' && promo.categoria_id === producto.categoria_id
  )
}

document.querySelectorAll('.category-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    categoriaFiltroActiva = btn.dataset.categoria || ''
    document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    renderProductos()
  })
})

// Cuánto suma cada toque de +/- en productos por unidad
const PASO_UNIDAD = 1

function renderProductos() {
  elLista.innerHTML = ''
  const productosFiltrados = categoriaFiltroActiva
    ? productos.filter(p => {
        const cat = categorias.find(c => c.id === p.categoria_id)
        return cat && cat.nombre === categoriaFiltroActiva
      })
    : productos

  if (productosFiltrados.length === 0) {
    elLista.innerHTML = `<p class="muted">No hay productos en esta categoría todavía.</p>`
    return
  }

  productosFiltrados.forEach(p => {
    const cantidad = carrito[p.id] || 0
    const esPeso = p.tipo === 'peso'
    const unidad = esPeso ? '/kg' : ''
    const card = document.createElement('div')
    card.className = 'tarjeta-producto'

    let controles
    if (esPeso) {
      controles = cantidad > 0
        ? `<p class="resumen-peso">En el carrito: ${cantidad} kg · tocá la foto para editar</p>`
        : `<p class="muted resumen-peso">Tocá la foto para pesar</p>`
    } else if (cantidad === 0) {
      controles = `<button class="btn-agregar" data-id="${p.id}">Agregar</button>`
    } else {
      controles = `
        <div class="fila-cantidad">
          <button class="btn-cantidad" data-id="${p.id}" data-accion="restar">−</button>
          <input type="number" class="input-unidad" data-id="${p.id}" min="1" step="1" value="${cantidad}">
          <button class="btn-cantidad" data-id="${p.id}" data-accion="sumar">+</button>
        </div>`
    }

    const esOferta = p.precio_original && Number(p.precio_original) > Number(p.precio)
    const promoMkt = !esOferta ? descuentoMarketingVigente(p) : null
    const descuentoPct = esOferta
      ? Math.round((1 - p.precio / p.precio_original) * 100)
      : (promoMkt ? promoMkt.descuento_pct : 0)
    const precioMostrado = esOferta ? p.precio_original : p.precio
    const tieneAlgunDescuento = esOferta || !!promoMkt

    card.innerHTML = `
      <div class="foto-wrap">
        ${p.foto_url
          ? `<img class="foto-producto${esPeso ? ' foto-pesable' : ''}${cantidad > 0 ? ' en-carrito' : ''}" src="${p.foto_url}" alt="${p.nombre}" data-id="${p.id}" loading="lazy">`
          : `<div class="foto-producto foto-vacia${esPeso ? ' foto-pesable' : ''}${cantidad > 0 ? ' en-carrito' : ''}" data-id="${p.id}"></div>`
        }
        ${cantidad > 0 ? '<span class="badge-check">✓</span>' : ''}
        ${tieneAlgunDescuento ? `<span class="cinta-oferta">-${descuentoPct}%</span>` : ''}
      </div>
      <span class="nombre">${p.nombre}</span>
      <span class="precio">${formatoMoneda(precioMostrado)}${unidad}</span>
      ${controles}
      ${esOferta && esPeso ? `<p class="ejemplo-oferta">Llevando 2kg: ${formatoMoneda(p.precio * 2)}</p>` : ''}
    `
    elLista.appendChild(card)
  })
}

elLista.addEventListener('click', async (e) => {
  const foto = e.target.closest('.foto-pesable')
  if (foto) {
    abrirPesaje(foto.dataset.id)
    return
  }

  const btn = e.target.closest('button')
  if (!btn) return
  const id = btn.dataset.id

  if (btn.classList.contains('btn-agregar')) {
    await asegurarPedido()
    carrito[id] = PASO_UNIDAD
  } else if (btn.dataset.accion === 'sumar') {
    carrito[id] = (carrito[id] || 0) + PASO_UNIDAD
  } else if (btn.dataset.accion === 'restar') {
    carrito[id] = Math.max(0, (carrito[id] || 0) - PASO_UNIDAD)
    if (carrito[id] === 0) delete carrito[id]
  }
  renderProductos()
  actualizarBarraCarrito()
})

elLista.addEventListener('change', (e) => {
  const input = e.target.closest('.input-unidad')
  if (!input) return
  const valor = parseFloat(input.value)
  const id = input.dataset.id
  if (!valor || valor <= 0) {
    delete carrito[id]
  } else {
    carrito[id] = valor
  }
  renderProductos()
  actualizarBarraCarrito()
})

// --- Pantalla grande de pesaje ---
let pesajeProductoId = null
const elPesajeNombre = document.getElementById('pesaje-nombre')
const elPesajeInput = document.getElementById('pesaje-input')
const elPesajePrecioKg = document.getElementById('pesaje-precio-kg')
const elPesajeSubtotal = document.getElementById('pesaje-subtotal')
const vistaPesaje = document.getElementById('vista-pesaje')

function abrirPesaje(id) {
  const p = productos.find(p => p.id === id)
  if (!p) return
  pesajeProductoId = id
  elPesajeNombre.textContent = p.nombre
  elPesajeInput.value = carrito[id] || ''
  actualizarSubtotalPesaje()
  mostrar(vistaPesaje)
  elPesajeInput.focus()
  elPesajeInput.select()
}

function actualizarSubtotalPesaje() {
  const p = productos.find(p => p.id === pesajeProductoId)
  const kg = parseFloat(elPesajeInput.value) || 0
  if (p) {
    elPesajePrecioKg.textContent = `${formatoMoneda(precioPorCantidad(p, kg))}/kg`
  }
  elPesajeSubtotal.textContent = formatoMoneda(kg * (p ? precioPorCantidad(p, kg) : 0))
}

elPesajeInput.addEventListener('input', actualizarSubtotalPesaje)

document.getElementById('btn-cerrar-pesaje').addEventListener('click', () => mostrar(null))

document.getElementById('btn-agregar-pesaje').addEventListener('click', async () => {
  const valor = parseFloat(elPesajeInput.value)
  if (!valor || valor <= 0) {
    delete carrito[pesajeProductoId]
  } else {
    await asegurarPedido()
    carrito[pesajeProductoId] = valor
  }
  renderProductos()
  actualizarBarraCarrito()
  mostrar(null)
})

function totalCarrito() {
  return Object.entries(carrito).reduce((acc, [id, cant]) => {
    const p = productos.find(p => p.id === id)
    return acc + (p ? precioPorCantidad(p, cant) * cant : 0)
  }, 0)
}

function actualizarBarraCarrito() {
  const cantidadTotal = Object.values(carrito).reduce((a, b) => a + b, 0)
  if (cantidadTotal === 0) {
    elBarraCarrito.classList.add('oculto')
    return
  }
  elBarraCarrito.classList.remove('oculto')
  elCarritoCantidad.textContent = cantidadTotal
  elCarritoTotal.textContent = formatoMoneda(totalCarrito())
}

function renderCarrito() {
  elListaCarrito.innerHTML = ''
  Object.entries(carrito).forEach(([id, cant]) => {
    const p = productos.find(p => p.id === id)
    if (!p) return
    const fila = document.createElement('div')
    fila.className = 'fila-carrito'
    const unidad = p.tipo === 'peso' ? 'kg' : ''
    fila.innerHTML = `<span>${p.nombre} · ${cant}${unidad}</span><span>${formatoMoneda(precioPorCantidad(p, cant) * cant)}</span>`
    elListaCarrito.appendChild(fila)
  })
  elCarritoTotal2.textContent = formatoMoneda(totalCarrito())
}

document.getElementById('btn-ver-carrito').addEventListener('click', () => {
  renderCarrito()
  mostrar(vistaCarrito)
})
document.getElementById('btn-cerrar-carrito').addEventListener('click', () => mostrar(null))
document.getElementById('btn-ir-pago').addEventListener('click', () => mostrar(vistaPago))
document.getElementById('btn-cerrar-pago').addEventListener('click', () => {
  elPanelCombinado.classList.add('oculto')
  mostrar(vistaCarrito)
})

// --- Checkout ---
document.querySelectorAll('.metodo-pago[data-metodo]').forEach(btn => {
  if (btn.dataset.metodo === 'mercadopago') {
    btn.addEventListener('click', () => pagarConMercadoPago())
  } else {
    btn.addEventListener('click', () => confirmarPedido(btn.dataset.metodo))
  }
})

// El pago combinado necesita un paso extra (cuánto va en efectivo) antes de confirmar
const elPanelCombinado = document.getElementById('panel-combinado')
const elInputCombinadoEfectivo = document.getElementById('input-combinado-efectivo')
const elCombinadoTransferencia = document.getElementById('combinado-transferencia')

document.getElementById('btn-metodo-combinado').addEventListener('click', () => {
  elInputCombinadoEfectivo.value = ''
  elCombinadoTransferencia.textContent = formatoMoneda(totalCarrito())
  elPanelCombinado.classList.remove('oculto')
  elInputCombinadoEfectivo.focus()
})

elInputCombinadoEfectivo.addEventListener('input', () => {
  const efectivo = Number(elInputCombinadoEfectivo.value) || 0
  const restante = Math.max(totalCarrito() - efectivo, 0)
  elCombinadoTransferencia.textContent = formatoMoneda(restante)
})

document.getElementById('btn-confirmar-combinado').addEventListener('click', () => {
  const efectivo = Number(elInputCombinadoEfectivo.value)
  if (!efectivo || efectivo <= 0 || efectivo >= totalCarrito()) {
    alert('Poné un monto en efectivo mayor a $0 y menor al total (si es todo en un método, usá Efectivo o Transferencia directamente).')
    return
  }
  confirmarPedido('combinado', efectivo)
})

async function confirmarPedido(metodo, montoEfectivo) {
  if (!pedidoActualId) {
    alert('Todavía no agregaste nada al carrito.')
    return
  }

  const items = Object.entries(carrito).map(([producto_id, cantidad]) => {
    const p = productos.find(p => p.id === producto_id)
    const precio = precioPorCantidad(p, cantidad)
    return {
      pedido_id: pedidoActualId,
      producto_id,
      cantidad,
      precio_unitario: precio,
      subtotal: precio * cantidad
    }
  })

  // Por si esta función se llama más de una vez para el mismo pedido (reintentos,
  // doble click, un método que falló y se probó con otro), primero limpiamos
  // cualquier item que haya quedado de un intento anterior -- si no, se acumulan
  // y el pedido termina pidiendo mucho más de lo que el cliente puso en el carrito.
  await supabase.from('pedido_items').delete().eq('pedido_id', pedidoActualId)

  const { error: errorItems } = await supabase.from('pedido_items').insert(items)
  if (errorItems) {
    alert('Hubo un problema al cargar los productos. Probá de nuevo.')
    console.error(errorItems)
    return
  }

  const { data: total, error: errorConfirmar } = await supabase.rpc('confirmar_metodo_pago', {
    p_pedido_id: pedidoActualId,
    p_metodo: metodo,
    p_monto_efectivo: metodo === 'combinado' ? montoEfectivo : null
  })

  if (errorConfirmar) {
    const mensaje = errorConfirmar.message?.includes('stock')
      ? 'Uno de los productos ya no tiene stock suficiente. Ajustá la cantidad y probá de nuevo.'
      : 'No se pudo confirmar el pedido. Probá de nuevo.'
    alert(mensaje)
    console.error(errorConfirmar)
    return
  }

  elPanelCombinado.classList.add('oculto')
  mostrarEspera(metodo, total, montoEfectivo)
  carrito = {}
  renderProductos()
  actualizarBarraCarrito()
}

// --- Pago con Mercado Pago ---
// A diferencia de los otros métodos, acá no mostramos la pantalla de "esperando":
// mandamos al cliente directo a Mercado Pago a pagar, y vuelve a nuestras páginas
// de éxito/fallo/pendiente. El pedido queda registrado con estado "pendiente_mp"
// pendiente de confirmación manual desde el panel admin (por ahora).
async function pagarConMercadoPago() {
  if (!pedidoActualId) {
    alert('Todavía no agregaste nada al carrito.')
    return
  }

  const items = Object.entries(carrito).map(([producto_id, cantidad]) => {
    const p = productos.find(p => p.id === producto_id)
    const precio = precioPorCantidad(p, cantidad)
    return {
      pedido_id: pedidoActualId,
      producto_id,
      cantidad,
      precio_unitario: precio,
      subtotal: precio * cantidad
    }
  })

  // Por si esta función se llama más de una vez para el mismo pedido (reintentos,
  // doble click, un método que falló y se probó con otro), primero limpiamos
  // cualquier item que haya quedado de un intento anterior -- si no, se acumulan
  // y el pedido termina pidiendo mucho más de lo que el cliente puso en el carrito.
  await supabase.from('pedido_items').delete().eq('pedido_id', pedidoActualId)

  const { error: errorItems } = await supabase.from('pedido_items').insert(items)
  if (errorItems) {
    alert('Hubo un problema al cargar los productos. Probá de nuevo.')
    console.error(errorItems)
    return
  }

  const { error: errorConfirmar } = await supabase.rpc('confirmar_metodo_pago', {
    p_pedido_id: pedidoActualId,
    p_metodo: 'mercado_pago', // <-- CORREGIDO (antes decía 'mercadopago', sin guión bajo)
    p_monto_efectivo: null
  })

  if (errorConfirmar) {
    const mensaje = errorConfirmar.message?.includes('stock')
      ? 'Uno de los productos ya no tiene stock suficiente. Ajustá la cantidad y probá de nuevo.'
      : 'No se pudo confirmar el pedido. Probá de nuevo.'
    alert(mensaje)
    console.error(errorConfirmar)
    return
  }

  // Un solo ítem por línea con cantidad 1 (evita problemas con Mercado Pago
  // y cantidades fraccionadas, como 1.5 kg de algo)
  const itemsParaMP = Object.entries(carrito).map(([producto_id, cantidad]) => {
    const p = productos.find(p => p.id === producto_id)
    const totalLinea = precioPorCantidad(p, cantidad) * cantidad
    const nombre = p.tipo === 'peso' ? `${p.nombre} (${cantidad} kg)` : p.nombre
    return { nombre, cantidad: 1, precioUnitario: totalLinea }
  })

  let initPoint
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/crear-preferencia-pago`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ items: itemsParaMP, pedidoId: pedidoActualId })
    })
    const data = await resp.json()
    if (!resp.ok || !data.init_point) {
      throw new Error(data.error || 'Sin init_point')
    }
    initPoint = data.init_point
  } catch (err) {
    console.error(err)
    alert('No se pudo generar el link de pago de Mercado Pago. Probá con otro medio.')
    return
  }

  carrito = {}
  window.location.href = initPoint
}

function mostrarEspera(metodo, total, montoEfectivo) {
  document.getElementById('espera-numero-pedido').textContent = 'Pedido #' + pedidoNumeroCorto
  document.getElementById('espera-monto').textContent = formatoMoneda(total)

  let instrucciones
  if (metodo === 'efectivo') {
    instrucciones = 'Acercate al mostrador a pagar y retirar tu compra.'
  } else if (metodo === 'combinado') {
    instrucciones = `Transferí ${formatoMoneda(total - montoEfectivo)} y acercate al mostrador con ${formatoMoneda(montoEfectivo)} en efectivo.`
  } else {
    instrucciones = 'Transferí el total y esperá la confirmación acá mismo.'
  }
  document.getElementById('espera-instrucciones').textContent = instrucciones

  document.getElementById('espera-estado').textContent = 'Esperando confirmación'
  document.getElementById('espera-estado').className = 'espera-estado'
  document.getElementById('btn-nuevo-pedido').classList.add('oculto')
  mostrar(vistaEspera)
  iniciarPolling()
}

function iniciarPolling() {
  if (pollingInterval) clearInterval(pollingInterval)
  pollingInterval = setInterval(async () => {
    const { data: estado, error } = await supabase.rpc('obtener_estado_pedido', {
      pedido_id: pedidoActualId
    })
    if (error) {
      console.error(error)
      return
    }
    if (estado === 'pagado') {
      document.getElementById('espera-estado').textContent = 'Pago confirmado'
      document.getElementById('espera-estado').className = 'espera-estado pagado'
      document.getElementById('btn-nuevo-pedido').classList.remove('oculto')
      clearInterval(pollingInterval)
    } else if (estado === 'vencido' || estado === 'cancelado') {
      document.getElementById('espera-estado').textContent =
        estado === 'cancelado' ? 'Pedido cancelado' : 'Pedido vencido'
      document.getElementById('espera-estado').className = 'espera-estado vencido'
      document.getElementById('btn-nuevo-pedido').classList.remove('oculto')
      clearInterval(pollingInterval)
    }
  }, 3000)
}

document.getElementById('btn-nuevo-pedido').addEventListener('click', () => {
  pedidoActualId = null
  pedidoNumeroCorto = null
  elBadgePedido.classList.add('oculto')
  mostrar(null)
})

// --- Service worker (para que se pueda instalar y funcione offline el shell) ---
const SERVICE_WORKER_ACTIVO = false

if (SERVICE_WORKER_ACTIVO && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error)
  })
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister())
  })
}

cargarProductos()
