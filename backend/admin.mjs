import { createAdminHandler } from './admin-auth.mjs';

let store;
export const handleAdmin = createAdminHandler({
  sendImage:async (res,key) => (await import('./storage.mjs')).sendDrawingImage(res,key),
  getStore: async () => {
    if (!store) {
      const { createAdminStore } = await import('./admin-store.mjs');
      store = createAdminStore(process.env.DATABASE_URL);
    }
    return store;
  },
});
