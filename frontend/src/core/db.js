import { openDB } from 'idb';

const DB_NAME = 'AlegraCatalogReactDB';
const DB_VERSION = 1;

export const dbData = {
    async connect() {
        return openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('products')) {
                    const store = db.createObjectStore('products', { keyPath: 'id' });
                    store.createIndex('status', 'status');
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata');
                }
            },
        });
    },

    async getAllProducts() {
        const db = await this.connect();
        return db.getAll('products');
    },

    async saveProducts(productsTarget) {
        const db = await this.connect();
        const tx = db.transaction('products', 'readwrite');
        
        // Optimize using Promise.all
        await Promise.all(productsTarget.map(p => tx.store.put(p)));
        await tx.done;
    },

    async clearProducts() {
        const db = await this.connect();
        await db.clear('products');
    },

    async saveLastUpdate(timestamp = Date.now()) {
        const db = await this.connect();
        await db.put('metadata', timestamp, 'lastUpdate');
    },

    async getLastUpdate() {
        const db = await this.connect();
        return db.get('metadata', 'lastUpdate');
    }
};
