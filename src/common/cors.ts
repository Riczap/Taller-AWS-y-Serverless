import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Reusable wrapper to inject CORS headers into API Gateway Lambda responses.
 */
export const withCors = (handler: (event: APIGatewayProxyEvent, context: any) => Promise<APIGatewayProxyResult>) => {
    return async (event: APIGatewayProxyEvent, context: any): Promise<APIGatewayProxyResult> => {
        const origin = event.headers?.origin || event.headers?.Origin || '';
        
        // Parse the CORS origins allowed from environment variables
        const allowedOrigins = (process.env.CORS_ORIGINS || '*')
            .split(',')
            .map(o => o.trim())
            .filter(Boolean);

        let resolvedOrigin = '*';
        if (allowedOrigins.includes('*')) {
            resolvedOrigin = '*';
        } else if (allowedOrigins.includes(origin)) {
            resolvedOrigin = origin;
        } else if (allowedOrigins.length > 0) {
            resolvedOrigin = allowedOrigins[0];
        }

        const headers = {
            "Access-Control-Allow-Origin": resolvedOrigin,
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key,X-Amz-Date,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Credentials": "true"
        };

        // Handle CORS Preflight request automatically
        if (event.httpMethod === 'OPTIONS' || (event.requestContext && event.requestContext.httpMethod === 'OPTIONS')) {
            return {
                statusCode: 200,
                headers,
                body: ''
            };
        }

        try {
            const result = await handler(event, context);
            return {
                ...result,
                headers: {
                    ...headers,
                    ...result.headers
                }
            };
        } catch (error: any) {
            console.error("Error in handler wrapped with CORS:", error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: error.message || "Internal server error" })
            };
        }
    };
};
