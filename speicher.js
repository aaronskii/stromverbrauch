"use strict";

globalThis.StromSpeicher = (() => {
  const rootPath = new URL("./", location.href).pathname;
  const databaseName = "Stromverbrauch|" + rootPath;
  const storeName = "tracker";
  let databasePromise;

  function database() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Schließe andere Ansichten der App und öffne sie erneut."));
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            databasePromise = null;
          };
          resolve(request.result);
        };
      }).catch(error => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  }

  async function read() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get("state");
      request.onsuccess = () => resolve(request.result ?? StromModell.emptyState());
      request.onerror = () => reject(request.error);
    });
  }

  async function write(change) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.get("state");
      let next;
      let validationError;
      request.onsuccess = () => {
        try {
          next = change(request.result ?? StromModell.emptyState());
          store.put(next, "state");
        } catch (error) {
          validationError = error;
          transaction.abort();
        }
      };
      transaction.onabort = () => reject(validationError ?? transaction.error ?? new Error("Speichern fehlgeschlagen."));
      transaction.oncomplete = () => resolve(next);
    });
  }

  return Object.freeze({ read, write, channelName: databaseName });
})();
