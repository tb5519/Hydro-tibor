/** A content-versioned URL also bypasses stale proxy/compression cache variants. */
export async function registerPlatformServiceWorker(
  container: ServiceWorkerContainer,
  version: string | undefined,
  sendConfig: () => Promise<unknown>,
) {
  const workerPath = `/service-worker.js?v=${encodeURIComponent(version || 'persistent-navigation-v1')}`;
  const workerUrl = new URL(workerPath, window.location.origin).href;
  let configured: ServiceWorker | null = null;
  const configureController = () => {
    const controller = container.controller;
    // Posting through the obsolete controller during an upgrade can keep its
    // fetch event alive and delay takeover. Configure only the requested build.
    if (!controller || controller.scriptURL !== workerUrl || controller === configured) return;
    configured = controller;
    void sendConfig().catch(() => {
      // Allow a later controller event to retry; configuration failure must not
      // interrupt the page or a live classroom connection.
      if (configured === controller) configured = null;
    });
  };
  container.addEventListener('controllerchange', configureController);
  try {
    const registration = await container.register(
      workerPath,
      { scope: '/', updateViaCache: 'none' },
    );
    // On an upgrade the old controller can be active here. Reconfigure when the
    // new worker takes control, without reloading or interrupting open calls.
    configureController();
    return registration;
  } catch (error) {
    container.removeEventListener('controllerchange', configureController);
    throw error;
  }
}
