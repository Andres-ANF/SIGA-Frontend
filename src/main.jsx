
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Sprout,
  LayoutDashboard,
  Package,
  LogOut,
  RefreshCw,
  QrCode,
  Search,
  MapPin,
  ShieldCheck,
  AlertCircle,
  Leaf,
  Menu,
  X,
  Landmark,
  LockKeyhole,
  ExternalLink,
  CheckCircle2,
  FileText,
  ArrowRight,
  Info,
  PlusCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  KeyRound
} from 'lucide-react';
import { ClipboardList } from 'lucide-react';
import './style.css';
import Modules from './Modules.jsx';

const API = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
).replace(/\/+$/, '');

const fmt = v =>
  v
    ? new Date(v).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : '—';

const rows = v =>
  Array.isArray(v)
    ? v
    : Array.isArray(v?.data)
      ? v.data
      : [];

function extractEvents(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.eventos)) return response.eventos;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const dateA = new Date(a.fecha_evento || 0).getTime();
    const dateB = new Date(b.fecha_evento || 0).getTime();
    return dateB - dateA;
  });
}

async function request(path, { token, headers = {}, ...opts } = {}) {
  let res;

  try {
    res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        Accept: 'application/json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    });
  } catch {
    throw Error(
      `No fue posible conectar con ${API}. Verifica que el backend esté encendido y que VITE_API_URL sea correcto.`
    );
  }

  const d = await res.json().catch(() => ({}));

  if (!res.ok) {
    let m = d.error || d.message || `Error HTTP ${res.status}`;

    if (
      path === '/auth/login' &&
      String(m).toLowerCase().includes('token requerido')
    ) {
      m = `El inicio de sesión está llegando a una ruta protegida. URL consultada: ${API}${path}. Revisa VITE_API_URL y confirma que esté activo el backend SIGA correcto.`;
    }

    throw Error(m);
  }

  return d;
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem('siga_token') || ''
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('siga_user') || 'null');
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState(() => {
    const path = window.location.pathname;

    return (
      path.startsWith('/consulta/') ||
      path.startsWith('/trazabilidad/')
    )
      ? 'public'
      : 'dashboard';
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ actual: '', nueva: '' });
  const [resumen, setResumen] = useState(null);
  const [desactualizados, setDesactualizados] = useState([]);

  const [productos, setProductos] = useState([]);
  const [predios, setPredios] = useState([]);
  const [lotes, setLotes] = useState([]);

  const [qr, setQr] = useState(null);
  const [trace, setTrace] = useState(null);
  const [search, setSearch] = useState('');
  const [mobile, setMobile] = useState(false);

  const [publicCode, setPublicCode] = useState(() => {
    const path = window.location.pathname;

    if (
      path.startsWith('/consulta/') ||
      path.startsWith('/trazabilidad/')
    ) {
      try {
        return decodeURIComponent(
          path.split('/').filter(Boolean).pop() || ''
        );
      } catch {
        return path.split('/').filter(Boolean).pop() || '';
      }
    }

    return '';
  });

  // Evita que las consultas públicas se ejecuten simultáneamente.
  const traceRequestRef = useRef(false);

  const [form, setForm] = useState({
    predio_id: '',
    producto_id: '',
    cantidad: '',
    unidad: 'KG',
    identificador_externo: '',
    fecha_siembra: '',
    fecha_cosecha: ''
  });

  const [selectedLot, setSelectedLot] = useState(null);
  const [lotDetail, setLotDetail] = useState(null);
  const [lotEvents, setLotEvents] = useState([]);

  const [lastMovementByLot, setLastMovementByLot] = useState({});
  const [recentMovements, setRecentMovements] = useState([]);

  const [eventForm, setEventForm] = useState({
    tipo_evento: 'SIEMBRA',
    nota: '',
    latitud: '',
    longitud: ''
  });

  const isStaff = ['EXTENSIONISTA', 'ENTIDAD', 'ADMIN'].includes(user?.rol);
  const canCreateLot = ['PRODUCTOR', 'EXTENSIONISTA', 'ADMIN'].includes(user?.rol);

  const fail = e => {
    setError(e.message || 'Ocurrió un error inesperado.');
    setNotice('');
  };

  function logout() {
    localStorage.removeItem('siga_token');
    localStorage.removeItem('siga_user');

    setToken('');
    setUser(null);
    setQr(null);
    setSelectedLot(null);
    setLotDetail(null);
    setLotEvents([]);
    setLastMovementByLot({});
    setRecentMovements([]);
    setPage('dashboard');
    setError('');
    setNotice('');
  }

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const d = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });

      if (!d.token) {
        throw Error(
          'El servidor no entregó un token de sesión. Revisa la respuesta de /auth/login.'
        );
      }

      localStorage.setItem('siga_token', d.token);
      localStorage.setItem(
        'siga_user',
        JSON.stringify(d.usuario || {})
      );

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

  // Cargar movimientos recientes de los lotes.
  const loadRecentMovements = useCallback(async (currentLots, currentToken) => {
    if (!currentToken || !currentLots.length) {
      setLastMovementByLot({});
      setRecentMovements([]);
      return;
    }

    const results = await Promise.allSettled(
      currentLots.map(async lot => {
        const response = await request(
          `/lotes/${lot.id}/eventos`,
          { token: currentToken }
        );

        const events = sortEvents(extractEvents(response));
        const latest = events[0];

        return latest
          ? {
              ...latest,
              lote_id: lot.id,
              producto: lot.producto || 'Producto',
              codigo_trazabilidad: lot.codigo_trazabilidad || ''
            }
          : null;
      })
    );

    const movements = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .filter(Boolean)
      .sort((a, b) => {
        return (
          new Date(b.fecha_evento || 0).getTime() -
          new Date(a.fecha_evento || 0).getTime()
        );
      });

    const movementMap = {};

    movements.forEach(movement => {
      movementMap[movement.lote_id] = movement;
    });

    setLastMovementByLot(movementMap);
    setRecentMovements(movements.slice(0, 5));
  }, []);

  // Actualizar información general.
  async function load({ showLoading = true } = {}) {
    if (!token) return;

    if (showLoading) setBusy(true);
    setError('');

    try {
      const me = await request('/auth/me', { token });
      setUser(me);
      localStorage.setItem('siga_user', JSON.stringify(me));

      const baseCalls = [
        request('/catalogos/productos'),
        request('/predios?limit=100&page=1', { token }),
        request('/lotes?limit=100&page=1', { token })
      ];

      if (['ENTIDAD', 'EXTENSIONISTA', 'ADMIN'].includes(me.rol)) {
        baseCalls.push(request('/dashboard/resumen', { token }).catch(() => null));
        baseCalls.push(request('/dashboard/lotes-desactualizados', { token }).catch(() => []));
      }

      const [p, pr, l, resDash, desactDash] = await Promise.all(baseCalls);

      const ps = rows(p);
      const fs = rows(pr);
      const ls = rows(l);

      setProductos(ps);
      setPredios(fs);
      setLotes(ls);
      if (resDash) setResumen(resDash);
      if (desactDash) setDesactualizados(rows(desactDash));

      setForm(f => ({
        ...f,
        producto_id:
          f.producto_id || (ps[0] ? String(ps[0].id) : ''),
        predio_id:
          f.predio_id || (fs[0] ? String(fs[0].id) : '')
      }));

      await loadRecentMovements(ls, token);

    } catch (e) {
      if (
        /token inválido|token requerido|inexistente o inactivo/i.test(
          e.message
        )
      ) {
        logout();
      }

      fail(e);
    } finally {
      if (showLoading) setBusy(false);
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  // Crear lote y generar un QR que abra la página pública de SIGA.
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
        cantidad: Number(form.cantidad)
      };

      Object.keys(payload).forEach(k => {
        if (payload[k] === '') delete payload[k];
      });

      const d = await request('/lotes', {
        token,
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const codigo = d.codigo_trazabilidad;

      if (!codigo) {
        throw Error(
          'El lote se creó, pero el servidor no devolvió el código de trazabilidad.'
        );
      }

      // Esta es la página visual de consulta, no el endpoint JSON.
      const consultaUrl = `${window.location.origin}/consulta/${encodeURIComponent(
        codigo
      )}`;

      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        consultaUrl
      )}`;

      setQr({
        ...d,
        url_trazabilidad: consultaUrl,
        qr: qrImageUrl
      });

      setNotice(
        'Lote creado correctamente. El código QR abre la consulta pública de SIGA.'
      );

      await load({ showLoading: false });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  // Consultar detalle e historial del lote.
  async function openLotTrace(lot) {
    setSelectedLot(lot);
    setLotDetail(null);
    setLotEvents([]);
    setError('');
    setNotice('');

    setEventForm({
      tipo_evento:
        lot.categoria === 'PECUARIO' ? 'ACOPIO' : 'SIEMBRA',
      nota: '',
      latitud: '',
      longitud: ''
    });

    setBusy(true);

    try {
      const [detailResponse, eventsResponse] = await Promise.all([
        request(`/lotes/${lot.id}`, { token }),
        request(`/lotes/${lot.id}/eventos`, { token })
      ]);

      const detail =
        detailResponse.lote ||
        detailResponse.data ||
        detailResponse;

      const events = extractEvents(eventsResponse);

      setLotDetail(detail);
      setLotEvents(events);

      const latest = sortEvents(events)[0];

      if (latest) {
        const movement = {
          ...latest,
          lote_id: lot.id,
          producto: detail.producto || lot.producto,
          codigo_trazabilidad:
            detail.codigo_trazabilidad || lot.codigo_trazabilidad
        };

        setLastMovementByLot(previous => ({
          ...previous,
          [lot.id]: movement
        }));

        setRecentMovements(previous => {
          const combined = [
            movement,
            ...previous.filter(item => item.lote_id !== lot.id)
          ];

          return combined
            .sort((a, b) =>
              new Date(b.fecha_evento || 0).getTime() -
              new Date(a.fecha_evento || 0).getTime()
            )
            .slice(0, 5);
        });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  // Registrar movimiento y actualizar todas las vistas.
  async function addLotEvent(e) {
    e.preventDefault();

    if (!selectedLot) return;

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const body = {
        tipo_evento: eventForm.tipo_evento,

        ...(eventForm.nota.trim()
          ? { detalle: { nota: eventForm.nota.trim() } }
          : {}),

        ...(eventForm.latitud !== ''
          ? { latitud: Number(eventForm.latitud) }
          : {}),

        ...(eventForm.longitud !== ''
          ? { longitud: Number(eventForm.longitud) }
          : {})
      };

      await request(`/lotes/${selectedLot.id}/eventos`, {
        token,
        method: 'POST',
        body: JSON.stringify(body)
      });

      const [detailResponse, eventsResponse] = await Promise.all([
        request(`/lotes/${selectedLot.id}`, { token }),
        request(`/lotes/${selectedLot.id}/eventos`, { token })
      ]);

      const detail =
        detailResponse.lote ||
        detailResponse.data ||
        detailResponse;

      const events = extractEvents(eventsResponse);
      const sortedEvents = sortEvents(events);

      setLotDetail(detail);
      setLotEvents(events);

      const latest = sortedEvents[0];

      if (latest) {
        const movement = {
          ...latest,
          lote_id: selectedLot.id,
          producto: detail.producto || selectedLot.producto,
          codigo_trazabilidad:
            detail.codigo_trazabilidad ||
            selectedLot.codigo_trazabilidad
        };

        setLastMovementByLot(previous => ({
          ...previous,
          [selectedLot.id]: movement
        }));

        setRecentMovements(previous => {
          const combined = [
            movement,
            ...previous.filter(
              item => item.lote_id !== selectedLot.id
            )
          ];

          return combined
            .sort((a, b) =>
              new Date(b.fecha_evento || 0).getTime() -
              new Date(a.fecha_evento || 0).getTime()
            )
            .slice(0, 5);
        });
      }

      setEventForm(previous => ({
        ...previous,
        nota: '',
        latitud: '',
        longitud: ''
      }));

      const [updatedLots, updatedPredios, updatedProducts] =
        await Promise.all([
          request('/lotes?limit=100&page=1', { token }),
          request('/predios?limit=100&page=1', { token }),
          request('/catalogos/productos')
        ]);

      const newLots = rows(updatedLots);

      setLotes(newLots);
      setPredios(rows(updatedPredios));
      setProductos(rows(updatedProducts));

      const refreshedLot = newLots.find(
        lot => String(lot.id) === String(selectedLot.id)
      );

      if (refreshedLot) {
        setSelectedLot(refreshedLot);
      }

      setNotice(
        `Movimiento ${eventForm.tipo_evento} registrado correctamente. Se actualizaron el panel principal y los lotes.`
      );

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
        body: JSON.stringify(pwdForm)
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

  // Consulta pública del historial de trazabilidad.
  const searchTrace = useCallback(async (e) => {
    e?.preventDefault();

    const code = publicCode.trim();

    if (!code || traceRequestRef.current) return;

    traceRequestRef.current = true;
    setBusy(true);
    setError('');

    try {
      const result = await request(
        `/public/trazabilidad/${encodeURIComponent(code)}`
      );

      setTrace(result);
    } catch (e) {
      fail(e);
    } finally {
      traceRequestRef.current = false;
      setBusy(false);
    }
  }, [publicCode]);

  // Consulta inicial y actualización automática cada 10 segundos.
  useEffect(() => {
    if (page !== 'public' || !publicCode) return;

    searchTrace();

    const interval = setInterval(() => {
      searchTrace();
    }, 10000);

    return () => clearInterval(interval);
  }, [page, publicCode, searchTrace]);

  const filtered = useMemo(
    () =>
      lotes.filter(x =>
        `${x.codigo_trazabilidad || ''} ${x.producto || ''} ${
          x.predio || ''
        } ${x.estado || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [lotes, search]
  );

  // Página pública.
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

  // Login.
  if (!token) {
    return (
      <LoginPage
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        login={login}
        busy={busy}
        error={error}
        onOpenPublic={() => { setError(''); setPage('public'); }}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido principal
      </a>

      <aside
        className={`sidebar ${mobile ? 'open' : ''}`}
        aria-label="Navegación principal"
      >
        <GovBrand light />

        <div className="brand-divider" />

        <div className="product-brand">
          <div className="brand-icon">
            <Sprout />
          </div>
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
            onClick={() => {
              setPage('dashboard');
              setMobile(false);
            }}
          >
            <LayoutDashboard />
            <span>Panel principal</span>
          </button>

          <button
            className={`nav ${page === 'lotes' ? 'active' : ''}`}
            aria-current={page === 'lotes' ? 'page' : undefined}
            onClick={() => {
              setPage('lotes');
              setMobile(false);
            }}
          >
            <Package />
            <span>Lotes y trazabilidad</span>
          </button>

          <button
            className={`nav ${page === 'gestion' ? 'active' : ''}`}
            onClick={() => {
              setPage('gestion');
              setMobile(false);
            }}
          >
            <ClipboardList />
            <span>Gestión integral</span>
          </button>
        </nav>

        <div className="side-bottom">
          <div className="security-note">
            <ShieldCheck />
            <span>
              Acceso institucional
              <br />
              <b>{user?.entidad_sigla ? `Entidad: ${user.entidad_sigla}` : 'Sesión protegida'}</b>
            </span>
          </div>

          <div className="user-chip">
            <div className="avatar">
              {(user?.nombre || user?.email || 'U')
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div>
              <b>{user?.nombre || user?.email || 'Usuario'}</b>
              <small>{user?.rol || 'Usuario'}{user?.entidad_sigla ? ` · ${user.entidad_sigla}` : ''}</small>
            </div>
          </div>

          <button className="nav" onClick={() => setPwdModal(true)}>
            <KeyRound />
            <span>Cambiar contraseña</span>
          </button>
          <button className="nav" onClick={logout}>
            <LogOut />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}

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

          <span className="top-user">
            <i /> {user?.rol}{user?.entidad_sigla ? ` (${user.entidad_sigla})` : ''}
          </span>
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
              <button
                aria-label="Cerrar error"
                onClick={() => setError('')}
              >
                <X />
              </button>
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
                    <input type="password" required value={pwdForm.actual}
                      onChange={e => setPwdForm({ ...pwdForm, actual: e.target.value })} />
                  </label>
                  <label className="module-field">
                    Nueva contraseña (mínimo 8 caracteres)
                    <input type="password" minLength={8} required value={pwdForm.nueva}
                      onChange={e => setPwdForm({ ...pwdForm, nueva: e.target.value })} />
                  </label>
                </div>
                <button className="primary-button" disabled={busy}>Actualizar contraseña</button>
              </form>
            </section>
          )}

          {page === 'gestion' ? (
            <Modules
              api={(path, opts = {}) =>
                request(path, { ...opts, token })
              }
              user={user}
              onError={setError}
              onNotice={setNotice}
            />
          ) : page === 'dashboard' ? (
            <>
              <PageHeading
                title="Panel principal"
                eyebrow="SISTEMA DE INFORMACIÓN Y GESTIÓN AGROPECUARIA"
                description="Consulta el estado de los registros y la información agropecuaria disponible."
                action={() => load()}
                busy={busy}
              />

              {isStaff && resumen ? (
                <>
                  <div className="stats">
                    <Stat icon={<ShieldCheck />} label={`Productores (${resumen.productores?.validados ?? 0} validados)`} value={resumen.productores?.total ?? 0} />
                    <Stat icon={<MapPin />} label={`Predios (${resumen.predios?.verificados ?? 0} verificados)`} value={resumen.predios?.total ?? 0} />
                    <Stat icon={<Package />} label={`Lotes (${resumen.lotes?.bloqueados ?? 0} bloqueados)`} value={resumen.lotes?.total ?? 0} />
                    <Stat icon={<AlertTriangle />} label="Alertas sanitarias abiertas" value={resumen.alertas_sanitarias_abiertas ?? 0} />
                    <Stat icon={<FileText />} label={`Exportaciones (${resumen.exportaciones?.aprobadas ?? 0} aprobadas)`} value={`${resumen.exportaciones?.pendientes ?? 0} pend.`} />
                    <Stat icon={<Clock />} label={`KPI Trazabilidad < 24h (Meta ${resumen.kpis?.meta_pct_actualizados_24h ?? 70}%)`} value={resumen.kpis?.pct_lotes_actualizados_24h != null ? `${resumen.kpis.pct_lotes_actualizados_24h}%` : 'N/A'} />
                  </div>
                  {desactualizados.length > 0 && (
                    <section className="panel">
                      <div className="panel-head"><div>
                        <p className="section-kicker">ALERTA OPERATIVA (REGLA 21/22)</p>
                        <h2>Lotes en curso sin actualización en más de 24 horas</h2>
                        <p className="sub">{desactualizados.length} lotes requieren seguimiento en campo.</p>
                      </div></div>
                      <div className="table-wrap"><table>
                        <thead><tr><th>Código</th><th>Producto</th><th>Predio</th><th>Estado</th><th>Horas sin actualizar</th></tr></thead>
                        <tbody>{desactualizados.slice(0, 5).map((d, idx) => (
                          <tr key={d.lote_id || d.id || idx}>
                            <td className="mono">{d.codigo_trazabilidad}</td><td><b>{d.producto}</b></td>
                            <td>{d.predio}</td><td><span className="status-tag">{d.estado}</span></td>
                            <td><b>{d.horas_sin_actualizar} h</b></td>
                          </tr>
                        ))}</tbody>
                      </table></div>
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
                    <p className="sub">
                      Últimos lotes registrados en el sistema.
                    </p>
                  </div>

                  <button
                    className="text-button"
                    onClick={() => setPage('lotes')}
                  >
                    Consultar todos <ArrowRight />
                  </button>
                </div>

                <LotTable
                  lots={lotes.slice(0, 5)}
                  lastMovementByLot={lastMovementByLot}
                  onInspect={lot => {
                    setPage('lotes');
                    openLotTrace(lot);
                  }}
                />
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <p className="section-kicker">TRAZABILIDAD</p>
                    <h2>Últimos movimientos registrados</h2>
                    <p className="sub">
                      Seguimiento de los movimientos de los lotes.
                    </p>
                  </div>
                </div>

                {recentMovements.length > 0 ? (
                  <ol className="timeline">
                    {recentMovements.map((movement, index) => (
                      <li
                        className="event"
                        key={`${movement.lote_id}-${movement.tipo_evento}-${index}`}
                      >
                        <span className="event-dot" />
                        <div>
                          <b>{movement.tipo_evento}</b>
                          <small>
                            {movement.producto || 'Producto'} · Lote #{movement.lote_id}
                          </small>
                          <small>{fmt(movement.fecha_evento)}</small>
                          {movement.detalle?.nota && (
                            <small>{movement.detalle.nota}</small>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="sub">
                    No hay movimientos registrados para mostrar.
                  </p>
                )}
              </section>
            </>
          ) : (
            <>
              <PageHeading
                title="Lotes y trazabilidad"
                eyebrow="GESTIÓN Y CONTROL"
                description="Registra lotes de producción y consulta su código de trazabilidad."
                action={() => load()}
                busy={busy}
              />

              {canCreateLot && <div className="two-col">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="section-kicker">NUEVO REGISTRO</p>
                      <h2>Registrar un lote</h2>
                      <p className="sub">
                        Los campos marcados con * son obligatorios.
                      </p>
                    </div>
                    <span className="tag">Formulario</span>
                  </div>

                  <form className="lot-form" onSubmit={createLot}>
                    <label htmlFor="farm">
                      Predio <span className="required">*</span>
                    </label>

                    <select
                      id="farm"
                      value={form.predio_id}
                      onChange={e =>
                        setForm({
                          ...form,
                          predio_id: e.target.value
                        })
                      }
                      required
                    >
                      <option value="">Selecciona un predio</option>
                      {predios.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                          {p.municipio ? ` · ${p.municipio}` : ''}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="product">
                      Producto <span className="required">*</span>
                    </label>

                    <select
                      id="product"
                      value={form.producto_id}
                      onChange={e => {
                        const p = productos.find(
                          x => String(x.id) === e.target.value
                        );

                        setForm({
                          ...form,
                          producto_id: e.target.value,
                          unidad:
                            p?.unidad_medida ||
                            (p?.categoria === 'PECUARIO'
                              ? 'CABEZAS'
                              : 'KG')
                        });
                      }}
                      required
                    >
                      <option value="">Selecciona un producto</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} ({p.categoria})
                        </option>
                      ))}
                    </select>

                    <div className="form-row">
                      <div>
                        <label htmlFor="quantity">
                          Cantidad <span className="required">*</span>
                        </label>
                        <input
                          id="quantity"
                          type="number"
                          min="0.01"
                          step="any"
                          value={form.cantidad}
                          onChange={e =>
                            setForm({
                              ...form,
                              cantidad: e.target.value
                            })
                          }
                          required
                          placeholder="Ej. 250"
                        />
                      </div>

                      <div>
                        <label htmlFor="unit">Unidad</label>
                        <select
                          id="unit"
                          value={form.unidad}
                          onChange={e =>
                            setForm({
                              ...form,
                              unidad: e.target.value
                            })
                          }
                        >
                          <option>KG</option>
                          <option>TON</option>
                          <option>CABEZAS</option>
                        </select>
                      </div>
                    </div>

                    {productos.find(
                      p => String(p.id) === form.producto_id
                    )?.categoria === 'PECUARIO' && (
                      <>
                        <label htmlFor="external-id">
                          Identificador externo (arete / ID ICA)
                          <span className="required">*</span>
                        </label>
                        <input
                          id="external-id"
                          value={form.identificador_externo}
                          onChange={e =>
                            setForm({
                              ...form,
                              identificador_externo: e.target.value
                            })
                          }
                          required
                        />
                      </>
                    )}

                    <div className="form-row">
                      <div>
                        <label htmlFor="planting-date">
                          Fecha de siembra
                        </label>
                        <input
                          id="planting-date"
                          type="date"
                          value={form.fecha_siembra}
                          onChange={e =>
                            setForm({
                              ...form,
                              fecha_siembra: e.target.value
                            })
                          }
                        />
                      </div>

                      <div>
                        <label htmlFor="harvest-date">
                          Fecha de cosecha
                        </label>
                        <input
                          id="harvest-date"
                          type="date"
                          value={form.fecha_cosecha}
                          onChange={e =>
                            setForm({
                              ...form,
                              fecha_cosecha: e.target.value
                            })
                          }
                        />
                      </div>
                    </div>

                    <button
                      className="primary-button full"
                      disabled={
                        busy ||
                        !predios.length ||
                        !productos.length
                      }
                    >
                      <QrCode />
                      {busy
                        ? 'Procesando registro…'
                        : 'Crear lote y generar código QR'}
                    </button>

                    {!predios.length && (
                      <p className="hint" role="status">
                        No hay predios disponibles para esta cuenta.
                        Verifica los permisos o registra un predio primero.
                      </p>
                    )}
                  </form>
                </section>

                <section className="panel qr-panel">
                  <div className="panel-head">
                    <div>
                      <p className="section-kicker">
                        IDENTIFICACIÓN DIGITAL
                      </p>
                      <h2>Código QR del lote</h2>
                      <p className="sub">
                        Se genera automáticamente al guardar el registro.
                      </p>
                    </div>
                    <QrCode />
                  </div>

                  {qr ? (
                    <div className="qr-result">
                      <img
                        src={qr.qr}
                        alt={`Código QR para consultar lote ${
                          qr.codigo_trazabilidad || qr.id
                        }`}
                      />

                      <h3>Lote #{qr.id}</h3>
                      <p className="mono">{qr.codigo_trazabilidad}</p>

                      <a
                        href={qr.url_trazabilidad}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir consulta pública <ExternalLink />
                      </a>

                      <a
                        className="primary-button download"
                        href={qr.qr}
                        download={`SIGA-QR-${qr.id}.png`}
                      >
                        Descargar código QR (PNG)
                      </a>
                    </div>
                  ) : (
                    <div className="empty-qr">
                      <div><QrCode /></div>
                      <h3>El código QR aparecerá aquí</h3>
                      <p>
                        Completa el formulario y guarda el lote para
                        generar su identificador de trazabilidad.
                      </p>
                    </div>
                  )}
                </section>
              </div>}

              <section className="panel">
                <div className="panel-head responsive-head">
                  <div>
                    <p className="section-kicker">REGISTROS DEL SISTEMA</p>
                    <h2>Lotes registrados</h2>
                    <p className="sub">
                      {lotes.length} registros disponibles para esta cuenta.
                    </p>
                  </div>

                  <div className="search-box">
                    <label className="sr-only" htmlFor="lot-search">
                      Buscar por código, producto, predio o estado
                    </label>
                    <Search />
                    <input
                      id="lot-search"
                      type="search"
                      placeholder="Buscar registros…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <LotTable
                  lots={filtered}
                  lastMovementByLot={lastMovementByLot}
                  onInspect={openLotTrace}
                />
              </section>
            </>
          )}

          {selectedLot && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">DETALLE DEL REGISTRO</p>
                  <h2>
                    Lote #{selectedLot.id} ·{' '}
                    {lotDetail?.producto || selectedLot.producto}
                  </h2>
                  <p className="sub mono">
                    {lotDetail?.codigo_trazabilidad ||
                      selectedLot.codigo_trazabilidad}
                  </p>
                </div>

                <button
                  className="text-button"
                  onClick={() => {
                    setSelectedLot(null);
                    setLotDetail(null);
                    setLotEvents([]);
                  }}
                >
                  Cerrar detalle
                </button>
              </div>

              {busy && !lotDetail ? (
                <p className="sub">
                  Consultando información del lote...
                </p>
              ) : (
                <>
                  <div className="trace-grid">
                    <InfoItem
                      label="Producto"
                      value={lotDetail?.producto || selectedLot.producto}
                    />
                    <InfoItem
                      label="Categoría"
                      value={lotDetail?.categoria || selectedLot.categoria}
                    />
                    <InfoItem
                      label="Predio"
                      value={lotDetail?.predio || selectedLot.predio}
                    />
                    <InfoItem
                      label="Municipio"
                      value={lotDetail?.municipio || selectedLot.municipio}
                    />
                    <InfoItem
                      label="Cantidad"
                      value={`${lotDetail?.cantidad ?? selectedLot.cantidad ?? '—'} ${
                        lotDetail?.unidad || selectedLot.unidad || ''
                      }`}
                    />
                    <InfoItem
                      label="Estado"
                      value={
                        lotDetail?.bloqueado
                          ? 'Bloqueado (ICA)'
                          : lotDetail?.estado || selectedLot.estado
                      }
                    />
                    <InfoItem
                      label="Fecha de siembra"
                      value={lotDetail?.fecha_siembra || 'No registrada'}
                    />
                    <InfoItem
                      label="Fecha de cosecha"
                      value={lotDetail?.fecha_cosecha || 'No registrada'}
                    />
                    <InfoItem
                      label="Identificador externo"
                      value={
                        lotDetail?.identificador_externo || 'No registrado'
                      }
                    />
                  </div>

                  {/* QR DE TRAZABILIDAD */}
                  <section className="chain">
                    <div className="panel-head">
                      <div>
                        <h2>Código QR de trazabilidad</h2>
                        <p className="sub">
                          Escanea este código para consultar públicamente
                          la información y los movimientos del lote.
                        </p>
                      </div>
                    </div>

                    {(
                      lotDetail?.codigo_trazabilidad ||
                      selectedLot.codigo_trazabilidad
                    ) ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '24px',
                          flexWrap: 'wrap',
                          padding: '16px 0'
                        }}
                      >
                        <div
                          style={{
                            background: '#fff',
                            padding: '12px',
                            borderRadius: '12px',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                              `${window.location.origin}/consulta/${
                                lotDetail?.codigo_trazabilidad ||
                                selectedLot.codigo_trazabilidad
                              }`
                            )}`}
                            alt="QR de trazabilidad del lote"
                            width="220"
                            height="220"
                            style={{
                              display: 'block',
                              maxWidth: '100%',
                              height: 'auto'
                            }}
                          />
                        </div>

                        <div>
                          <p>
                            <strong>Código de trazabilidad</strong>
                          </p>

                          <p className="sub mono">
                            {lotDetail?.codigo_trazabilidad ||
                              selectedLot.codigo_trazabilidad}
                          </p>

                          <a
                            className="primary-button"
                            style={{
                              display: 'inline-block',
                              textDecoration: 'none',
                              marginTop: '12px'
                            }}
                            href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(
                              `${window.location.origin}/consulta/${
                                lotDetail?.codigo_trazabilidad ||
                                selectedLot.codigo_trazabilidad
                              }`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Descargar QR
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="sub">
                        Este lote todavía no tiene código de trazabilidad.
                      </p>
                    )}
                  </section>

                  {/* HISTORIAL DE MOVIMIENTOS */}
                  <section className="chain">
                    <div className="panel-head">
                      <div>
                        <h2>Historial de movimientos</h2>
                        <p className="sub">
                          Eventos registrados en la cadena de trazabilidad.
                        </p>
                      </div>
                    </div>

                    {lotEvents.length > 0 ? (
                      <ol className="timeline">
                        {lotEvents.map((ev, i) => (
                          <li className="event" key={ev.id || i}>
                            <span className="event-dot" />
                            <div>
                              <b>{ev.tipo_evento}</b>
                              <small>
                                {fmt(ev.fecha_evento)} ·{' '}
                                {ev.origen || 'Origen no indicado'}
                                {(ev.detalle?.nota || ev.nota)
                                  ? ` · ${ev.detalle?.nota || ev.nota}`
                                  : ''}
                              </small>
                              {ev.hash_evento && (
                                <code>Hash: {ev.hash_evento}</code>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="sub">
                        Todavía no hay movimientos registrados para este lote.
                      </p>
                    )}
                  </section>

                  {/* REGISTRAR MOVIMIENTO */}
                  <form className="module-form" onSubmit={addLotEvent}>
                    <h3>Registrar nuevo movimiento</h3>

                    <div className="module-fields">
                      <label className="module-field">
                        Tipo de movimiento
                        <select
                          value={eventForm.tipo_evento}
                          onChange={e =>
                            setEventForm({
                              ...eventForm,
                              tipo_evento: e.target.value
                            })
                          }
                        >
                          {[
                            'SIEMBRA',
                            'COSECHA',
                            'ACOPIO',
                            'TRANSPORTE',
                            'VENTA',
                            'INSPECCION_SANITARIA'
                          ].map(tipo => (
                            <option key={tipo} value={tipo}>
                              {tipo.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="module-field">
                        Observación
                        <input
                          value={eventForm.nota}
                          onChange={e =>
                            setEventForm({
                              ...eventForm,
                              nota: e.target.value
                            })
                          }
                          placeholder="Describe el movimiento"
                        />
                      </label>

                      <label className="module-field">
                        Latitud (opcional)
                        <input
                          type="number"
                          step="any"
                          value={eventForm.latitud}
                          onChange={e =>
                            setEventForm({
                              ...eventForm,
                              latitud: e.target.value
                            })
                          }
                          placeholder="Ej. 4.6097"
                        />
                      </label>

                      <label className="module-field">
                        Longitud (opcional)
                        <input
                          type="number"
                          step="any"
                          value={eventForm.longitud}
                          onChange={e =>
                            setEventForm({
                              ...eventForm,
                              longitud: e.target.value
                            })
                          }
                          placeholder="Ej. -74.0817"
                        />
                      </label>
                    </div>

                    <button className="primary-button" disabled={busy}>
                      <PlusCircle />
                      {busy ? 'Registrando...' : 'Registrar movimiento'}
                    </button>
                  </form>
                </>
              )}
            </section>
          )}

          <footer className="app-footer">
            <span>Ministerio de Agricultura y Desarrollo Rural</span>
            <span>
              SIGA · Sistema de Información y Gestión Agropecuaria
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}


// Identidad institucional.
function GovBrand({ light = false }) {
  return (
    <div className={`gov-brand ${light ? 'light' : ''}`}>
      <div className="gov-symbol">
        <Landmark />
      </div>
      <div>
        <strong>Ministerio de Agricultura</strong>
        <span>y Desarrollo Rural · Colombia</span>
      </div>
    </div>
  );
}

// Encabezado de página.
function PageHeading({
  title,
  eyebrow,
  description,
  action,
  busy
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="sub">{description}</p>
      </div>

      <button
        className="secondary-button"
        onClick={action}
        disabled={busy}
      >
        <RefreshCw className={busy ? 'spin' : ''} />
        Actualizar datos
      </button>
    </div>
  );
}

// Página de inicio de sesión.
function LoginPage({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  login,
  busy,
  error,
  onOpenPublic
}) {
  return (
    <div className="login-page">
      <a className="skip-link" href="#login-form">
        Saltar al formulario de acceso
      </a>

      <div className="gov-topline">
        <i /><i /><i />
      </div>

      <header className="login-header">
        <GovBrand />
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <button type="button" className="secondary-button" onClick={onOpenPublic}>
            <QrCode /> Consulta ciudadana QR
          </button>
          <span className="header-classification">
          PORTAL INSTITUCIONAL
          </span>
        </div>
      </header>

      <main className="login-layout">
        <section className="login-intro">
          <p className="eyebrow">
            SISTEMA DE INFORMACIÓN Y GESTIÓN AGROPECUARIA
          </p>

          <h1>
            Información del campo para una gestión{' '}
            <em>transparente y trazable.</em>
          </h1>

          <p className="intro-copy">
            SIGA integra información de productores, predios y lotes
            para apoyar el seguimiento de la actividad agropecuaria.
          </p>

          <div className="intro-points">
            <div>
              <ShieldCheck />
              <span>
                <b>Acceso seguro</b>
                <small>Ingreso mediante credenciales registradas.</small>
              </span>
            </div>
            <div>
              <QrCode />
              <span>
                <b>Trazabilidad</b>
                <small>Consulta de lotes mediante código QR.</small>
              </span>
            </div>
            <div>
              <FileText />
              <span>
                <b>Información organizada</b>
                <small>Registros centralizados para su gestión.</small>
              </span>
            </div>
          </div>
        </section>

        <section className="login-card-wrap">
          <form
            id="login-form"
            className="login-card"
            onSubmit={login}
            aria-labelledby="login-title"
          >
            <div className="login-lock"><LockKeyhole /></div>
            <p className="section-kicker">ÁREA DE USUARIOS</p>
            <h2 id="login-title">Iniciar sesión</h2>
            <p className="sub">
              Ingresa con el correo y la contraseña asociados a tu cuenta SIGA.
            </p>

            {error && (
              <div className="alert error" role="alert">
                <AlertCircle />
                <span>{error}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
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
                  onChange={e => setPassword(e.target.value)}
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

            <button
              className="primary-button full login-submit"
              disabled={busy}
            >
              {busy ? 'Validando acceso…' : 'Ingresar al sistema'}
              <ArrowRight />
            </button>

            <div className="login-security">
              <ShieldCheck />
              <span>Autenticación gestionada por el servicio SIGA.</span>
            </div>
          </form>

          <p className="help-note">
            <Info />
            Si no tienes una cuenta o no puedes ingresar,
            comunícate con el administrador autorizado de SIGA.
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

// Tarjetas de estadísticas.
function Stat({ icon, label, value }) {
  return (
    <article className="stat">
      <div className="stat-icon" aria-hidden="true">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

// Tabla de lotes.
function LotTable({
  lots,
  onInspect,
  lastMovementByLot = {}
}) {
  if (!lots.length) {
    return (
      <div className="empty">
        <Package />
        <p>No hay lotes para mostrar.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">
          Listado de lotes registrados en SIGA
        </caption>

        <thead>
          <tr>
            <th scope="col">Producto y código</th>
            <th scope="col">Predio</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Estado</th>
            <th scope="col">Último movimiento</th>
            <th scope="col">Fecha de registro</th>
            {onInspect && <th scope="col">Acciones</th>}
          </tr>
        </thead>

        <tbody>
          {lots.map(l => {
            const movement = lastMovementByLot[l.id];

            return (
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
                    {l.estado || 'Sin estado'}
                  </span>
                </td>

                <td>
                  {movement ? (
                    <>
                      <b>{movement.tipo_evento}</b>
                      <small>{fmt(movement.fecha_evento)}</small>
                    </>
                  ) : (
                    <span>Sin información reciente</span>
                  )}
                </td>

                <td>{fmt(l.creado_en || l.fecha_creacion)}</td>

                {onInspect && (
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => onInspect(l)}
                      >
                        Ver detalle
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Consulta pública de trazabilidad.
function PublicPage({
  code,
  setCode,
  trace,
  error,
  busy,
  onSearch,
  onBackToLogin
}) {
  const events = Array.isArray(trace?.linea_tiempo)
    ? trace.linea_tiempo
    : [];

  const totalEvents =
    trace?.verificacion?.total_eventos ?? events.length;

  return (
    <div className="public-page">
      <a className="skip-link" href="#public-content">
        Saltar al contenido principal
      </a>

      <div className="gov-topline">
        <i /><i /><i />
      </div>

      <header className="public-header">
        <GovBrand />
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {onBackToLogin && <button type="button" className="secondary-button" onClick={onBackToLogin}>Volver al inicio de sesión</button>}
          <div className="public-siga">
          <Sprout /> SIGA
          </div>
        </div>
      </header>

      <main id="public-content" className="public-content">
        <div className="public-heading">
          <p className="eyebrow">SERVICIO DE CONSULTA CIUDADANA</p>
          <h1>Consulta pública de trazabilidad</h1>
          <p>
            Verifica la información de origen y el recorrido registrado
            de un producto agropecuario.
          </p>
        </div>

        <section className="public-card">
          <div className="public-card-title">
            <div className="public-icon"><QrCode /></div>
            <div>
              <h2>Consultar un lote</h2>
              <p>
                Ingresa el código de trazabilidad que aparece en la
                etiqueta o escanea el código QR.
              </p>
            </div>
          </div>

          <form className="public-search" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="trace-code">
              Código de trazabilidad
            </label>
            <input
              id="trace-code"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Código de trazabilidad"
              required
            />
            <button className="primary-button" disabled={busy}>
              {busy ? 'Consultando…' : 'Consultar trazabilidad'}
            </button>
          </form>

          {error && (
            <div className="alert error" role="alert">
              <AlertCircle />
              {error}
            </div>
          )}

          {trace && trace.lote && (
            <>
              <div className="verified">
                <ShieldCheck />
                INFORMACIÓN DEL LOTE CONSULTADO
              </div>

              <div className="trace-title">
                <div>
                  <p className="section-kicker">PRODUCTO</p>
                  <h2>{trace.lote.producto}</h2>
                </div>
                <span className="status-tag">{trace.lote.estado}</span>
              </div>

              <div className="trace-grid">
                <InfoItem label="Categoría" value={trace.lote.categoria} />
                <InfoItem
                  label="Cantidad"
                  value={`${trace.lote.cantidad} ${trace.lote.unidad}`}
                />
                <InfoItem label="Municipio" value={trace.lote.municipio} />
                <InfoItem label="Departamento" value={trace.lote.departamento} />
                <InfoItem
                  label="Fecha de cosecha"
                  value={trace.lote.fecha_cosecha || 'No registrada'}
                />
                <InfoItem
                  label="Estado de bloqueo"
                  value={
                    trace.lote.bloqueado ? 'Bloqueado' : 'Sin bloqueo'
                  }
                />
              </div>

              <section className="chain">
                <div className="panel-head">
                  <div>
                    <h2>Historial de trazabilidad</h2>
                    <p className="sub">
                      {totalEvents} evento(s) registrado(s) en la cadena.
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span
                      className={`verification-tag ${
                        trace.verificacion?.integra ? 'valid' : ''
                      }`}
                    >
                      {trace.verificacion?.integra
                        ? 'Cadena íntegra y verificada'
                        : 'Cadena con inconsistencias'}
                    </span>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onSearch()}
                      disabled={busy}
                    >
                      <RefreshCw className={busy ? 'spin' : ''} />
                      Actualizar historial
                    </button>
                  </div>
                </div>

                {events.length > 0 ? (
                  <ol className="timeline">
                    {events.map((event, i) => (
                      <li
                        className="event"
                        key={event.id || `${event.tipo_evento}-${i}`}
                      >
                        <span className="event-dot" />
                        <div>
                          <b>{event.tipo_evento}</b>
                          <small>
                            {fmt(event.fecha_evento)} ·{' '}
                            {event.origen || 'Origen no indicado'}
                          </small>
                          {event.detalle?.nota && (
                            <small>{event.detalle.nota}</small>
                          )}
                          {event.hash_evento && (
                            <code>{event.hash_evento}</code>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty">
                    <Info />
                    <p>
                      Aún no hay eventos registrados para este lote.
                    </p>
                    <small>
                      La información general del lote está disponible,
                      pero todavía no se han registrado movimientos
                      en su historial de trazabilidad.
                    </small>
                  </div>
                )}

                <p className="sub" style={{ marginTop: '16px' }}>
                  La consulta se actualiza automáticamente cada 10 segundos.
                </p>
              </section>
            </>
          )}
        </section>

        <p className="public-disclaimer">
          La información mostrada corresponde a los datos públicos
          disponibles en SIGA. No se exponen datos personales del productor.
        </p>
      </main>

      <footer className="public-footer">
        Ministerio de Agricultura y Desarrollo Rural · República de Colombia
      </footer>
    </div>
  );
}

// Elemento de información.
function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <b>{value || '—'}</b>
    </div>
  );
}

// Iniciar aplicación.
createRoot(document.getElementById('root')).render(<App />); 