# Mandarina Store - Sistema de Gestión

## Despliegue en Vercel

### 1. Configurar Base de Datos KV

1. Ve a tu dashboard de Vercel
2. Selecciona tu proyecto
3. Ve a la pestaña "Storage"
4. Crea una nueva base de datos KV
5. Copia las variables de entorno generadas

### 2. Configurar Variables de Entorno

En tu proyecto de Vercel, agrega estas variables de entorno:

```
KV_REST_API_URL=tu_url_de_kv
KV_REST_API_TOKEN=tu_token_de_kv
KV_REST_API_READ_ONLY_TOKEN=tu_token_readonly_de_kv
```

### 3. Desplegar

```bash
# Instalar dependencias
npm install

# Construir para producción
npm run build

# Desplegar (conecta tu repo a Vercel)
git push origin main
```

### 4. Desarrollo Local

Para desarrollo local, crea un archivo `.env.local` con tus credenciales de KV:

```
KV_REST_API_URL=tu_url_de_kv
KV_REST_API_TOKEN=tu_token_de_kv
KV_REST_API_READ_ONLY_TOKEN=tu_token_readonly_de_kv
```

## Características

- ✅ Base de datos Vercel KV (Redis)
- ✅ Fallback a localStorage para desarrollo
- ✅ Gestión completa de productos, ventas, compras
- ✅ Sistema de reservas con adelantos
- ✅ Gestión de planchas de impresión
- ✅ Costos fijos configurables
- ✅ Reportes financieros
- ✅ Interfaz responsive con Tailwind CSS

## Tecnologías

- **Frontend**: Vite + TypeScript + Tailwind CSS 4
- **Base de datos**: Vercel KV (Redis)
- **Despliegue**: Vercel
- **Notificaciones**: Sonner