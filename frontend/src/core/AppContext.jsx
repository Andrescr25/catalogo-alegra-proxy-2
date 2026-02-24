import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { dbData } from '../core/db';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [lastSync, setLastSync] = useState(null);
    const [isAdminMode, setIsAdminMode] = useState(false);

    // UI states
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ message: '', percent: 0 });

    useEffect(() => {
        const initDB = async () => {
            try {
                const storedProducts = await dbData.getAllProducts();
                const lastUpdate = await dbData.getLastUpdate();

                if (storedProducts && storedProducts.length > 0) {
                    setProducts(storedProducts);
                    setLastSync(lastUpdate);
                }
            } catch (error) {
                console.error("Failed to load local DB:", error);
            } finally {
                setIsLoading(false);
            }
        };

        initDB();
    }, []);

    const filteredData = useMemo(() => {
        let result = products;

        if (searchQuery) {
            const term = searchQuery.toLowerCase().trim();
            result = result.filter(p => {
                const name = p.name ? p.name.toLowerCase() : '';
                const ref = p.reference?.reference ? p.reference.reference.toLowerCase() : '';
                return name.includes(term) || ref.includes(term);
            });
        }

        // Group by category
        const categories = {};
        result.forEach(p => {
            const catName = p.category?.name || 'Otros';
            if (!categories[catName]) categories[catName] = [];
            categories[catName].push(p);
        });

        // Sort keys
        const sortedKeys = Object.keys(categories).sort();
        return { flat: result, grouped: categories, sortedKeys };
    }, [products, searchQuery]);

    const value = {
        products,
        setProducts,
        searchQuery,
        setSearchQuery,
        isLoading,
        setIsLoading,
        lastSync,
        setLastSync,
        isSyncing,
        setIsSyncing,
        syncProgress,
        setSyncProgress,
        filteredData,
        isAdminMode,
        setIsAdminMode
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);
