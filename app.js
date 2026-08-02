import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Conexión a Supabase (proyecto "once") ---
// Estas dos claves son públicas por diseño, está bien que vivan acá.
const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- Estado en memoria ---
let productos = []
let carrito = {} // { producto_id: cantidad }
let pedidoActualId = null
let pollingInterval = null

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

function mostrar(vista) {
  ;[vistaCarrito, vistaPago, vistaEspera, document.getElementById('vista-pesaje')].forEach(v => v.classList.add('oculto'))
  if (vista) vista.classList.remove('oculto')
}

// --- Cargar catálogo ---
async function cargarProductos() {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('disponible', true)
    .order('nombre')

  if (error) {
    elLista.innerHTML = `<p class="muted">No se pudo cargar el catálogo. Probá de nuevo en un rato.</p>`
    console.error(error)
    return
  }

  productos = data
  renderProductos()
}

// Cuánto suma cada toque de +/- en productos por unidad
const PASO_UNIDAD = 1

function renderProductos() {
  elLista.innerHTML = ''
  productos.forEach(p => {
    const cantidad = carrito[p.id] || 0
    const esPeso = p.tipo === 'peso'
    const unidad = esPeso ? '/kg' : ''
    const card = document.createElement('div')
    card.className = 'tarjeta-producto'

    let controles
    if (esPeso) {
      // La foto es el botón: tocarla abre la pantalla grande de pesaje.
      // Acá abajo solo mostramos un resumen de lo que ya está en el carrito.
      controles = cantidad > 0
        ? `<p class="resumen-peso">En el carrito: ${cantidad} kg · tocá la foto para editar</p>`
        : `<p class="muted resumen-peso">Tocá la foto para pesar</p>`
    } else if (cantidad === 0) {
      controles = `<button class="btn-agregar" data-id="${p.id}">Agregar</button>`
    } else {
      // Por unidad: +/-1 para ajustes rápidos, pero el número también se puede tipear
      // directo (para "cartón de 35 huevos" nadie va a tocar + treinta y cinco veces)
      controles = `
        <div class="fila-cantidad">
          <button class="btn-cantidad" data-id="${p.id}" data-accion="restar">−</button>
          <input type="number" class="input-unidad" data-id="${p.id}" min="1" step="1" value="${cantidad}">
          <button class="btn-cantidad" data-id="${p.id}" data-accion="sumar">+</button>
        </div>`
    }

    card.innerHTML = `
      <div class="foto-wrap">
        ${p.foto_url
          ? `<img class="foto-producto${esPeso ? ' foto-pesable' : ''}${cantidad > 0 ? ' en-carrito' : ''}" src="${p.foto_url}" alt="${p.nombre}" data-id="${p.id}" loading="lazy">`
          : `<div class="foto-producto foto-vacia${esPeso ? ' foto-pesable' : ''}${cantidad > 0 ? ' en-carrito' : ''}" data-id="${p.id}"></div>`
        }
        ${cantidad > 0 ? '<span class="badge-check">✓</span>' : ''}
      </div>
      <span class="nombre">${p.nombre}</span>
      <span class="precio">${formatoMoneda(p.precio)}${unidad}</span>
      ${controles}
    `
    elLista.appendChild(card)
  })
}

elLista.addEventListener('click', (e) => {
  const foto = e.target.closest('.foto-pesable')
  if (foto) {
    abrirPesaje(foto.dataset.id)
    return
  }

  const btn = e.target.closest('button')
  if (!btn) return
  const id = btn.dataset.id

  if (btn.classList.contains('btn-agregar')) {
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

// Cuando tipean directo la cantidad de unidades (ej. "35" para un cartón de huevos)
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
  elPesajePrecioKg.textContent = `${formatoMoneda(p.precio)}/kg`
  elPesajeInput.value = carrito[id] || ''
  actualizarSubtotalPesaje()
  mostrar(vistaPesaje)
  elPesajeInput.focus()
  elPesajeInput.select()
}

function actualizarSubtotalPesaje() {
  const p = productos.find(p => p.id === pesajeProductoId)
  const kg = parseFloat(elPesajeInput.value) || 0
  elPesajeSubtotal.textContent = formatoMoneda(kg * (p ? p.precio : 0))
}

elPesajeInput.addEventListener('input', actualizarSubtotalPesaje)

document.getElementById('btn-cerrar-pesaje').addEventListener('click', () => mostrar(null))

document.getElementById('btn-agregar-pesaje').addEventListener('click', () => {
  const valor = parseFloat(elPesajeInput.value)
  if (!valor || valor <= 0) {
    delete carrito[pesajeProductoId]
  } else {
    carrito[pesajeProductoId] = valor
  }
  renderProductos()
  actualizarBarraCarrito()
  mostrar(null)
})

function totalCarrito() {
  return Object.entries(carrito).reduce((acc, [id, cant]) => {
    const p = productos.find(p => p.id === id)
    return acc + (p ? p.precio * cant : 0)
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
    fila.innerHTML = `<span>${p.nombre} · ${cant}${unidad}</span><span>${formatoMoneda(p.precio * cant)}</span>`
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
document.getElementById('btn-cerrar-pago').addEventListener('click', () => mostrar(vistaCarrito))

// --- Checkout ---
document.querySelectorAll('.metodo-pago[data-metodo]').forEach(btn => {
  btn.addEventListener('click', () => crearPedido(btn.dataset.metodo))
})

async function crearPedido(metodo) {
  const estadoInicial = metodo === 'efectivo' ? 'pendiente_efectivo' : 'pendiente_transferencia'
  const total = totalCarrito()
  const nuevoPedidoId = crypto.randomUUID()

  const { error: errorPedido } = await supabase
    .from('pedidos')
    .insert({ id: nuevoPedidoId, estado: estadoInicial, metodo_pago: metodo, monto_total: total })

  if (errorPedido) {
    alert('No se pudo crear el pedido. Probá de nuevo.')
    console.error(errorPedido)
    return
  }

  const items = Object.entries(carrito).map(([producto_id, cantidad]) => {
    const p = productos.find(p => p.id === producto_id)
    return {
      pedido_id: nuevoPedidoId,
      producto_id,
      cantidad,
      precio_unitario: p.precio,
      subtotal: p.precio * cantidad
    }
  })

  const { error: errorItems } = await supabase.from('pedido_items').insert(items)
  if (errorItems) {
    alert('El pedido se creó pero hubo un problema con los productos. Avisá en el mostrador.')
    console.error(errorItems)
  }

  pedidoActualId = nuevoPedidoId
  mostrarEspera(metodo, total)
  carrito = {}
  renderProductos()
  actualizarBarraCarrito()
}

function mostrarEspera(metodo, total) {
  document.getElementById('espera-numero-pedido').textContent =
    'Pedido #' + pedidoActualId.slice(0, 8)
  document.getElementById('espera-monto').textContent = formatoMoneda(total)
  document.getElementById('espera-instrucciones').textContent =
    metodo === 'efectivo'
      ? 'Acercate al mostrador a pagar y retirar tu compra.'
      : 'Transferí el total y esperá la confirmación acá mismo.'
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
      document.getElementById('espera-estado').textContent = 'Pedido vencido'
      document.getElementById('espera-estado').className = 'espera-estado vencido'
      document.getElementById('btn-nuevo-pedido').classList.remove('oculto')
      clearInterval(pollingInterval)
    }
  }, 3000)
}

document.getElementById('btn-nuevo-pedido').addEventListener('click', () => {
  pedidoActualId = null
  mostrar(null)
})

// --- Service worker (para que se pueda instalar y funcione offline el shell) ---
// El service worker queda pausado mientras seguimos probando cambios seguido:
// el cacheo agresivo estaba haciendo que vieran versiones viejas todo el tiempo.
// Lo reactivamos cuando el sistema esté estable, para la versión "final".
const SERVICE_WORKER_ACTIVO = false

if (SERVICE_WORKER_ACTIVO && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error)
  })
} else if ('serviceWorker' in navigator) {
  // Por las dudas, si alguien ya tenía uno registrado de antes, lo sacamos
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister())
  })
}

cargarProductos()
