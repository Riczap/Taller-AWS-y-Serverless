import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { verifyAccessToken } from '../lib/jwt';

// Cambiamos "effect: string" por "effect: 'Allow' | 'Deny'"
const generatePolicy = (principalId: string, effect: 'Allow' | 'Deny', resource: string, context: any): APIGatewayAuthorizerResult => {
    return {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource
                }
            ]
        },
        context
    };
};

export const authorizer = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    try {
        if (!event.authorizationToken) {
            throw new Error("Unauthorized");
        }

        const token = event.authorizationToken.replace(/^Bearer\s+/, '');
        const payload = verifyAccessToken(token);

        return generatePolicy('user', 'Allow', event.methodArn, {
            userId: payload.userId,
            role: payload.role
        });

    } catch (error) {
        throw new Error("Unauthorized");
    }
};