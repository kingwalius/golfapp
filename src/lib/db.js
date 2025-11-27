import { openDB } from 'idb';

const DB_NAME = 'golf-app-db';
const DB_VERSION = 1;

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // Courses store
            if (!db.objectStoreNames.contains('courses')) {
                const store = db.createObjectStore('courses', { keyPath: 'id', autoIncrement: true });
                store.createIndex('name', 'name', { unique: false });
            }

            // Rounds/Scorecards store
            if (!db.objectStoreNames.contains('rounds')) {
                const store = db.createObjectStore('rounds', { keyPath: 'id', autoIncrement: true });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('courseId', 'courseId', { unique: false });
            }

            // Matches store (1v1)
            if (!db.objectStoreNames.contains('matches')) {
                db.createObjectStore('matches', { keyPath: 'id', autoIncrement: true });
            }

            // League store
            if (!db.objectStoreNames.contains('leagues')) {
                db.createObjectStore('leagues', { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

export const dbPromise = initDB();
