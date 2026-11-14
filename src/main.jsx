import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Sprout, LayoutDashboard, Package, LogOut, RefreshCw, QrCode, Search,
  MapPin, ShieldCheck, AlertCircle, Leaf, Menu, X, Landmark, LockKeyhole,
  ExternalLink, CheckCircle2, FileText, ArrowRight, Info, ClipboardList,
  AlertTriangle, Clock, PlusCircle, ShieldAlert, KeyRound
} from 'lucide-react';
import './style.css';
import Modules from './Modules.jsx';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
const fmt = (v) => (v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const rows = (v) => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : []);

export async function request(path, { token, headers = {}, ...opts } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        Accept: 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw Error(`No fue posible conectar con ${API}. Verifica que el backend esté encendido y que VITE_API_URL sea correcto.`);
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    let m = d.error || d.message || `Error HTTP ${res.status}`;
    if (d.detalles && typeof d.detalles === 'object') {
      const flat = Object.entries(d.detalles)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join(' | ');
      if (flat) m = `${m} (${flat})`;
    }
    if (path === '/auth/login' && String(m).toLowerCase().includes('token requerido')) {
      m = `El inicio de sesión está llegando a una ruta protegida. URL consultada: ${API}${path}. Revisa VITE_API_URL.`;
    }
    throw Error(m);
  }
  return d;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('siga_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('siga_user') || 'null');
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState(location.pathname.startsWith('/trazabilidad/') ? 'public' : 'dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Login & password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ actual: '', nueva: '' });

  // Datos principales
  const [productos, setProductos] = useState([]);
  const [predios, setPredios] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [desactualizados, setDesactualizados] = useState([]);
  const [qr, setQr] = useState(null);
  const [trace, setTrace] = useState(null);
  const [search, setSearch] = useState('');
  const [mobile, setMobile] = useState(false);
  const [publicCode, setPublicCode] = useState(
    location.pathname.startsWith('/trazabilidad/') ? location.pathname.split('/').pop() || '' : ''
  );

  // Formulario de creación de lote
  const [form, setForm] = useState({
    predio_id: '',
    producto_id: '',
    cantidad: '',
    unidad: 'KG',
    identificador_externo: '',
    fecha_siembra: '',
    fecha_cosecha: '',
  });

  // Modal de trazabilidad / eventos de un lote (GET /lotes/:id/eventos y POST /lotes/:id/eventos)
  const [selectedLot, setSelectedLot] = useState(null);
  const [lotEvents, setLotEvents] = useState([]);
  const [chainCheck, setChainCheck] = useState(null);
  const [eventForm, setEventForm] = useState({ tipo_evento: 'SIEMBRA', nota: '', latitud: '', longitud: '' });

  const isStaff = ['EXTENSIONISTA', 'ENTIDAD', 'ADMIN'].includes(user?.rol);
  const canCreateLot = ['PRODUCTOR', 'EXTENSIONISTA', 'ADMIN'].includes(user?.rol);

  const fail = (e) => {
    setError(e.message || 'Ocurrió un error inesperado.');
    setNotice('');
  };

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!d.token) throw Error('El servidor no entregó un token de sesión.');
      localStorage.setItem('siga_token', d.token);
      localStorage.setItem('siga_user', JSON.stringify(d.usuario || {}));
      setToken(d.token);
      setUser(d.usuario || {});
      setPage('dashboard');
      setPassword('');
      setNotice('Sesión iniciada correctamente.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem('siga_token');
    localStorage.removeItem('siga_user');
    setToken('');
    setUser(null);
    setQr(null);
    setResumen(null);
    setPage('dashboard');
    setError('');
  }

  async function load() {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const me = await request('/auth/me', { token });
      setUser(me);
      localStorage.setItem('siga_user', JSON.stringify(me));

      const baseCalls = [
        request('/catalogos/productos'),
        request('/predios?limit=100&page=1', { token }),
        request('/lotes?limit=100&page=1', { token }),
      ];

      if (['ENTIDAD', 'EXTENSIONISTA', 'ADMIN'].includes(me.rol)) {
        baseCalls.push(request('/dashboard/resumen', { token }).catch(() => null));
        baseCalls.push(request('/dashboard/lotes-desactualizados', { token }).catch(() => []));
      }

      const [p, pr, l, resDash, desactDash] = await Promise.all(baseCalls);
      const ps = rows(p);
      const fs = rows(pr);
      setProductos(ps);
      setPredios(fs);
      setLotes(rows(l));
      if (resDash) setResumen(resDash);
      if (desactDash) setDesactualizados(rows(desactDash));

      setForm((f) => ({
        ...f,
        producto_id: f.producto_id || (ps[0] ? String(ps[0].id) : ''),
        predio_id: f.predio_id || (fs[0] ? String(fs[0].id) : ''),
      }));
    } catch (e) {
      if (/token inválido|token requerido|inexistente o inactivo/i.test(e.message)) logout();
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function createLot(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setQr(null);
    try {
      const payload = {
        ...form,
        predio_id: Number(form.predio_id),
        producto_id: Number(form.producto_id),
        cantidad: Number(form.cantidad),
      };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '') delete payload[k];
      });
      const d = await request('/lotes', { token, method: 'POST', body: JSON.stringify(payload) });
      setQr(d);
      setNotice('Lote creado correctamente. El código QR está disponible para descargar.');
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function openLotTrace(lot) {
    setSelectedLot(lot);
    setLotEvents([]);
    setChainCheck(null);
    setEventForm({
      tipo_evento: lot.categoria === 'PECUARIO' ? 'ACOPIO' : 'COSECHA',
      nota: '',
      latitud: '',
      longitud: '',
    });
    try {
      const [evs, ver] = await Promise.all([
        request(`/lotes/${lot.id}/eventos`, { token }),
        request(`/lotes/${lot.id}/verificar-cadena`, { token }),
      ]);
      setLotEvents(Array.isArray(evs) ? evs : []);
      setChainCheck(ver);
    } catch (e) {
      fail(e);
    }
  }

  async function addLotEvent(e) {
    e.preventDefault();
    if (!selectedLot) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        tipo_evento: eventForm.tipo_evento,
        ...(eventForm.nota.trim() ? { detalle: { nota: eventForm.nota.trim() } } : {}),
        ...(eventForm.latitud !== '' ? { latitud: Number(eventForm.latitud) } : {}),
        ...(eventForm.longitud !== '' ? { longitud: Number(eventForm.longitud) } : {}),
      };
      await request(`/lotes/${selectedLot.id}/eventos`, {
        token,
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNotice(`Evento ${eventForm.tipo_evento} encadenado correctamente al lote #${selectedLot.id}.`);
      setEventForm((v) => ({ ...v, nota: '' }));
      await openLotTrace(selectedLot);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/auth/cambiar-password', {
        token,
        method: 'POST',
        body: JSON.stringify(pwdForm),
      });
      setNotice('Contraseña actualizada correctamente.');
      setPwdForm({ actual: '', nueva: '' });
      setPwdModal(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function searchTrace(e) {
    e?.preventDefault();
    if (!publicCode.trim()) return;
    setBusy(true);
    setError('');
    setTrace(null);
    try {
      setTrace(await request(`/public/trazabilidad/${encodeURIComponent(publicCode.trim())}`));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (page === 'public' && publicCode) searchTrace();
  }, []);

  const filtered = useMemo(
    () =>
      lotes.filter((x) =>
        `${x.codigo_trazabilidad || ''} ${x.producto || ''} ${x.predio || ''} ${x.estado || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [lotes, search]
  );

  if (page === 'public') {
    return (
      <PublicPage
        code={publicCode}
        setCode={setPublicCode}
        trace={trace}
        error={error}
        busy={busy}
        onSearch={searchTrace}
        onBackToLogin={!token ? () => { setPage('dashboard'); setError(''); } : null}
      />
    );
  }

  if (!token) {
    return (
      <LoginPage
        {...{
          email,
          setEmail,
          password,
          setPassword,
          showPassword,
          setShowPassword,
          login,
          busy,
          error,
          onOpenPublic: () => {
            setError('');
            setPage('public');
          },
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <aside className={`sidebar ${mobile ? 'open' : ''}`} aria-label="Navegación principal">
        <GovBrand light />
        <div className="brand-divider" />
        <div className="product-brand">
          <div className="brand-icon"><Sprout /></div>
          <div>
            <b>SIGA</b>
            <small>Gestión agropecuaria</small>
          </div>
        </div>
        <p className="side-label">MENÚ PRINCIPAL</p>
        <nav>
          <button
            className={`nav ${page === 'dashboard' ? 'active' : ''}`}
            aria-current={page === 'dashboard' ? 'page' : undefined}
            onClick={() => { setPage('dashboard'); setMobile(false); }}
          >
            <LayoutDashboard /><span>Panel principal</span>
          </button>
          <button
            className={`nav ${page === 'lotes' ? 'active' : ''}`}
            aria-current={page === 'lotes' ? 'page' : undefined}
            onClick={() => { setPage('lotes'); setMobile(false); }}
          >
            <Package /><span>Lotes y trazabilidad</span>
          </button>
          <button
            className={`nav ${page === 'gestion' ? 'active' : ''}`}
            aria-current={page === 'gestion' ? 'page' : undefined}
            onClick={() => { setPage('gestion'); setMobile(false); }}
          >
            <ClipboardList /><span>Gestión integral</span>
          </button>
        </nav>

        <div className="side-bottom">
          <div className="security-note">
            <ShieldCheck />
            <span>
              Acceso institucional<br />
              <b>{user?.entidad_sigla ? `Entidad: ${user.entidad_sigla}` : 'Sesión protegida'}</b>
            </span>
          </div>
          <div className="user-chip">
            <div className="avatar">{(user?.nombre || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <div>
              <b>{user?.nombre || user?.email || 'Usuario'}</b>
              <small>{user?.rol || 'Usuario'}{user?.entidad_sigla ? ` · ${user.entidad_sigla}` : ''}</small>
            </div>
          </div>
          <button className="nav" onClick={() => setPwdModal(true)}>
            <KeyRound /><span>Cambiar contraseña</span>
          </button>
          <button className="nav" onClick={logout}>
            <LogOut /><span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {mobile && <button className="mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMobile(false)} />}

      <main className="main" id="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label={mobile ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
          <div className="breadcrumbs">
            <span>Inicio</span>
            <span>/</span>
            <b>
              {page === 'dashboard'
                ? 'Panel principal'
                : page === 'gestion'
                ? 'Gestión integral'
                : 'Lotes y trazabilidad'}
            </b>
          </div>
          <span className="top-user"><i /> {user?.rol}{user?.entidad_sigla ? ` (${user.entidad_sigla})` : ''}</span>
        </header>

        <div className="content">
          <div className="institutional-line">
            <span>Ministerio de Agricultura y Desarrollo Rural</span>
            <span>República de Colombia</span>
          </div>

          {error && (
            <div className="alert error" role="alert">
              <AlertCircle />
              <span>{error}</span>
              <button aria-label="Cerrar error" onClick={() => setError('')}><X /></button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 />
              <span>{notice}</span>
              <button aria-label="Cerrar notificación" onClick={() => setNotice('')}><X /></button>
            </div>
          )}

          {pwdModal && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">SEGURIDAD DE CUENTA</p>
                  <h2>Cambiar contraseña</h2>
                </div>
                <button className="text-button" onClick={() => setPwdModal(false)}>Cancelar</button>
              </div>
              <form className="module-form" onSubmit={changePassword}>
                <div className="module-fields">
                  <label className="module-field">
                    Contraseña actual
                    <input
                      type="password"
                      required
                      value={pwdForm.actual}
                      onChange={(e) => setPwdForm({ ...pwdForm, actual: e.target.value })}
                    />
                  </label>
                  <label className="module-field">
                    Nueva contraseña (mínimo 8 caracteres)
                    <input
                      type="password"
                      minLength={8}
                      required
                      value={pwdForm.nueva}
                      onChange={(e) => setPwdForm({ ...pwdForm, nueva: e.target.value })}
                    />
                  </label>
                </div>
                <button className="primary-button" disabled={busy}>Actualizar contraseña</button>
              </form>
            </section>
          )}

          {page === 'gestion' ? (
            <Modules
              api={(path, opts = {}) => request(path, { ...opts, token })}
              user={user}
              onError={setError}
              onNotice={setNotice}
            />
          ) : page === 'dashboard' ? (
            <>
              <PageHeading
                title="Panel principal"
                eyebrow="SISTEMA DE INFORMACIÓN Y GESTIÓN AGROPECUARIA"
                description="Consulta el estado de los registros y los indicadores operativos disponibles para tu rol."
                action={() => load()}
                busy={busy}
              />

              {isStaff && resumen ? (
                <>
                  <div className="stats">
                    <Stat
                      icon={<ShieldCheck />}
                      label={`Productores (${resumen.productores?.validados ?? 0} validados)`}
                      value={resumen.productores?.total ?? 0}
                    />
                    <Stat
                      icon={<MapPin />}
                      label={`Predios (${resumen.predios?.verificados ?? 0} verificados)`}
                      value={resumen.predios?.total ?? 0}
                    />
                    <Stat
                      icon={<Package />}
                      label={`Lotes (${resumen.lotes?.bloqueados ?? 0} bloqueados)`}
                      value={resumen.lotes?.total ?? 0}
                    />
                    <Stat
                      icon={<AlertTriangle />}
                      label="Alertas sanitarias abiertas"
                      value={resumen.alertas_sanitarias_abiertas ?? 0}
                    />
                    <Stat
                      icon={<FileText />}
                      label={`Exportaciones (${resumen.exportaciones?.aprobadas ?? 0} aprobadas)`}
                      value={`${resumen.exportaciones?.pendientes ?? 0} pend.`}
                    />
                    <Stat
                      icon={<Clock />}
                      label={`KPI Trazabilidad < 24h (Meta ${resumen.kpis?.meta_pct_actualizados_24h ?? 70}%)`}
                      value={
                        resumen.kpis?.pct_lotes_actualizados_24h != null
                          ? `${resumen.kpis.pct_lotes_actualizados_24h}%`
                          : 'N/A'
                      }
                    />
                  </div>

                  {desactualizados.length > 0 && (
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <p className="section-kicker">ALERTA OPERATIVA (REGLA 21/22)</p>
                          <h2>Lotes en curso sin actualización en más de 24 horas</h2>
                          <p className="sub">{desactualizados.length} lotes requieren seguimiento en campo.</p>
                        </div>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Producto</th>
                              <th>Predio</th>
                              <th>Estado</th>
                              <th>Horas sin actualizar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {desactualizados.slice(0, 5).map((d, idx) => (
                              <tr key={d.lote_id || d.id || idx}>
                                <td className="mono">{d.codigo_trazabilidad}</td>
                                <td><b>{d.producto}</b></td>
                                <td>{d.predio}</td>
                                <td><span className="status-tag">{d.estado}</span></td>
                                <td><b>{d.horas_sin_actualizar} h</b></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <div className="stats">
                  <Stat icon={<Package />} label="Lotes registrados" value={lotes.length} />
                  <Stat icon={<MapPin />} label="Predios disponibles" value={predios.length} />
                  <Stat icon={<Leaf />} label="Productos en catálogo" value={productos.length} />
                </div>
              )}

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <p className="section-kicker">SEGUIMIENTO</p>
                    <h2>Actividad reciente</h2>
                    <p className="sub">Últimos lotes registrados en el sistema.</p>
                  </div>
                  <button className="text-button" onClick={() => setPage('lotes')}>
                    Consultar todos <ArrowRight />
                  </button>
                </div>
                <LotTable lots={lotes.slice(0, 5)} onInspect={openLotTrace} />
              </section>
            </>
          ) : (
            <>
              <PageHeading
                title="Lotes y trazabilidad"
                eyebrow="GESTIÓN Y CONTROL"
                description="Registra lotes de producción, encadena eventos de custodia y consulta códigos QR."
                action={() => load()}
                busy={busy}
              />

              {canCreateLot && (
                <div className="two-col">
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <p className="section-kicker">NUEVO REGISTRO</p>
                        <h2>Registrar un lote</h2>
                        <p className="sub">Los campos marcados con * son obligatorios.</p>
                      </div>
                      <span className="tag">Formulario</span>
                    </div>
                    <form className="lot-form" onSubmit={createLot}>
                      <label htmlFor="farm">Predio <span className="required">*</span></label>
                      <select
                        id="farm"
                        value={form.predio_id}
                        onChange={(e) => setForm({ ...form, predio_id: e.target.value })}
                        required
                      >
                        <option value="">Selecciona un predio</option>
                        {predios.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}{p.municipio ? ` · ${p.municipio}` : ''}
                            {Number(p.ubicacion_verificada) === 1 ? ' ✓' : ' (Sin verificar)'}
                          </option>
                        ))}
                      </select>

                      <label htmlFor="product">Producto <span className="required">*</span></label>
                      <select
                        id="product"
                        value={form.producto_id}
                        onChange={(e) => {
                          const p = productos.find((x) => String(x.id) === e.target.value);
                          setForm({
                            ...form,
                            producto_id: e.target.value,
                            unidad: p?.unidad_medida || (p?.categoria === 'PECUARIO' ? 'CABEZAS' : 'KG'),
                          });
                        }}
                        required
                      >
                        <option value="">Selecciona un producto</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.categoria})
                          </option>
                        ))}
                      </select>

                      <div className="form-row">
                        <div>
                          <label htmlFor="quantity">Cantidad <span className="required">*</span></label>
                          <input
                            id="quantity"
                            type="number"
                            min="0.01"
                            step="any"
                            value={form.cantidad}
                            onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                            required
                            placeholder="Ej. 250"
                          />
                        </div>
                        <div>
                          <label htmlFor="unit">Unidad</label>
                          <select
                            id="unit"
                            value={form.unidad}
                            onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                          >
                            <option>KG</option>
                            <option>TON</option>
                            <option>CABEZAS</option>
                          </select>
                        </div>
                      </div>

                      {productos.find((p) => String(p.id) === form.producto_id)?.categoria === 'PECUARIO' && (
                        <>
                          <label htmlFor="external-id">
                            Identificador externo (arete / ID ICA) <span className="required">*</span>
                          </label>
                          <input
                            id="external-id"
                            value={form.identificador_externo}
                            onChange={(e) => setForm({ ...form, identificador_externo: e.target.value })}
                            required
                          />
                        </>
                      )}

                      <div className="form-row">
                        <div>
                          <label htmlFor="planting-date">Fecha de siembra</label>
                          <input
                            id="planting-date"
                            type="date"
                            value={form.fecha_siembra}
                            onChange={(e) => setForm({ ...form, fecha_siembra: e.target.value })}
                          />
                        </div>
                        <div>
                          <label htmlFor="harvest-date">Fecha de cosecha</label>
                          <input
                            id="harvest-date"
                            type="date"
                            value={form.fecha_cosecha}
                            onChange={(e) => setForm({ ...form, fecha_cosecha: e.target.value })}
                          />
                        </div>
                      </div>

                      <button className="primary-button full" disabled={busy || !predios.length || !productos.length}>
                        <QrCode />{busy ? 'Procesando registro…' : 'Crear lote y generar código QR'}
                      </button>
                      {!predios.length && (
                        <p className="hint" role="status">
                          No hay predios disponibles para esta cuenta. Registra y verifica un predio primero.
                        </p>
                      )}
                    </form>
                  </section>

                  <section className="panel qr-panel">
                    <div className="panel-head">
                      <div>
                        <p className="section-kicker">IDENTIFICACIÓN DIGITAL</p>
                        <h2>Código QR del lote</h2>
                        <p className="sub">Se genera automáticamente al guardar el registro.</p>
                      </div>
                      <QrCode />
                    </div>
                    {qr ? (
                      <div className="qr-result">
                        <img src={qr.qr} alt={`Código QR para consultar lote ${qr.codigo_trazabilidad || qr.id}`} />
                        <h3>Lote #{qr.id}</h3>
                        <p className="mono">{qr.codigo_trazabilidad}</p>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setPublicCode(qr.codigo_trazabilidad);
                            setPage('public');
                            searchTrace();
                          }}
                        >
                          Probar vista ciudadana <ExternalLink />
                        </button>
                        <a className="primary-button download" href={qr.qr} download={`SIGA-QR-${qr.id}.png`}>
                          Descargar código QR (PNG)
                        </a>
                      </div>
                    ) : (
                      <div className="empty-qr">
                        <div><QrCode /></div>
                        <h3>El código QR aparecerá aquí</h3>
                        <p>Completa el formulario y guarda el lote para generar su identificador de trazabilidad.</p>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {selectedLot && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="section-kicker">CADENA DE CUSTODIA · HASH ENCADENADO</p>
                      <h2>Trazabilidad Lote #{selectedLot.id} · {selectedLot.producto}</h2>
                      <p className="sub mono">{selectedLot.codigo_trazabilidad}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {chainCheck && (
                        <span className={`verification-tag ${chainCheck.integra ? 'valid' : ''}`}>
                          {chainCheck.integra
                            ? `Cadena íntegra (${chainCheck.total_eventos} eventos)`
                            : 'Alerta de integridad'}
                        </span>
                      )}
                      <button className="text-button" onClick={() => setSelectedLot(null)}>Cerrar</button>
                    </div>
                  </div>

                  <form className="module-form" onSubmit={addLotEvent}>
                    <h3>Registrar nuevo evento en cadena de custodia</h3>
                    <div className="module-fields">
                      <label className="module-field">
                        Tipo de evento
                        <select
                          value={eventForm.tipo_evento}
                          onChange={(e) => setEventForm({ ...eventForm, tipo_evento: e.target.value })}
                        >
                          {['SIEMBRA', 'COSECHA', 'ACOPIO', 'TRANSPORTE', 'VENTA', 'INSPECCION_SANITARIA'].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <label className="module-field">
                        Observación / Detalle
                        <input
                          placeholder="Ej. Cosecha verificada en lote norte"
                          value={eventForm.nota}
                          onChange={(e) => setEventForm({ ...eventForm, nota: e.target.value })}
                        />
                      </label>
                      <label className="module-field">
                        Latitud (opcional)
                        <input
                          type="number"
                          step="any"
                          placeholder="Ej. 4.6097"
                          value={eventForm.latitud}
                          onChange={(e) => setEventForm({ ...eventForm, latitud: e.target.value })}
                        />
                      </label>
                      <label className="module-field">
                        Longitud (opcional)
                        <input
                          type="number"
                          step="any"
                          placeholder="Ej. -74.0817"
                          value={eventForm.longitud}
                          onChange={(e) => setEventForm({ ...eventForm, longitud: e.target.value })}
                        />
                      </label>
                    </div>
                    <button className="primary-button" disabled={busy}>
                      <PlusCircle /> Encadenar evento
                    </button>
                  </form>

                  {lotEvents.length ? (
                    <ol className="timeline">
                      {lotEvents.map((e, i) => (
                        <li className="event" key={e.id || i}>
                          <span className="event-dot" />
                          <div>
                            <b>{e.tipo_evento}</b>
                            <small>
                              {fmt(e.fecha_evento)} · Origen: {e.origen}
                              {e.detalle?.nota ? ` · "${e.detalle.nota}"` : ''}
                            </small>
                            <code>Hash: {e.hash_evento}</code>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="sub">Aún no hay eventos encadenados para este lote.</p>
                  )}
                </section>
              )}

              <section className="panel">
                <div className="panel-head responsive-head">
                  <div>
                    <p className="section-kicker">REGISTROS DEL SISTEMA</p>
                    <h2>Lotes registrados</h2>
                    <p className="sub">{lotes.length} registros disponibles para esta cuenta.</p>
                  </div>
                  <div className="search-box">
                    <label className="sr-only" htmlFor="lot-search">Buscar</label>
                    <Search />
                    <input
                      id="lot-search"
                      type="search"
                      placeholder="Buscar registros…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <LotTable lots={filtered} onInspect={openLotTrace} />
              </section>
            </>
          )}

          <footer className="app-footer">
            <span>Ministerio de Agricultura y Desarrollo Rural</span>
            <span>SIGA · Sistema de Información y Gestión Agropecuaria</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function GovBrand({ light = false }) {
  return (
    <div className={`gov-brand ${light ? 'light' : ''}`}>
      <div className="gov-symbol"><Landmark /></div>
      <div>
        <strong>Ministerio de Agricultura</strong>
        <span>y Desarrollo Rural · Colombia</span>
      </div>
    </div>
  );
}

function PageHeading({ title, eyebrow, description, action, busy }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="sub">{description}</p>
      </div>
      <button className="secondary-button" onClick={action} disabled={busy}>
        <RefreshCw className={busy ? 'spin' : ''} /> Actualizar datos
      </button>
    </div>
  );
}

function LoginPage({ email, setEmail, password, setPassword, showPassword, setShowPassword, login, busy, error, onOpenPublic }) {
  return (
    <div className="login-page">
      <a className="skip-link" href="#login-form">Saltar al formulario de acceso</a>
      <div className="gov-topline"><i /><i /><i /></div>
      <header className="login-header">
        <GovBrand />
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <button type="button" className="secondary-button" onClick={onOpenPublic}>
            <QrCode /> Consulta ciudadana QR
          </button>
          <span className="header-classification">PORTAL INSTITUCIONAL</span>
        </div>
      </header>

      <main className="login-layout">
        <section className="login-intro">
          <p className="eyebrow">SISTEMA DE INFORMACIÓN Y GESTIÓN AGROPECUARIA</p>
          <h1>Información del campo para una gestión <em>transparente y trazable.</em></h1>
          <p className="intro-copy">
            SIGA integra información de productores, predios y lotes para apoyar el seguimiento de la actividad agropecuaria.
          </p>
          <div className="intro-points">
            <div><ShieldCheck /><span><b>Acceso seguro</b><small>Ingreso mediante credenciales registradas (MADR, ICA, DIAN, ANT).</small></span></div>
            <div><QrCode /><span><b>Trazabilidad</b><small>Consulta de lotes mediante código QR y hash encadenado.</small></span></div>
            <div><FileText /><span><b>Información organizada</b><small>Registros centralizados para su gestión y exportación.</small></span></div>
          </div>
        </section>

        <section className="login-card-wrap">
          <form id="login-form" className="login-card" onSubmit={login} aria-labelledby="login-title">
            <div className="login-lock"><LockKeyhole /></div>
            <p className="section-kicker">ÁREA DE USUARIOS</p>
            <h2 id="login-title">Iniciar sesión</h2>
            <p className="sub">Ingresa con el correo y la contraseña asociados a tu cuenta SIGA.</p>
            {error && <div className="alert error" role="alert"><AlertCircle /><span>{error}</span></div>}
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nombre@entidad.gov.co"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Escribe tu contraseña"
                />
                <button
                  type="button"
                  className="show-password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <button className="primary-button full login-submit" disabled={busy}>
              {busy ? 'Validando acceso…' : 'Ingresar al sistema'} <ArrowRight />
            </button>
            <div className="login-security">
              <ShieldCheck /><span>Autenticación gestionada por el servicio SIGA.</span>
            </div>
          </form>
          <p className="help-note">
            <Info /> Si no tienes una cuenta o no puedes ingresar, comunícate con el administrador autorizado de SIGA.
          </p>
        </section>
      </main>

      <footer className="login-footer">
        <span>© Ministerio de Agricultura y Desarrollo Rural</span>
        <span>Colombia · Servicio institucional</span>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <article className="stat">
      <div className="stat-icon" aria-hidden="true">{icon}</div>
      <div><p>{label}</p><strong>{value}</strong></div>
    </article>
  );
}

function LotTable({ lots, onInspect }) {
  if (!lots.length) {
    return <div className="empty"><Package /><p>No hay lotes para mostrar.</p></div>;
  }
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Listado de lotes registrados en SIGA</caption>
        <thead>
          <tr>
            <th scope="col">Producto y código</th>
            <th scope="col">Predio</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Estado</th>
            <th scope="col">Registro</th>
            {onInspect && <th scope="col">Trazabilidad</th>}
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id}>
              <td>
                <b>{l.producto || 'Producto sin nombre'}</b>
                <small>{l.codigo_trazabilidad || 'Sin código'}</small>
              </td>
              <td>
                {l.predio || '—'}
                <small>{l.municipio || ''}</small>
              </td>
              <td>{l.cantidad ?? '—'} {l.unidad || ''}</td>
              <td>
                <span className="status-tag">
                  {l.bloqueado ? 'BLOQUEADO (ICA)' : l.estado || 'Sin estado'}
                </span>
              </td>
              <td>{fmt(l.creado_en || l.fecha_creacion)}</td>
              {onInspect && (
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => onInspect(l)}>Línea de tiempo</button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublicPage({ code, setCode, trace, error, busy, onSearch, onBackToLogin }) {
  return (
    <div className="public-page">
      <a className="skip-link" href="#public-content">Saltar al contenido principal</a>
      <div className="gov-topline"><i /><i /><i /></div>
      <header className="public-header">
        <GovBrand />
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {onBackToLogin && (
            <button type="button" className="secondary-button" onClick={onBackToLogin}>
              Volver al inicio de sesión
            </button>
          )}
          <div className="public-siga"><Sprout /> SIGA</div>
        </div>
      </header>
      <main id="public-content" className="public-content">
        <div className="public-heading">
          <p className="eyebrow">SERVICIO DE CONSULTA CIUDADANA</p>
          <h1>Consulta pública de trazabilidad</h1>
          <p>Verifica la información de origen y el recorrido registrado de un producto agropecuario.</p>
        </div>
        <section className="public-card">
          <div className="public-card-title">
            <div className="public-icon"><QrCode /></div>
            <div>
              <h2>Consultar un lote</h2>
              <p>Ingresa el código UUID de trazabilidad que aparece en la etiqueta o escanea el código QR.</p>
            </div>
          </div>
          <form className="public-search" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="trace-code">Código de trazabilidad</label>
            <input
              id="trace-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ej. 550e8400-e29b-41d4-a716-446655440000"
              required
            />
            <button className="primary-button" disabled={busy}>
              {busy ? 'Consultando…' : 'Consultar trazabilidad'}
            </button>
          </form>
          {error && <div className="alert error" role="alert"><AlertCircle />{error}</div>}
          {trace && (
            <>
              <div className="verified"><ShieldCheck /> INFORMACIÓN DEL LOTE CONSULTADO</div>
              <div className="trace-title">
                <div>
                  <p className="section-kicker">PRODUCTO</p>
                  <h2>{trace.lote.producto}</h2>
                </div>
                <span className="status-tag">{trace.lote.estado}</span>
              </div>
              <div className="trace-grid">
                <InfoItem label="Categoría" value={trace.lote.categoria} />
                <InfoItem label="Cantidad" value={`${trace.lote.cantidad} ${trace.lote.unidad}`} />
                <InfoItem label="Municipio" value={trace.lote.municipio} />
                <InfoItem label="Departamento" value={trace.lote.departamento} />
                <InfoItem label="Fecha de cosecha" value={trace.lote.fecha_cosecha || 'No registrada'} />
                <InfoItem label="Estado de bloqueo" value={trace.lote.bloqueado ? 'Bloqueado (Alerta sanitaria)' : 'Sin bloqueo'} />
              </div>
              <section className="chain">
                <div className="panel-head">
                  <div>
                    <h2>Historial de trazabilidad</h2>
                    <p className="sub">Eventos asociados al lote consultado.</p>
                  </div>
                  <span className={`verification-tag ${trace.verificacion?.integra ? 'valid' : ''}`}>
                    {trace.verificacion?.integra ? 'Cadena verificada' : 'Verificación no confirmada'}
                  </span>
                </div>
                {trace.linea_tiempo?.length ? (
                  <ol className="timeline">
                    {trace.linea_tiempo.map((e, i) => (
                      <li className="event" key={`${e.tipo_evento}-${i}`}>
                        <span className="event-dot" />
                        <div>
                          <b>{e.tipo_evento}</b>
                          <small>{fmt(e.fecha_evento)} · {e.origen || 'Origen no indicado'}</small>
                          <code>{e.hash_evento}</code>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="sub">Aún no hay eventos registrados para este lote.</p>
                )}
              </section>
            </>
          )}
        </section>
        <p className="public-disclaimer">
          La información mostrada corresponde a los datos públicos disponibles en SIGA. No se exponen datos personales del productor.
        </p>
      </main>
      <footer className="public-footer">Ministerio de Agricultura y Desarrollo Rural · República de Colombia</footer>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <b>{value || '—'}</b>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);