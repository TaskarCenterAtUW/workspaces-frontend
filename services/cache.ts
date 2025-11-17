
export type ValidCacheKey = IDBValidKey | { [key: string]: IDBValidKey };

export interface LocalCache<TKey extends ValidCacheKey, TValue> {
  get(key: TKey): Promise<TValue | undefined>;
  set(key: TKey, value: TValue): Promise<void>;
  evict(key: TKey): Promise<void>;
  prune(): Promise<void>;
}

const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'cache';

export class LruIndexedDbCache<TKey extends ValidCacheKey, TValue>
  implements LocalCache<TKey, TValue>
{
  readonly dbName: string;
  readonly ttlMilliseconds: number;
  readonly keyPath: IDBObjectStoreParameters['keyPath'];

  #db?: IDBDatabase;
  #openPromise?: Promise<IDBDatabase>;

  constructor(
    dbName: string,
    ttlMilliseconds: number,
    keyPath: IDBObjectStoreParameters['keyPath']
  ) {
    this.dbName = dbName;
    this.ttlMilliseconds = ttlMilliseconds;
    this.keyPath = keyPath;
  }

  get(key: TKey): Promise<TValue | undefined> {
    return new Promise((resolve, reject) => {
      this.#tx((store) => {
        const request = typeof key === 'object'
          ? store.get(Object.values(key)) // composite key
          : store.get(key); // simple key

        request.onsuccess = () => {
          const entry = request.result;

          if (!entry) {
            return resolve(undefined);
          }

          // This implementation doesn't enforce strict eviction on access.
          // As in, we don't check for expiration here, and there is no max
          // age setting (yet). This cache will return entries that expired
          // between prune operations and even refresh the stale entry:
          //
          entry.lastAccessed = Date.now();
          store.put(entry);
          resolve(entry.value);
        };

        request.onerror = () => reject(request.error);
      });
    });
  }

  set(key: TKey, value: TValue): Promise<void> {
    return this.#tx((store) => {
      if (typeof key === 'object') {
        store.put({ ...key, value, lastAccessed: Date.now() }); // composite key
      } else {
        store.put({ key, value, lastAccessed: Date.now() }); // simple key
      }
    });
  }

  evict(key: TKey): Promise<void> {
    return this.#tx((store) => {
      if (typeof key === 'object') {
        store.delete(Object.values(key)); // composite key
      } else {
        store.delete(key); // simple key
      }
    });
  }

  prune(): Promise<void> {
    const expirationTime = Date.now() - this.ttlMilliseconds;
    console.info(`Evicting entries in "${this.dbName}" < ${expirationTime}`);

    return this.#tx((store) => {
      const index = store.index('lastAccessed');
      const request = index.openCursor(IDBKeyRange.upperBound(expirationTime));

      request.onsuccess = () => {
        const cursor = request.result;

        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  async #open(): Promise<IDBDatabase> {
    if (this.#db) {
      return this.#db;
    }
    if (this.#openPromise) {
      return this.#openPromise;
    }

    this.#openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, CACHE_DB_VERSION);

      request.onupgradeneeded = () => { this.#upgradeDb(request.result) };
      request.onerror = () => { reject(request.error) };

      request.onsuccess = () => {
        this.#db = request.result;
        this.#db.onversionchange = () => {
          // Close the DB if it opens in another tab with a different version:
          this.#db?.close();
        };

        resolve(this.#db);
      };
    });

    try {
      return await this.#openPromise;
    } finally {
      this.#openPromise = undefined;
    }
  }

  async #tx(callback: (store: IDBObjectStore) => void) : Promise<void> {
    const db = await this.#open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      tx.oncomplete = () => { resolve() };
      tx.onabort = () => { reject(tx.error) };
      tx.onerror = () => { reject(tx.error) };

      callback(tx.objectStore(CACHE_STORE_NAME));
    });
  }

  #upgradeDb(db: IDBDatabase) {
    console.info(`Upgrading ${this.dbName} to version ${CACHE_DB_VERSION}`);

    if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
      const store = db.createObjectStore(CACHE_STORE_NAME, {
        keyPath: this.keyPath
      });
      store.createIndex('lastAccessed', 'lastAccessed');
    }
  }
}
