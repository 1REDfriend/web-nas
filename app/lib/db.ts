import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';

const dbPath = path.resolve(process.cwd(), 'db', 'main.sqlite');

let dbInstance: Database.Database | null = null;

export const getDb = () => {
    if (!dbInstance) {
        dbInstance = new Database(dbPath);
        dbInstance.pragma('journal_mode = WAL');

        try {
            const initSqlPath = path.resolve(process.cwd(), 'db', 'init.sql');
            const initSql = fs.readFileSync(initSqlPath, 'utf-8');
            dbInstance.exec(initSql);
            console.log('Database initialized successfully.');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {

            } else {
                console.error('Failed to initialize database:', error);
            }
        }

    }
    return dbInstance;
};