import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaLogin = document.getElementById('vista-login')
const vistaPanel = document.getElementById('vista-panel')
const formLogin = document.getElementById('form-login')
const loginError = document.getElementById('login-error')
const listaPendientes = document.getElementById('lista-pendientes')
const resumenHoy = document.getElementById('resumen-hoy')

let refrescoInterval = null

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Login ---
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault()
  loginError.classList.add('oculto')
  const email = document.getElementById('login-email').value
  const password = document.getElementById('login-password').value

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    loginError.textContent = 'Email o contraseña incorrectos.'
    loginError.classList.remove('oculto')
    return
  }
  mostrarPanel()
})

document.getElementById('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  clearInterval(refrescoInterval)
  vistaPanel.classList.add('oculto')
  vistaLogin.classList.remove('oculto')
})

// Si ya había una sesión activa (no cerró sesión la última vez), entra directo
const { data: { session } } = await supabase.auth.getSession()
if (session) mostrarPanel()

function mostrarPanel() {
  vistaLogin.classList.add('oculto')
  vistaPanel.classList.remove('oculto')
  cargarPendientes()
  cargarResumenHoy()
  cargarProductosParaCompraYMerma()
  refrescoInterval = setInterval(() => {
    cargarPendientes()
    cargarResumenHoy()
  }, 5000)
}

// --- Pendientes de confirmar ---
async function cargarPendientes() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .in('estado', ['pendiente_efectivo', 'pendiente_transferencia'])
    .order('creado_en', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  if (data.length === 0) {
    listaPendientes.innerHTML = '<p class="muted">No hay pedidos pendientes.</p>'
    return
  }

  // Traemos los items de todos los pedidos pendientes en paralelo
  const pedidosConItems = await Promise.all(
    data.map(async (pedido) => {
      const { data: items } = await supabase
        .from('pedido_items')
        .select('cantidad, subtotal, productos(nombre, tipo)')
        .eq('pedido_id', pedido.id)
      return { ...pedido, items: items || [] }
    })
  )

  // Antes de redibujar, anotamos qué pedidos tenía abiertos, para no cerrarlos de golpe
  const abiertos = new Set(
    Array.from(listaPendientes.querySelectorAll('details[open]')).map(d => d.dataset.id)
  )

  listaPendientes.innerHTML = ''
  pedidosConItems.forEach(pedido => {
    const metodoTexto = pedido.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'
    const filaItems = pedido.items.map(it => {
      const unidad = it.productos?.tipo === 'peso' ? 'kg' : ''
      return `<div class="item-detalle">
        <span>${it.productos?.nombre || '?'} · ${it.cantidad}${unidad}</span>
        <span>${formatoMoneda(it.subtotal)}</span>
      </div>`
    }).join('')

    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'
    fila.innerHTML = `
      <details class="detalle-pedido" data-id="${pedido.id}" ${abiertos.has(pedido.id) ? 'open' : ''}>
        <summary>
          <span class="fila-titulo">Pedido #${pedido.numero_corto}</span>
          <span class="muted">${formatoMoneda(pedido.monto_total)} · ${metodoTexto}</span>
        </summary>
        <div class="detalle-items">${filaItems || '<p class="muted">Sin productos cargados</p>'}</div>
        <div class="acciones-pedido">
          <button class="btn-confirmar" data-id="${pedido.id}">Confirmar</button>
          <button class="btn-cancelar" data-id="${pedido.id}">Cancelar</button>
        </div>
      </details>
    `
    listaPendientes.appendChild(fila)
  })
}

listaPendientes.addEventListener('click', async (e) => {
  const btnCancelar = e.target.closest('.btn-cancelar')
  if (btnCancelar) {
    if (!confirm('¿Cancelar este pedido? No se puede deshacer.')) return
    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'cancelado' })
      .eq('id', btnCancelar.dataset.id)
    if (error) {
      alert('No se pudo cancelar. Probá de nuevo.')
      console.error(error)
      return
    }
    cargarPendientes()
    return
  }

  const btn = e.target.closest('.btn-confirmar')
  if (!btn) return
  btn.disabled = true
  btn.textContent = '...'

  const { error } = await supabase
    .from('pedidos')
    .update({ estado: 'pagado', pagado_en: new Date().toISOString() })
    .eq('id', btn.dataset.id)

  if (error) {
    alert('No se pudo confirmar. Probá de nuevo.')
    console.error(error)
    btn.disabled = false
    btn.textContent = 'Confirmar'
    return
  }
  cargarPendientes()
  cargarResumenHoy()
})

// --- Resumen del día ---
async function cargarResumenHoy() {
  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('pedidos')
    .select('monto_total, metodo_pago')
    .eq('estado', 'pagado')
    .gte('pagado_en', inicioHoy.toISOString())

  if (error) {
    console.error(error)
    return
  }

  const totalVendido = data.reduce((a, p) => a + Number(p.monto_total), 0)
  const totalEfectivo = data
    .filter(p => p.metodo_pago === 'efectivo')
    .reduce((a, p) => a + Number(p.monto_total), 0)
  const totalDigital = totalVendido - totalEfectivo

  resumenHoy.innerHTML = `
    <div class="resumen-item"><span class="muted">Vendido</span><strong>${formatoMoneda(totalVendido)}</strong></div>
    <div class="resumen-item"><span class="muted">Pedidos</span><strong>${data.length}</strong></div>
    <div class="resumen-item"><span class="muted">Digital</span><strong>${formatoMoneda(totalDigital)}</strong></div>
    <div class="resumen-item"><span class="muted">Efectivo</span><strong>${formatoMoneda(totalEfectivo)}</strong></div>
  `
}

// --- Compras y mermas ---

// Guardamos acá la lista completa de productos (todos, no solo disponibles)
// para no ir a buscarla de nuevo cada vez que cambian el select.
let productosCompraMerma = []

const selectCompraProducto = document.getElementById('compra-producto')
const selectMermaProducto = document.getElementById('merma-producto')
const elCompraStockActual = document.getElementById('compra-stock-actual')
const elCompraMargen = document.getElementById('compra-margen')
const elCompraError = document.getElementById('compra-error')
const elMermaError = document.getElementById('merma-error')
const elCompraSugerencia = document.getElementById('compra-sugerencia')

async function cargarProductosParaCompraYMerma() {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, tipo, stock, precio, margen_objetivo_pct')
    .order('nombre')

  if (error) {
    console.error(error)
    return
  }

  productosCompraMerma = data
  const opciones = data.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')
  selectCompraProducto.innerHTML = opciones
  selectMermaProducto.innerHTML = opciones

  actualizarInfoProductoCompra()
}

function productoSeleccionado(id) {
  return productosCompraMerma.find(p => p.id === id)
}

function actualizarInfoProductoCompra() {
  const p = productoSeleccionado(selectCompraProducto.value)
  if (!p) return

  if (p.tipo === 'unidad') {
    elCompraStockActual.textContent = `Stock actual: ${p.stock ?? 0} unidades`
    elCompraStockActual.classList.remove('oculto')
  } else {
    elCompraStockActual.classList.add('oculto')
  }

  elCompraMargen.value = p.margen_objetivo_pct ?? ''
  elCompraSugerencia.classList.add('oculto')
}

selectCompraProducto.addEventListener('change', actualizarInfoProductoCompra)

// El margen se guarda al toque, apenas lo cambian, para no depender de que
// después registren una compra -- así también sirve para consultarlo después.
elCompraMargen.addEventListener('change', async () => {
  const p = productoSeleccionado(selectCompraProducto.value)
  if (!p) return
  const valor = elCompraMargen.value === '' ? null : Number(elCompraMargen.value)

  const { error } = await supabase
    .from('productos')
    .update({ margen_objetivo_pct: valor })
    .eq('id', p.id)

  if (error) {
    console.error(error)
    return
  }
  p.margen_objetivo_pct = valor
})

document.getElementById('form-compra').addEventListener('submit', async (e) => {
  e.preventDefault()
  elCompraError.classList.add('oculto')
  elCompraSugerencia.classList.add('oculto')

  const producto = productoSeleccionado(selectCompraProducto.value)
  const cantidad = Number(document.getElementById('compra-cantidad').value)
  const costoTotal = Number(document.getElementById('compra-costo').value)
  const proveedor = document.getElementById('compra-proveedor').value.trim() || null

  const boton = e.target.querySelector('button[type="submit"]')
  boton.disabled = true

  const { data, error } = await supabase.rpc('registrar_compra', {
    p_producto_id: producto.id,
    p_cantidad: cantidad,
    p_costo_total: costoTotal,
    p_proveedor: proveedor
  })

  boton.disabled = false

  if (error) {
    elCompraError.textContent = error.message || 'No se pudo registrar la compra.'
    elCompraError.classList.remove('oculto')
    console.error(error)
    return
  }

  const resultado = data[0]
  document.getElementById('compra-cantidad').value = ''
  document.getElementById('compra-costo').value = ''
  document.getElementById('compra-proveedor').value = ''

  // Refrescamos productos (cambió el stock, y quizás el margen)
  await cargarProductosParaCompraYMerma()
  selectCompraProducto.value = producto.id
  actualizarInfoProductoCompra()

  if (resultado.precio_sugerido == null) {
    // No hay margen objetivo configurado para este producto: no hay nada para sugerir.
    return
  }

  document.getElementById('sug-costo').textContent = formatoMoneda(resultado.costo_unitario)
  document.getElementById('sug-precio').textContent = formatoMoneda(resultado.precio_sugerido)
  document.getElementById('sug-precio-actual').textContent = formatoMoneda(producto.precio)
  elCompraSugerencia.classList.remove('oculto')
  elCompraSugerencia.dataset.productoId = producto.id
  elCompraSugerencia.dataset.precioSugerido = resultado.precio_sugerido
})

document.getElementById('btn-usar-sugerido').addEventListener('click', async () => {
  const productoId = elCompraSugerencia.dataset.productoId
  const precio = Number(elCompraSugerencia.dataset.precioSugerido)

  const { error } = await supabase
    .from('productos')
    .update({ precio })
    .eq('id', productoId)

  if (error) {
    alert('No se pudo actualizar el precio. Probá de nuevo.')
    console.error(error)
    return
  }
  elCompraSugerencia.classList.add('oculto')
  await cargarProductosParaCompraYMerma()
  selectCompraProducto.value = productoId
  actualizarInfoProductoCompra()
})

document.getElementById('btn-mantener-precio').addEventListener('click', () => {
  elCompraSugerencia.classList.add('oculto')
})

document.getElementById('form-merma').addEventListener('submit', async (e) => {
  e.preventDefault()
  elMermaError.classList.add('oculto')

  const producto = productoSeleccionado(selectMermaProducto.value)
  const cantidad = Number(document.getElementById('merma-cantidad').value)
  const motivo = document.getElementById('merma-motivo').value

  const boton = e.target.querySelector('button[type="submit"]')
  boton.disabled = true

  const { error } = await supabase.rpc('registrar_merma', {
    p_producto_id: producto.id,
    p_cantidad: cantidad,
    p_motivo: motivo
  })

  boton.disabled = false

  if (error) {
    elMermaError.textContent = error.message || 'No se pudo registrar la merma.'
    elMermaError.classList.remove('oculto')
    console.error(error)
    return
  }

  document.getElementById('merma-cantidad').value = ''
  await cargarProductosParaCompraYMerma()
  selectMermaProducto.value = producto.id
})
