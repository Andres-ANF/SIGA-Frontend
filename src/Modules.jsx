import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Search, Download, Database, ClipboardList, CloudUpload, Edit3, CheckCircle
} from 'lucide-react';

const TABS = [
  ['productores', 'Productores'],
  ['predios', 'Predios'],
  ['alertas', 'Alertas sanitarias'],
  ['exportaciones', 'Exportaciones'],
  ['catalogos', 'Catálogos'],
  ['sync', 'Sincronización'],
  ['usuarios', 'Usuarios'],
  ['auditoria', 'Auditoría'],
];

const unwrap = (x) => (Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : []);
const date = (x) => (x ? new Date(x).toLocaleString('es-CO') : '—');

export default function Modules({ api, user, onError, onNotice }) {
  const [tab, setTab] = useState('productores');
  const [data, setData] = useState([]);
  const [catalogs, setCatalogs] = useState({
    municipios: [],
    lotes: [],
    productores: [],
    entidades: [],
    productos: [],
  });
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [detail, setDetail] = useState(null);

  // Estados declarados correctamente para Sincronización Offline
  const [offline, setOffline] = useState({
    lote_codigo: '',
    tipo_evento: 'COSECHA',
    detalle: '',
  });
  const [queue, setQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('siga_offline_events') || '[]');
    } catch {
      return [];
    }
  });

  const admin = user?.rol === 'ADMIN';
  const isICA = admin || (user?.rol === 'ENTIDAD' && user?.entidad_sigla === 'ICA');
  const isDIAN = admin || (user?.rol === 'ENTIDAD' && user?.entidad_sigla === 'DIAN');
  const isDIANorMADR = admin || (user?.rol === 'ENTIDAD' && ['DIAN', 'MADR'].includes(user?.entidad_sigla));
  const isANT = admin || (user?.rol === 'ENTIDAD' && user?.entidad_sigla === 'ANT');

  async function load() {
    setBusy(true);
    onError('');
    try {
      if (tab === 'sync') {
        const d = await api('/sync/bootstrap');
        setData(d);
        return;
      }

      if (tab === 'catalogos') {
        const [ent, mun, prod] = await Promise.all([
          api('/catalogos/entidades'),
          api('/catalogos/municipios'),
          api('/catalogos/productos'),
        ]);
        const cObj = {
          entidades: unwrap(ent),
          municipios: unwrap(mun),
          productos: unwrap(prod),
        };
        setCatalogs((prev) => ({ ...prev, ...cObj }));
        setData(cObj);
        return;
      }

      if ((tab === 'usuarios' || tab === 'auditoria') && !admin) {
        setData([]);
        return;
      }

      const path = {
        productores: '/productores?limit=100&page=1',
        predios: '/predios?limit=100&page=1',
        alertas: '/alertas?limit=100&page=1',
        exportaciones: '/exportaciones?limit=100&page=1',
        usuarios: '/usuarios',
        auditoria: '/auditoria?limit=100&page=1',
      }[tab];

      const d = await api(path);
      setData(unwrap(d));

      if (['productores', 'predios', 'exportaciones', 'alertas', 'usuarios'].includes(tab)) {
        const [m, l, p, e] = await Promise.all([
          api('/catalogos/municipios'),
          api('/lotes?limit=100&page=1'),
          api('/productores?limit=100&page=1'),
          api('/catalogos/entidades'),
        ]);
        setCatalogs((prev) => ({
          ...prev,
          municipios: unwrap(m),
          lotes: unwrap(l),
          productores: unwrap(p),
          entidades: unwrap(e),
        }));
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function act(path, method = 'PATCH', body) {
    setBusy(true);
    onError('');
    try {
      await api(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      onNotice('Operación realizada correctamente.');
      setDetail(null);
      setEditItem(null);
      await load();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const b = { ...form };
    try {
      if (tab === 'exportaciones') b.lote_id = Number(b.lote_id);
      if (tab === 'alertas') b.lote_id = Number(b.lote_id);
      if (tab === 'predios') {
        if (b.productor_id) b.productor_id = Number(b.productor_id);
        b.area_m2 = Number(b.area_m2);
        b.latitud = Number(b.latitud);
        b.longitud = Number(b.longitud);
      }
      if (tab === 'productores') {
        b.pertenece_comunidad_etnica = b.pertenece_comunidad_etnica === 'true';
        b.consentimiento_datos = b.consentimiento_datos === 'true';
        if (!b.telefono) delete b.telefono;
        if (!b.email) delete b.email;
      }
      if (tab === 'usuarios') {
        b.entidad_id = b.entidad_id ? Number(b.entidad_id) : undefined;
      }
      await act('/' + tab, 'POST', b);
      setForm({});
    } catch (e) {
      onError(e.message);
    }
  }

  function startEdit(row) {
    setEditItem(row);
    if (tab === 'productores') {
      setEditForm({
        nombre_razon_social: row.nombre_razon_social || '',
        telefono: row.telefono || '',
        email: row.email || '',
        municipio_codigo: row.municipio_codigo || '',
      });
    } else if (tab === 'predios') {
      setEditForm({
        nombre: row.nombre || '',
        codigo_catastral: row.codigo_catastral || '',
        matricula_inmobiliaria: row.matricula_inmobiliaria || '',
        area_m2: row.area_m2 ?? '',
        latitud: row.latitud ?? '',
        longitud: row.longitud ?? '',
        municipio_codigo: row.municipio_codigo || '',
      });
    } else if (tab === 'usuarios') {
      setEditForm({
        rol: row.rol || 'PRODUCTOR',
        entidad_id: row.entidad_id || '',
        activo: Boolean(row.activo),
      });
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editItem) return;
    if (tab === 'productores') {
      const payload = {
        nombre_razon_social: editForm.nombre_razon_social,
        telefono: editForm.telefono || null,
        email: editForm.email || null,
        municipio_codigo: editForm.municipio_codigo,
      };
      await act(`/productores/${editItem.id}`, 'PATCH', payload);
    } else if (tab === 'predios') {
      const payload = {
        nombre: editForm.nombre,
        ...(editForm.codigo_catastral ? { codigo_catastral: editForm.codigo_catastral } : {}),
        ...(editForm.matricula_inmobiliaria ? { matricula_inmobiliaria: editForm.matricula_inmobiliaria } : {}),
        area_m2: Number(editForm.area_m2),
        latitud: Number(editForm.latitud),
        longitud: Number(editForm.longitud),
        municipio_codigo: editForm.municipio_codigo,
      };
      await act(`/predios/${editItem.id}`, 'PATCH', payload);
    } else if (tab === 'usuarios') {
      const payload = {
        rol: editForm.rol,
        entidad_id: editForm.entidad_id ? Number(editForm.entidad_id) : null,
        activo: Boolean(editForm.activo),
      };
      await act(`/usuarios/${editItem.id}`, 'PATCH', payload);
    }
  }

  function addOffline(e) {
    e.preventDefault();
    if (!offline.lote_codigo || !offline.tipo_evento) return;
    const ev = {
      uuid_cliente: crypto.randomUUID(),
      lote_codigo: offline.lote_codigo,
      tipo_evento: offline.tipo_evento,
      fecha_evento: new Date().toISOString(),
      detalle: offline.detalle ? { nota: offline.detalle } : {},
    };
    const next = [...queue, ev];
    setQueue(next);
    localStorage.setItem('siga_offline_events', JSON.stringify(next));
    setOffline({ lote_codigo: '', tipo_evento: 'COSECHA', detalle: '' });
    onNotice('Evento guardado localmente. Puedes sincronizarlo cuando tengas conexión.');
  }

  async function sendOffline() {
    if (!queue.length) return;
    setBusy(true);
    onError('');
    try {
      const result = await api('/sync/eventos', {
        method: 'POST',
        body: JSON.stringify({ eventos: queue }),
      });
      const failed = (result.resultados || [])
        .filter((x) => x.estado === 'ERROR')
        .map((x) => x.uuid_cliente);
      const rest = queue.filter((x) => failed.includes(x.uuid_cliente));
      setQueue(rest);
      localStorage.setItem('siga_offline_events', JSON.stringify(rest));
      onNotice(
        `Sincronización terminada: ${result.creados || 0} creados, ${result.duplicados || 0} duplicados, ${result.errores || 0} errores.`
      );
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = Array.isArray(data)
    ? data.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
    : [];

  const cols = {
    productores: ['id', 'nombre_razon_social', 'numero_documento', 'tipo_productor', 'municipio', 'estado', 'validado'],
    predios: ['id', 'nombre', 'propietario', 'municipio', 'area_m2', 'ubicacion_verificada', 'referencia_fondo_tierras'],
    alertas: ['id', 'codigo_trazabilidad', 'producto', 'entidad', 'tipo', 'severidad', 'estado', 'descripcion'],
    exportaciones: ['exportacion_id', 'codigo_trazabilidad', 'pais_destino', 'estado', 'pct_completo'],
    usuarios: ['id', 'nombre', 'email', 'rol', 'entidad', 'activo'],
    auditoria: ['id', 'usuario_id', 'accion', 'tabla_afectada', 'registro_id', 'creado_en'],
  };

  const titles = {
    productores: 'Gestión de productores',
    predios: 'Gestión de predios',
    alertas: 'Alertas sanitarias (ICA)',
    exportaciones: 'Trámites de exportación por lote',
    catalogos: 'Catálogos oficiales del sistema',
    usuarios: 'Administración de usuarios y roles',
    auditoria: 'Bitácora de auditoría',
    sync: 'Trabajo sin conexión (Offline)',
  };

  const createForm = () => {
    if (tab === 'productores' && ['EXTENSIONISTA', 'ADMIN'].includes(user?.rol)) {
      return (
        <>
          <Field label="Tipo documento" name="tipo_documento" value={form} set={setForm} options={['CC', 'CE', 'NIT']} />
          <Field label="Número documento" name="numero_documento" value={form} set={setForm} />
          <Field label="Nombre / razón social" name="nombre_razon_social" value={form} set={setForm} />
          <Field label="Tipo productor" name="tipo_productor" value={form} set={setForm} options={['CAMPESINO', 'ETNICO', 'EMPRESARIAL']} />
          <Field label="Teléfono" name="telefono" value={form} set={setForm} />
          <Field label="Correo" name="email" type="email" value={form} set={setForm} />
          <Field
            label="Municipio"
            name="municipio_codigo"
            value={form}
            set={setForm}
            options={catalogs.municipios.map((x) => ({ value: x.codigo_dane, label: `${x.nombre} - ${x.departamento}` }))}
          />
          <Field label="Pertenece a comunidad étnica" name="pertenece_comunidad_etnica" value={form} set={setForm} options={['false', 'true']} />
          <Field label="Consentimiento de datos (Ley 1581)" name="consentimiento_datos" value={form} set={setForm} options={['false', 'true']} />
          {(form.tipo_productor === 'ETNICO' || form.pertenece_comunidad_etnica === 'true') && (
            <>
              <Field label="Acta de autorización (Consulta previa)" name="consentimiento_acta" value={form} set={setForm} />
              <Field label="Fecha de autorización" type="date" name="consentimiento_fecha" value={form} set={setForm} />
            </>
          )}
        </>
      );
    }

    if (tab === 'predios' && ['PRODUCTOR', 'EXTENSIONISTA', 'ADMIN'].includes(user?.rol)) {
      return (
        <>
          {user?.rol !== 'PRODUCTOR' && (
            <Field
              label="Productor propietario"
              name="productor_id"
              value={form}
              set={setForm}
              options={catalogs.productores.map((x) => ({ value: x.id, label: `${x.nombre_razon_social} (${x.numero_documento})` }))}
            />
          )}
          <Field label="Nombre del predio" name="nombre" value={form} set={setForm} />
          <Field label="Código catastral" name="codigo_catastral" value={form} set={setForm} />
          <Field label="Matrícula inmobiliaria" name="matricula_inmobiliaria" value={form} set={setForm} />
          <Field label="Área (m²)" name="area_m2" type="number" step="any" value={form} set={setForm} />
          <Field label="Latitud (-5 a 14)" name="latitud" type="number" step="any" value={form} set={setForm} />
          <Field label="Longitud (-82 a -66)" name="longitud" type="number" step="any" value={form} set={setForm} />
          <Field
            label="Municipio"
            name="municipio_codigo"
            value={form}
            set={setForm}
            options={catalogs.municipios.map((x) => ({ value: x.codigo_dane, label: `${x.nombre} - ${x.departamento}` }))}
          />
        </>
      );
    }

    if (tab === 'exportaciones' && ['PRODUCTOR', 'EXTENSIONISTA', 'ADMIN'].includes(user?.rol)) {
      return (
        <>
          <Field
            label="Lote a exportar"
            name="lote_id"
            value={form}
            set={setForm}
            options={catalogs.lotes.map((x) => ({ value: x.id, label: `#${x.id} · ${x.producto} (${x.codigo_trazabilidad || ''})` }))}
          />
          <Field label="País destino" name="pais_destino" value={form} set={setForm} />
        </>
      );
    }

    if (tab === 'alertas' && isICA) {
      return (
        <>
          <Field
            label="Lote afectado"
            name="lote_id"
            value={form}
            set={setForm}
            options={catalogs.lotes.map((x) => ({ value: x.id, label: `#${x.id} · ${x.producto} (${x.codigo_trazabilidad || ''})` }))}
          />
          <Field label="Tipo de alerta" name="tipo" value={form} set={setForm} options={['PLAGA', 'ENFERMEDAD', 'CONTAMINACION', 'OTRO']} />
          <Field label="Severidad" name="severidad" value={form} set={setForm} options={['BAJA', 'MEDIA', 'ALTA']} />
          <Field label="Descripción sanitaria (mín. 5 caracteres)" name="descripcion" value={form} set={setForm} />
        </>
      );
    }

    if (tab === 'usuarios' && admin) {
      return (
        <>
          <Field label="Nombre completo" name="nombre" value={form} set={setForm} />
          <Field label="Correo institucional" name="email" type="email" value={form} set={setForm} />
          <Field label="Contraseña temporal (mín. 8 caracteres)" name="password" type="password" value={form} set={setForm} />
          <Field label="Rol" name="rol" value={form} set={setForm} options={['PRODUCTOR', 'EXTENSIONISTA', 'ENTIDAD', 'ADMIN']} />
          <Field
            label="Entidad (obligatoria si el rol es ENTIDAD)"
            name="entidad_id"
            value={form}
            set={setForm}
            options={catalogs.entidades.map((x) => ({ value: x.id, label: `${x.sigla} - ${x.nombre}` }))}
          />
        </>
      );
    }

    return null;
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OPERACIÓN INSTITUCIONAL</p>
          <h1>Gestión integral SIGA</h1>
          <p className="sub">Módulos conectados a los servicios oficiales del backend según los permisos de tu cuenta.</p>
        </div>
        <button className="secondary-button" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? 'spin' : ''} />{busy ? ' Actualizando' : ' Actualizar datos'}
        </button>
      </div>

      <div className="module-tabs">
        {TABS.filter(([k]) => (k !== 'usuarios' && k !== 'auditoria') || admin).map(([k, n]) => (
          <button
            key={k}
            className={tab === k ? 'selected' : ''}
            onClick={() => {
              setTab(k);
              setSearch('');
              setForm({});
              setDetail(null);
              setEditItem(null);
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">MÓDULO</p>
            <h2>{titles[tab]}</h2>
            <p className="sub">
              {tab === 'sync'
                ? 'Descarga el paquete local y sincroniza eventos registrados sin conexión.'
                : 'Consulta, registra y actualiza los registros autorizados para tu perfil.'}
            </p>
          </div>
        </div>

        {createForm() && (
          <form className="module-form" onSubmit={submit}>
            <h3>Registrar nuevo</h3>
            <div className="module-fields">{createForm()}</div>
            <button className="primary-button" disabled={busy}>Guardar registro (POST)</button>
          </form>
        )}

        {editItem && (
          <form className="module-form" onSubmit={submitEdit}>
            <div className="panel-head">
              <h3>Editar registro #{editItem.id}</h3>
              <button type="button" className="text-button" onClick={() => setEditItem(null)}>Cancelar edición</button>
            </div>
            <div className="module-fields">
              {tab === 'productores' && (
                <>
                  <Field label="Nombre / razón social" name="nombre_razon_social" value={editForm} set={setEditForm} />
                  <Field label="Teléfono" name="telefono" value={editForm} set={setEditForm} required={false} />
                  <Field label="Correo" name="email" type="email" value={editForm} set={setEditForm} required={false} />
                  <Field
                    label="Municipio"
                    name="municipio_codigo"
                    value={editForm}
                    set={setEditForm}
                    options={catalogs.municipios.map((x) => ({ value: x.codigo_dane, label: `${x.nombre} - ${x.departamento}` }))}
                  />
                </>
              )}
              {tab === 'predios' && (
                <>
                  <Field label="Nombre del predio" name="nombre" value={editForm} set={setEditForm} />
                  <Field label="Código catastral" name="codigo_catastral" value={editForm} set={setEditForm} required={false} />
                  <Field label="Matrícula inmobiliaria" name="matricula_inmobiliaria" value={editForm} set={setEditForm} required={false} />
                  <Field label="Área (m²)" name="area_m2" type="number" step="any" value={editForm} set={setEditForm} />
                  <Field label="Latitud" name="latitud" type="number" step="any" value={editForm} set={setEditForm} />
                  <Field label="Longitud" name="longitud" type="number" step="any" value={editForm} set={setEditForm} />
                  <Field
                    label="Municipio"
                    name="municipio_codigo"
                    value={editForm}
                    set={setEditForm}
                    options={catalogs.municipios.map((x) => ({ value: x.codigo_dane, label: `${x.nombre} - ${x.departamento}` }))}
                  />
                </>
              )}
              {tab === 'usuarios' && (
                <>
                  <Field label="Rol" name="rol" value={editForm} set={setEditForm} options={['PRODUCTOR', 'EXTENSIONISTA', 'ENTIDAD', 'ADMIN']} />
                  <Field
                    label="Entidad"
                    name="entidad_id"
                    value={editForm}
                    set={setEditForm}
                    required={false}
                    options={catalogs.entidades.map((x) => ({ value: x.id, label: `${x.sigla} - ${x.nombre}` }))}
                  />
                  <label className="module-field">
                    Estado de cuenta
                    <select
                      value={editForm.activo ? 'true' : 'false'}
                      onChange={(e) => setEditForm({ ...editForm, activo: e.target.value === 'true' })}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo (bloquea acceso)</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <button className="primary-button" disabled={busy}>Guardar cambios (PATCH)</button>
          </form>
        )}

        {tab === 'catalogos' ? (
          <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div className="detail-box">
              <h3>Entidades adscritas ({catalogs.entidades.length})</h3>
              <ul style={{ paddingLeft: '18px', fontSize: '13px' }}>
                {catalogs.entidades.map((e) => (
                  <li key={e.id}><b>{e.sigla}</b> — {e.nombre} ({e.tipo})</li>
                ))}
              </ul>
            </div>
            <div className="detail-box">
              <h3>Productos ({catalogs.productos.length})</h3>
              <ul style={{ paddingLeft: '18px', fontSize: '13px' }}>
                {catalogs.productos.map((p) => (
                  <li key={p.id}><b>{p.nombre}</b> ({p.categoria} · {p.unidad_medida})</li>
                ))}
              </ul>
            </div>
            <div className="detail-box">
              <h3>Municipios ({catalogs.municipios.length})</h3>
              <ul style={{ paddingLeft: '18px', fontSize: '13px', maxHeight: '260px', overflow: 'auto' }}>
                {catalogs.municipios.slice(0, 60).map((m) => (
                  <li key={m.codigo_dane}>{m.codigo_dane} · {m.nombre} ({m.departamento})</li>
                ))}
              </ul>
            </div>
          </div>
        ) : tab === 'sync' ? (
          <>
            <div className="sync-card">
              <Database />
              <div>
                <h3>Paquete local de datos (Bootstrap)</h3>
                <p className="sub">
                  Incluye {data?.lotes?.length || 0} lotes, {data?.predios?.length || 0} predios y {data?.productos?.length || 0} productos para operar sin conexión.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'siga-bootstrap.json';
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download /> Descargar paquete JSON
                </button>
              </div>
              <span>{data?.generado_en ? date(data.generado_en) : 'Sin cargar'}</span>
            </div>

            <form className="module-form" onSubmit={addOffline}>
              <h3>Registrar evento sin conexión</h3>
              <div className="module-fields">
                <label className="module-field">
                  Lote
                  <select
                    required
                    value={offline.lote_codigo}
                    onChange={(e) => setOffline((v) => ({ ...v, lote_codigo: e.target.value }))}
                  >
                    <option value="">Selecciona un lote</option>
                    {(data?.lotes || []).map((l) => (
                      <option key={l.id} value={l.codigo_trazabilidad}>
                        #{l.id} · {l.codigo_trazabilidad}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="module-field">
                  Tipo de evento
                  <select
                    value={offline.tipo_evento}
                    onChange={(e) => setOffline((v) => ({ ...v, tipo_evento: e.target.value }))}
                  >
                    {(data?.tipos_evento || ['SIEMBRA', 'COSECHA', 'ACOPIO', 'TRANSPORTE', 'VENTA', 'INSPECCION_SANITARIA']).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="module-field">
                  Detalle (opcional)
                  <input
                    value={offline.detalle}
                    onChange={(e) => setOffline((v) => ({ ...v, detalle: e.target.value }))}
                    placeholder="Nota de campo"
                  />
                </label>
              </div>
              <button className="secondary-button">
                <ClipboardList /> Guardar evento en dispositivo
              </button>
            </form>

            <div className="sync-card">
              <CloudUpload />
              <div>
                <h3>Cola pendiente: {queue.length} eventos</h3>
                <p className="sub">Los eventos se conservan en este navegador hasta sincronizarlos con POST /api/sync/eventos.</p>
                <button className="primary-button" disabled={busy || !queue.length} onClick={sendOffline}>
                  Sincronizar ahora
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="module-toolbar">
              <div className="search-box">
                <Search />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en los registros…"
                />
              </div>
              <span className="sub">{filtered.length} registros</span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {(cols[tab] || []).map((c) => (
                      <th key={c}>{c.replaceAll('_', ' ')}</th>
                    ))}
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id || r.exportacion_id || i}>
                      {(cols[tab] || []).map((c) => (
                        <td key={c}>
                          {typeof r[c] === 'boolean'
                            ? r[c]
                              ? 'Sí'
                              : 'No'
                            : c === 'validado' || c === 'ubicacion_verificada' || c === 'activo'
                            ? Number(r[c]) === 1
                              ? 'Sí'
                              : 'No'
                            : r[c] ?? '—'}
                        </td>
                      ))}
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={async () => {
                            if (tab === 'exportaciones') {
                              try {
                                setDetail(await api(`/exportaciones/${r.exportacion_id}`));
                                return;
                              } catch {}
                            }
                            setDetail(r);
                          }}>
                            Ver
                          </button>

                          {tab === 'productores' && (
                            <>
                              {['PRODUCTOR', 'EXTENSIONISTA', 'ADMIN'].includes(user?.rol) && (
                                <button type="button" onClick={() => startEdit(r)}>
                                  <Edit3 size={12} /> Editar
                                </button>
                              )}
                              {['ENTIDAD', 'ADMIN'].includes(user?.rol) && !Number(r.validado) && (
                                <button type="button" onClick={() => act(`/productores/${r.id}/validar`)}>
                                  Validar
                                </button>
                              )}
                              {['ENTIDAD', 'ADMIN'].includes(user?.rol) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nuevo = r.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
                                    act(`/productores/${r.id}/estado`, 'PATCH', { estado: nuevo });
                                  }}
                                >
                                  {r.estado === 'ACTIVO' ? 'Suspender' : 'Activar'}
                                </button>
                              )}
                            </>
                          )}

                          {tab === 'predios' && (
                            <>
                              {['PRODUCTOR', 'EXTENSIONISTA', 'ADMIN'].includes(user?.rol) && (
                                <button type="button" onClick={() => startEdit(r)}>
                                  <Edit3 size={12} /> Editar
                                </button>
                              )}
                              {['EXTENSIONISTA', 'ENTIDAD', 'ADMIN'].includes(user?.rol) && !Number(r.ubicacion_verificada) && (
                                <button type="button" onClick={() => act(`/predios/${r.id}/verificar`)}>
                                  Verificar
                                </button>
                              )}
                              {isANT && Number(r.ubicacion_verificada) === 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const ref = prompt('Referencia Fondo de Tierras ANT (mín. 3 caracteres):', r.referencia_fondo_tierras || '');
                                    if (ref && ref.trim().length >= 3) {
                                      act(`/predios/${r.id}/fondo-tierras`, 'PATCH', { referencia: ref.trim() });
                                    }
                                  }}
                                >
                                  Fondo Tierras (ANT)
                                </button>
                              )}
                            </>
                          )}

                          {tab === 'alertas' && r.estado === 'ABIERTA' && ['ENTIDAD', 'ADMIN'].includes(user?.rol) && (
                            <button
                              type="button"
                              onClick={() => {
                                const nota = prompt('Nota de resolución (mínimo 3 caracteres):');
                                if (nota && nota.trim().length >= 3) {
                                  act(`/alertas/${r.id}/resolver`, 'PATCH', { nota_resolucion: nota.trim() });
                                }
                              }}
                            >
                              Resolver
                            </button>
                          )}

                          {tab === 'exportaciones' && r.estado === 'PENDIENTE' && (
                            <>
                              <button type="button" onClick={() => act(`/exportaciones/${r.exportacion_id}/recalcular`, 'POST')}>
                                Recalcular
                              </button>
                              {isDIAN && (
                                <button
                                  type="button"
                                  onClick={() => act(`/exportaciones/${r.exportacion_id}/documentos-dian`, 'PATCH', { cumplido: true })}
                                >
                                  <CheckCircle size={12} /> Avalar DIAN
                                </button>
                              )}
                              {isDIANorMADR && (
                                <>
                                  <button type="button" onClick={() => act(`/exportaciones/${r.exportacion_id}/aprobar`)}>
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const motivo = prompt('Motivo del rechazo (mínimo 5 caracteres):');
                                      if (motivo && motivo.trim().length >= 5) {
                                        act(`/exportaciones/${r.exportacion_id}/rechazar`, 'PATCH', { motivo_rechazo: motivo.trim() });
                                      }
                                    }}
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                            </>
                          )}

                          {tab === 'usuarios' && admin && (
                            <button type="button" onClick={() => startEdit(r)}>
                              <Edit3 size={12} /> Editar rol/estado
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filtered.length && (
                <div className="empty">
                  <ClipboardList />
                  <p>No hay registros para mostrar o tu perfil no tiene permiso para consultarlos.</p>
                </div>
              )}
            </div>
          </>
        )}

        {detail && (
          <div className="detail-box">
            <div className="panel-head">
              <h3>Detalle del registro</h3>
              <button className="text-button" onClick={() => setDetail(null)}>Cerrar</button>
            </div>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </div>
        )}
      </section>
    </>
  );
}

function Field({ label, name, value, set, options, type = 'text', step, required }) {
  const isReq =
    required !== undefined
      ? required
      : [
          'nombre',
          'nombre_razon_social',
          'email',
          'password',
          'tipo_documento',
          'numero_documento',
          'tipo_productor',
          'municipio_codigo',
          'area_m2',
          'latitud',
          'longitud',
          'lote_id',
          'pais_destino',
          'tipo',
          'severidad',
          'descripcion',
          'productor_id',
          'rol',
        ].includes(name);

  return (
    <label className="module-field">
      {label}
      {options ? (
        <select
          required={isReq}
          value={value[name] ?? ''}
          onChange={(e) => set((v) => ({ ...v, [name]: e.target.value }))}
        >
          <option value="">Seleccionar…</option>
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o} value={o}>{o}</option>
            ) : (
              <option key={o.value} value={o.value}>{o.label}</option>
            )
          )}
        </select>
      ) : (
        <input
          required={isReq}
          type={type}
          step={step}
          value={value[name] ?? ''}
          onChange={(e) => set((v) => ({ ...v, [name]: e.target.value }))}
        />
      )}
    </label>
  );
}