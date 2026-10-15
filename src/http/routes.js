// Build 3: the routes layer. A route handler's job is to turn an HTTP request
// into a call to a service and return a plain value. Business rules do NOT live
// here. Build 3 only needs /health; the ticket routes arrive in Build 4.

export function registerRoutes(router) {
  router.get('/health', () => ({ status: 'ok' }));
  return router;
}
