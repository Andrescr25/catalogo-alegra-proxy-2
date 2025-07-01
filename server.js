const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
require('dotenv').config(); // ← AGREGADO: Para cargar variables de entorno

const app = express();
const PORT = process.env.PORT || 3001; // ← CAMBIADO: Usa variable de entorno

// Configuración de CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*', // ← CAMBIADO: Usa variable de entorno
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ← CAMBIADO: Configuración de Alegra usando variables de entorno
const ALEGRA_API_URL = 'https://api.alegra.com/api/v1';

// Función para generar auth header desde variables de entorno
function getAlegraAuth() {
    const email = process.env.ALEGRA_EMAIL;
    const token = process.env.ALEGRA_TOKEN;
    
    if (!email || !token) {
        console.error('❌ Variables de entorno ALEGRA_EMAIL y ALEGRA_TOKEN son requeridas');
        return null;
    }
    
    const credentials = Buffer.from(`${email}:${token}`).toString('base64');
    return `Basic ${credentials}`;
}

const ALEGRA_AUTH = getAlegraAuth();

// ← AGREGADO: Middleware para verificar configuración
app.use((req, res, next) => {
    // Solo verificar en rutas de API
    if (req.path.startsWith('/api/') && !ALEGRA_AUTH) {
        return res.status(500).json({
            error: 'Servidor mal configurado',
            message: 'Variables de entorno ALEGRA_EMAIL y ALEGRA_TOKEN son requeridas',
            env_status: {
                ALEGRA_EMAIL: process.env.ALEGRA_EMAIL ? 'Configurado' : 'Faltante',
                ALEGRA_TOKEN: process.env.ALEGRA_TOKEN ? 'Configurado' : 'Faltante',
                NODE_ENV: process.env.NODE_ENV || 'development'
            }
        });
    }
    next();
});

// Middleware para logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Función para hacer peticiones HTTPS sin node-fetch
function makeHttpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 30000
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        data: jsonData,
                        headers: res.headers
                    });
                } catch (error) {
                    resolve({
                        ok: false,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        data: data,
                        headers: res.headers
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// ← AGREGADO: Endpoint para probar conexión con Alegra
app.get('/api/test-alegra', async (req, res) => {
    try {
        console.log('🔗 Probando conexión con Alegra...');
        
        if (!ALEGRA_AUTH) {
            return res.status(500).json({
                status: 'error',
                message: 'Credenciales de Alegra no configuradas',
                env_check: {
                    ALEGRA_EMAIL: process.env.ALEGRA_EMAIL ? 'OK' : 'FALTANTE',
                    ALEGRA_TOKEN: process.env.ALEGRA_TOKEN ? 'OK' : 'FALTANTE'
                }
            });
        }
        
        // Test simple: obtener información de la empresa
        const url = `${ALEGRA_API_URL}/company`;
        const response = await makeHttpsRequest(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': ALEGRA_AUTH,
                'User-Agent': 'Node.js Proxy Server'
            }
        });
        
        if (!response.ok) {
            return res.status(500).json({
                status: 'error',
                message: 'Error al conectar con Alegra',
                alegra_status: response.status,
                alegra_response: response.data,
                credentials_check: {
                    email: process.env.ALEGRA_EMAIL || 'No configurado',
                    token_length: process.env.ALEGRA_TOKEN ? process.env.ALEGRA_TOKEN.length : 0
                }
            });
        }
        
        res.json({
            status: 'success',
            message: 'Conexión con Alegra exitosa',
            company: response.data.name || 'Empresa conectada',
            company_data: response.data,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Test de Alegra falló:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Error en test de conexión',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint para obtener productos
app.get('/api/productos', async (req, res) => {
    try {
        // Alegra tiene un límite máximo de 30 productos por consulta
        let { start = 0, limit = 30 } = req.query;
        
        // Asegurar que el límite no exceda 30
        limit = Math.min(parseInt(limit), 30);
        start = parseInt(start);
        
        console.log(`📦 Obteniendo productos de Alegra: start=${start}, limit=${limit}`);
        
        const url = `${ALEGRA_API_URL}/items?start=${start}&limit=${limit}`;
        console.log(`🔗 URL completa: ${url}`);
        
        const response = await makeHttpsRequest(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': ALEGRA_AUTH,
                'User-Agent': 'Node.js Proxy Server'
            }
        });

        console.log(`📡 Respuesta de Alegra: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            console.error(`❌ Error de Alegra: ${response.status}`);
            console.error(`📄 Respuesta completa:`, JSON.stringify(response.data, null, 2));
            console.error(`🏷️  Headers de respuesta:`, response.headers);
            
            return res.status(500).json({
                error: `Error de Alegra: ${response.status} ${response.statusText}`,
                alegra_response: response.data,
                alegra_headers: response.headers,
                request_url: url,
                suggestions: [
                    'Verifica las credenciales en el archivo .env',
                    'Confirma que el token de Alegra no haya expirado',
                    'Revisa que la cuenta tenga permisos de lectura'
                ]
            });
        }

        const data = response.data;
        console.log(`✅ Datos recibidos de Alegra: ${Array.isArray(data) ? data.length : 'no array'} elementos`);
        console.log(`📊 Start=${start}, Datos recibidos=${data.length}, ¿Hay más?: ${data.length === 30 ? 'SÍ' : 'NO'}`);
        
        if (!Array.isArray(data)) {
            console.error('❌ La respuesta de Alegra no es un array:', data);
            return res.status(500).json({ 
                error: 'Formato de respuesta inválido de Alegra',
                received: typeof data,
                data: data
            });
        }
        
        // Log de productos antes de filtrar
        console.log(`📋 Productos totales recibidos: ${data.length}`);
        
        const activeProducts = data.filter(product => {
            return product && product.status === 'active';
        });
        
        console.log(`✅ Productos activos filtrados: ${activeProducts.length}`);
        console.log(`❌ Productos inactivos filtrados: ${data.length - activeProducts.length}`);
        
        // Información adicional para debug
        const sampleStatuses = data.slice(0, 5).map(p => ({ id: p.id, status: p.status, name: p.name?.substring(0, 30) }));
        console.log(`🔍 Muestra de productos (primeros 5):`, sampleStatuses);
        
        // Información de respuesta para el cliente
        const responseInfo = {
            products: activeProducts,
            debug: {
                start: start,
                limit: limit,
                total_received: data.length,
                active_filtered: activeProducts.length,
                inactive_filtered: data.length - activeProducts.length,
                has_more: data.length === 30,
                sample_statuses: sampleStatuses,
                timestamp: new Date().toISOString()
            }
        };
        
        res.json(responseInfo);
        
    } catch (error) {
        console.error('💥 Error completo al obtener productos:', error);
        
        res.status(500).json({ 
            error: 'Error interno del servidor proxy', 
            message: error.message,
            type: error.name,
            timestamp: new Date().toISOString(),
            suggestions: [
                'Verifica que el servidor de Alegra esté disponible',
                'Revisa la configuración de red',
                'Confirma que las credenciales sean válidas'
            ]
        });
    }
});

// Endpoint para verificar el total de productos en Alegra
app.get('/api/productos-count', async (req, res) => {
    try {
        console.log('🔢 Verificando total de productos en Alegra...');
        
        // Hacer algunas consultas para verificar el límite real
        let totalFound = 0;
        let start = 0;
        const limit = 30;
        let hasMore = true;
        const results = [];
        
        // Probar hasta 20 páginas (600 productos) para diagnosticar
        while (hasMore && start < 600) {
            const url = `${ALEGRA_API_URL}/items?start=${start}&limit=${limit}`;
            console.log(`🔍 Probando: start=${start}, limit=${limit}`);
            
            const response = await makeHttpsRequest(url, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': ALEGRA_AUTH,
                    'User-Agent': 'Node.js Proxy Server'
                }
            });
            
            if (!response.ok) {
                console.log(`❌ Error en start=${start}: ${response.status}`);
                results.push({
                    start: start,
                    status: response.status,
                    error: response.data
                });
                break;
            }
            
            const data = response.data;
            const activeCount = data.filter(p => p.status === 'active').length;
            
            totalFound += activeCount;
            
            results.push({
                start: start,
                total_received: data.length,
                active_count: activeCount,
                has_more: data.length === 30
            });
            
            console.log(`📊 Start=${start}: ${data.length} total, ${activeCount} activos`);
            
            if (data.length < 30) {
                hasMore = false;
                console.log(`🏁 Fin detectado en start=${start} (recibidos ${data.length} < 30)`);
            }
            
            start += 30;
            
            // Pequeña pausa para no sobrecargar la API
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        res.json({
            total_active_found: totalFound,
            pages_tested: Math.ceil(start / 30),
            max_start_tested: start - 30,
            detailed_results: results,
            conclusion: hasMore ? 'Puede haber más productos' : 'Todos los productos encontrados',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 Error verificando productos:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ← AGREGADO: Endpoint para obtener categorías
app.get('/api/categorias', async (req, res) => {
    try {
        console.log('📂 Obteniendo categorías de Alegra...');
        
        const url = `${ALEGRA_API_URL}/item-categories`;
        const response = await makeHttpsRequest(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': ALEGRA_AUTH,
                'User-Agent': 'Node.js Proxy Server'
            }
        });
        
        if (!response.ok) {
            return res.status(500).json({
                error: `Error de Alegra: ${response.status}`,
                alegra_response: response.data
            });
        }
        
        res.json({
            categories: response.data,
            count: response.data.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error al obtener categorías:', error);
        res.status(500).json({
            error: 'Error al obtener categorías',
            message: error.message
        });
    }
});

// Servir archivos estáticos desde 'public'
app.use(express.static('public'));

// ← MEJORADO: Endpoint de salud con más información
app.get('/health', (req, res) => {
    const envStatus = {
        ALEGRA_EMAIL: process.env.ALEGRA_EMAIL ? '✅ Configurado' : '❌ Faltante',
        ALEGRA_TOKEN: process.env.ALEGRA_TOKEN ? '✅ Configurado' : '❌ Faltante',
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || 'default (3001)',
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'default (*)'
    };
    
    res.json({ 
        status: 'OK',
        service: 'Catálogo Productos API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        alegra_configured: !!ALEGRA_AUTH,
        alegra_url: ALEGRA_API_URL,
        node_version: process.version,
        port: PORT,
        fetch_method: 'native https',
        environment: envStatus,
        available_endpoints: [
            'GET /health',
            'GET /api/test-alegra',
            'GET /api/productos',
            'GET /api/productos-count',
            'GET /api/categorias'
        ]
    });
});

// ← AGREGADO: Manejo de rutas no encontradas
app.use('*', (req, res) => {
    // Si es una ruta de API, devolver JSON
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({
            error: 'Endpoint no encontrado',
            available_endpoints: [
                'GET /api/productos',
                'GET /api/productos-count',
                'GET /api/categorias',
                'GET /api/test-alegra',
                'GET /health'
            ],
            requested: req.originalUrl
        });
    }
    
    // Para rutas del frontend, servir index.html (SPA)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ← AGREGADO: Manejo global de errores
app.use((error, req, res, next) => {
    console.error('💥 Error no manejado:', error);
    res.status(500).json({
        error: 'Error interno del servidor',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
🚀 Servidor proxy ejecutándose en http://localhost:${PORT}
📡 Proxy para Alegra API: ${ALEGRA_API_URL}
🌐 Archivos estáticos: ./public
🛠️  Método HTTP: HTTPS nativo (sin node-fetch)

🔧 Variables de entorno:
   ALEGRA_EMAIL: ${process.env.ALEGRA_EMAIL ? '✅ Configurado' : '❌ Faltante'}
   ALEGRA_TOKEN: ${process.env.ALEGRA_TOKEN ? '✅ Configurado' : '❌ Faltante'}
   NODE_ENV: ${process.env.NODE_ENV || 'development'}
   PORT: ${PORT}
   CORS_ORIGIN: ${process.env.CORS_ORIGIN || '*'}

📋 Endpoints disponibles:
   - GET  /health                 (Estado del servidor)
   - GET  /api/test-alegra        (Probar conexión con Alegra)
   - GET  /api/productos          (Obtener productos)
   - GET  /api/productos-count    (Contar productos)
   - GET  /api/categorias         (Obtener categorías)

🔗 URLs de prueba:
   - Health: http://localhost:${PORT}/health
   - Test Alegra: http://localhost:${PORT}/api/test-alegra
   - Productos: http://localhost:${PORT}/api/productos
    `);

    // ← AGREGADO: Verificación inicial de configuración
    if (!ALEGRA_AUTH) {
        console.log(`
❌ ADVERTENCIA: Variables de entorno no configuradas
   Crea un archivo .env con:
   ALEGRA_EMAIL=tu-email@empresa.com
   ALEGRA_TOKEN=tu-token-de-alegra
        `);
    } else {
        console.log(`✅ Credenciales de Alegra configuradas correctamente`);
    }
});

// ← AGREGADO: Manejo de cierre graceful
process.on('SIGTERM', () => {
    console.log('👋 Cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 Cerrando servidor...');
    process.exit(0);
});