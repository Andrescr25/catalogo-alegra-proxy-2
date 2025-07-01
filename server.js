const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
const PORT = 3001;

// Configuración de CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configuración de Alegra
const ALEGRA_API_URL = 'https://api.alegra.com/api/v1';
const ALEGRA_AUTH = 'Basic dGFjaGlmYWN0dXJhc0BnbWFpbC5jb206YjNhODRhYmI2ODk3MTgwZDM4ODk=';

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
                request_url: url
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
                sample_statuses: sampleStatuses
            }
        };
        
        res.json(responseInfo);
        
    } catch (error) {
        console.error('💥 Error completo al obtener productos:', error);
        
        res.status(500).json({ 
            error: 'Error interno del servidor proxy', 
            message: error.message,
            type: error.name,
            timestamp: new Date().toISOString()
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
            conclusion: hasMore ? 'Puede haber más productos' : 'Todos los productos encontrados'
        });
        
    } catch (error) {
        console.error('💥 Error verificando productos:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Servir archivos estáticos
app.use(express.static('public'));

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        alegra_configured: !!ALEGRA_AUTH,
        alegra_url: ALEGRA_API_URL,
        node_version: process.version,
        port: PORT,
        fetch_method: 'native https'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor proxy ejecutándose en http://localhost:${PORT}`);
    console.log(`📡 Proxy para Alegra API configurado: ${ALEGRA_API_URL}`);
    console.log(`🌐 Archivos estáticos servidos desde: ./public`);
    console.log(`🔑 Autenticación configurada: ${ALEGRA_AUTH ? 'SÍ' : 'NO'}`);
    console.log(`🛠️  Usando módulo HTTPS nativo (sin node-fetch)`);
    console.log(`📋 Endpoints disponibles:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /api/productos`);
    console.log(`   - GET  /api/productos-count`);
    console.log(`\n💡 Para verificar productos: curl http://localhost:${PORT}/api/productos-count`);
});