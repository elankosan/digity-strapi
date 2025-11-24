/**
 * Multi-tenant middleware
 * Filters API requests based on application identifier
 */

export default (config, { strapi }) => {
  return async (ctx, next) => {
    // Get application ID from header or query parameter
    const applicationId = ctx.request.header['x-application-id'] || ctx.query.applicationId;
    
    // Skip middleware for admin panel and non-API routes
    if (ctx.request.url.startsWith('/admin') || 
        ctx.request.url.startsWith('/_health') ||
        !ctx.request.url.startsWith('/api')) {
      return await next();
    }

    // Skip for application endpoints (they don't need filtering)
    if (ctx.request.url.includes('/api/applications')) {
      return await next();
    }

    // If application ID is provided, inject it into query filters
    if (applicationId) {
      // Store application ID in context for use in controllers
      ctx.state.applicationId = applicationId;

      // For GET requests, add application filter
      if (ctx.request.method === 'GET') {
        // Check if this is a page or content-block request
        if (ctx.request.url.includes('/api/pages') || 
            ctx.request.url.includes('/api/content-blocks')) {
          
          // Modify query to filter by application
          const originalQuery = ctx.query;
          
          // Add application filter to nested queries
          if (!originalQuery.filters) {
            originalQuery.filters = {};
          }
          
          // For pages, filter directly by application
          if (ctx.request.url.includes('/api/pages')) {
            originalQuery.filters.application = {
              id: { $eq: applicationId }
            };
          }
          
          // For content blocks, filter by page's application
          if (ctx.request.url.includes('/api/content-blocks')) {
            originalQuery.filters.page = {
              application: {
                id: { $eq: applicationId }
              }
            };
          }
        }
      }
    }

    await next();
  };
};
