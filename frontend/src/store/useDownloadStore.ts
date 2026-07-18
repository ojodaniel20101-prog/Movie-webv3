import { create } from 'zustand';

export interface DownloadedItem {
  id: string;
  contentId: string;
  contentType: 'anime' | 'tv' | 'movie';
  title: string;
  episodeNumber?: number;
  seasonNumber?: number;
  thumbnail: string;
  fileUrl: string;
  downloadedAt: number;
  size?: string;
}

const DB_NAME = 'zentrix-downloads';
const STORE_NAME = 'downloads';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllDownloads(): Promise<DownloadedItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDownload(item: DownloadedItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteDownload(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface DownloadStore {
  downloads: DownloadedItem[];
  loadDownloads: () => Promise<void>;
  addDownload: (item: DownloadedItem) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: [],

  loadDownloads: async () => {
    const items = await getAllDownloads();
    set({ downloads: items.sort((a, b) => b.downloadedAt - a.downloadedAt) });
  },

  addDownload: async (item) => {
    await saveDownload(item);
    set((s) => ({ downloads: [item, ...s.downloads.filter(d => d.id !== item.id)] }));
  },

  removeDownload: async (id) => {
    await deleteDownload(id);
    set((s) => ({ downloads: s.downloads.filter(d => d.id !== id) }));
  },
}));
