import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaCompras = document.getElementById('vista-compras')

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// Esta página no tiene su propio login: si no hay sesión activa (por ejemplo
// entraron directo a esta URL sin pasar por admin.html), la mandamos para allá.
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaCompras.classList.remove('oculto')
  cargarProductosParaCompraYMerma()
}

// --- Pestañas ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('activa'))
    tab.classList.add('activa')
    document.getElementById('panel-compra').classList.toggle('oculto', tab.dataset.tab !== 'compra')
    document.getElementById('panel-merma').classList.toggle('oculto', tab.dataset.tab !== 'merma')
  })
})

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
