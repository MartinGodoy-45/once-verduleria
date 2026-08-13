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
    loginError.textContent = error.message
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
    .in('estado', ['pendiente_efectivo', 'pendiente_transferencia', 'pendiente_combinado', 'pendiente_mp'])
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
    const metodoTexto = pedido.metodo_pago === 'efectivo'
      ? 'Efectivo'
      : pedido.metodo_pago === 'combinado'
        ? `Combinado (${formatoMoneda(pedido.monto_efectivo)} efectivo + ${formatoMoneda(pedido.monto_transferencia)} transf.)`
        : pedido.metodo_pago === 'mercado_pago'
          ? 'Mercado Pago'
          : 'Transferencia'
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

// Por si quedó un Service Worker viejo registrado (de una versión anterior con
// caché agresivo), lo sacamos siempre, para que esta página nunca quede pegada
// mostrando una copia vieja de sí misma.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister())
  })
}
