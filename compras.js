import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaCompras = document.getElementById('vista-compras')

// Esta página vive protegida por la sesión que ya abriste en admin.html.
// Si entrás acá directo sin haber iniciado sesión, te manda de vuelta.
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaCompras.classList.remove('oculto')
  cargarProductosParaCompraYMerma()
}

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Pestañas ---
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('activa'))
    btn.classList.add('activa')
    document.getElementById('panel-compra').classList.toggle('oculto', btn.dataset.tab !== 'compra')
    document.getElementById('panel-merma').classList.toggle('oculto', btn.dataset.tab !== 'merma')
    document.getElementById('panel-deposito').classList.toggle('oculto', btn.dataset.tab !== 'deposito')
    if (btn.dataset.tab === 'deposito') cargarDeposito()
  })
})

// --- Selector de madurez inicial (Recién llega / A mitad / Para vender ya) ---
let madurezSeleccionada = 0
const grupoMadurez = document.getElementById('grupo-madurez')
grupoMadurez.addEventListener('click', (e) => {
  const btn = e.target.closest('.opcion-btn')
  if (!btn) return
  grupoMadurez.querySelectorAll('.opcion-btn').forEach(b => b.classList.remove('activa'))
  btn.classList.add('activa')
  madurezSeleccionada = Number(btn.dataset.valor)
})

function resetearMadurez() {
  madurezSeleccionada = 0
  grupoMadurez.querySelectorAll('.opcion-btn').forEach(b => b.classList.remove('activa'))
  grupoMadurez.querySelector('.opcion-btn[data-valor="0"]').classList.add('activa')
}

const elSwitchUbicacion = document.getElementById('compra-ubicacion')

// --- Productos (compartido entre compra y merma) ---
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
    .select('id, nombre, tipo, precio, margen_objetivo_pct')
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

// Stock vendible actual del producto elegido (suma de sus lotes en salón)
async function actualizarInfoProductoCompra() {
  const p = productoSeleccionado(selectCompraProducto.value)
  if (!p) return

  elCompraMargen.value = p.margen_objetivo_pct ?? ''
  elCompraSugerencia.classList.add('oculto')

  const { data, error } = await supabase
    .from('lotes')
    .select('cantidad_restante')
    .eq('producto_id', p.id)
    .eq('ubicacion', 'salon')
    .gt('cantidad_restante', 0)

  if (error) {
    console.error(error)
    return
  }

  const total = data.reduce((a, l) => a + Number(l.cantidad_restante), 0)
  const unidad = p.tipo === 'peso' ? 'kg' : 'unidades'
  elCompraStockActual.textContent = `En salón: ${total} ${unidad}`
  elCompraStockActual.classList.remove('oculto')
}

selectCompraProducto.addEventListener('change', actualizarInfoProductoCompra)

// El margen se guarda al toque, apenas lo cambian.
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

// --- Registrar compra (crea un lote nuevo) ---
document.getElementById('form-compra').addEventListener('submit', async (e) => {
  e.preventDefault()
  elCompraError.classList.add('oculto')
  elCompraSugerencia.classList.add('oculto')

  const producto = productoSeleccionado(selectCompraProducto.value)
  const cantidad = Number(document.getElementById('compra-cantidad').value)
  const costoTotal = Number(document.getElementById('compra-costo').value)
  const proveedor = document.getElementById('compra-proveedor').value.trim() || null
  const ubicacion = elSwitchUbicacion.checked ? 'salon' : 'deposito'

  const boton = e.target.querySelector('button[type="submit"]')
  boton.disabled = true

  const { data, error } = await supabase.rpc('registrar_compra', {
    p_producto_id: producto.id,
    p_cantidad: cantidad,
    p_costo_total: costoTotal,
    p_proveedor: proveedor,
    p_avance_madurez_pct: madurezSeleccionada,
    p_ubicacion: ubicacion
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
  resetearMadurez()
  elSwitchUbicacion.checked = true

  await actualizarInfoProductoCompra()

  // Buscamos el precio con el que quedó el lote recién creado, para mostrarlo
  // aunque no haya margen configurado (en ese caso usó el precio actual del producto).
  const { data: loteNuevo } = await supabase
    .from('lotes')
    .select('precio')
    .eq('id', resultado.lote_id)
    .single()

  document.getElementById('sug-precio-actual').textContent = formatoMoneda(loteNuevo?.precio ?? 0)

  if (resultado.precio_sugerido == null) {
    // No hay margen objetivo configurado para este producto: no hay nada para sugerir,
    // el lote ya quedó con el precio que tenía el producto.
    return
  }

  document.getElementById('sug-costo').textContent = formatoMoneda(resultado.costo_unitario)
  document.getElementById('sug-precio').textContent = formatoMoneda(resultado.precio_sugerido)
  elCompraSugerencia.classList.remove('oculto')
  elCompraSugerencia.dataset.loteId = resultado.lote_id
  elCompraSugerencia.dataset.precioSugerido = resultado.precio_sugerido
})

document.getElementById('btn-usar-sugerido').addEventListener('click', async () => {
  const loteId = elCompraSugerencia.dataset.loteId
  const precio = Number(elCompraSugerencia.dataset.precioSugerido)

  const { error } = await supabase
    .from('lotes')
    .update({ precio })
    .eq('id', loteId)

  if (error) {
    alert('No se pudo actualizar el precio del lote. Probá de nuevo.')
    console.error(error)
    return
  }
  elCompraSugerencia.classList.add('oculto')
})

document.getElementById('btn-mantener-precio').addEventListener('click', () => {
  elCompraSugerencia.classList.add('oculto')
})

// --- Registrar merma ---
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
  await actualizarInfoProductoCompra()
})

// --- Depósito: lotes esperando pasar a salón ---
const elListaDeposito = document.getElementById('lista-deposito')

async function cargarDeposito() {
  elListaDeposito.innerHTML = '<p class="muted">Cargando…</p>'

  const { data, error } = await supabase
    .from('lotes')
    .select('id, cantidad_restante, fecha_ingreso, productos(nombre, tipo)')
    .eq('ubicacion', 'deposito')
    .gt('cantidad_restante', 0)
    .order('fecha_ingreso', { ascending: true })

  if (error) {
    console.error(error)
    elListaDeposito.innerHTML = '<p class="muted">No se pudo cargar el depósito.</p>'
    return
  }

  if (data.length === 0) {
    elListaDeposito.innerHTML = '<p class="muted">No hay lotes en depósito.</p>'
    return
  }

  const hoy = new Date()
  elListaDeposito.innerHTML = ''
  data.forEach(lote => {
    const unidad = lote.productos?.tipo === 'peso' ? 'kg' : 'unidades'
    const dias = Math.floor((hoy - new Date(lote.fecha_ingreso)) / 86400000)
    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'
    fila.innerHTML = `
      <div class="item-detalle">
        <span>${lote.productos?.nombre || '?'} · ${lote.cantidad_restante} ${unidad} · ${dias}d</span>
        <button class="btn-confirmar btn-pasar-salon" data-id="${lote.id}">Pasar a salón</button>
      </div>
    `
    elListaDeposito.appendChild(fila)
  })
}

elListaDeposito.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-pasar-salon')
  if (!btn) return
  btn.disabled = true

  const { error } = await supabase
    .from('lotes')
    .update({ ubicacion: 'salon' })
    .eq('id', btn.dataset.id)

  if (error) {
    alert('No se pudo mover el lote. Probá de nuevo.')
    console.error(error)
    btn.disabled = false
    return
  }
  cargarDeposito()
})
