# SIGA – Frontend institucional

Frontend React + Vite para el Sistema de Información y Gestión Agropecuaria. Se conserva la interfaz institucional original y se amplían sus pantallas mediante los endpoints disponibles del backend SIGA.

## Instalación

```bash
npm install
```

Crea `.env` en la raíz copiando `.env.example`:

```env
VITE_API_URL=http://localhost:3000/api
```

Si el backend está en otro equipo de la red, cambia `localhost` por la IP local de ese equipo, por ejemplo `http://192.168.1.8:3000/api`.

Inicia:

```bash
npm run dev
```

## Funcionalidades

- Inicio de sesión con token JWT y validación de sesión contra `/auth/me`.
- Panel principal e indicadores básicos.
- Lotes: listado, búsqueda, creación y generación/descarga de QR.
- Consulta pública de trazabilidad por código.
- Gestión de productores: consulta, registro asistido y validación (según rol).
- Gestión de predios: consulta, registro y verificación de ubicación (según rol).
- Alertas sanitarias: consulta, creación para perfiles autorizados y resolución.
- Exportaciones: consulta, solicitud, recálculo del checklist, aprobación y rechazo según permisos.
- Usuarios: consulta y creación para ADMIN.
- Auditoría: consulta para ADMIN.
- Sincronización: descarga de paquete de datos, captura local de eventos y envío de la cola offline al backend.

## Importante

Las operaciones visibles dependen del rol, la entidad asociada, los datos existentes y las reglas del backend. Por ejemplo, el ICA es quien puede abrir alertas; DIAN/MADR gestionan decisiones de exportación; solo ADMIN administra usuarios y consulta auditoría. La sincronización offline requiere que el evento corresponda a un lote y que el backend acepte el tipo/orden del evento.

El login `POST /auth/login` es público en el backend SIGA y no debe llevar token. Las demás rutas protegidas envían `Authorization: Bearer <token>`. Si aparece `Token requerido` en el login, revisa que `VITE_API_URL` apunte al backend SIGA correcto y reinicia Vite.

No compartas el archivo `.env`; contiene configuración local. Este ZIP incluye únicamente `.env.example`.
