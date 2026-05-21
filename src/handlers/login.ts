import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../lib/dynamo';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import { ok, badRequest, internalServerError } from '../lib/response';
import { withCors } from '../common/cors';

const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Evento de login recibido:", event);

        if (!event.body) {
            return badRequest("El cuerpo (body) es requerido");
        }

        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (e) {
            return badRequest("El cuerpo (body) debe ser un JSON valido");
        }

        const { email, password } = body;

        if (!email || !password) {
            return badRequest("El email y password son requeridos para el login");
        }

        const userTable = process.env.USERS_TABLE || 'taller-gateway-local-users';
        const refreshTokensTable = process.env.REFRESH_TOKENS_TABLE || 'taller-gateway-local-refresh-tokens';

        // 1. Buscar usuario por email usando el GSI (email-index)
        const result = await dynamo.send(new QueryCommand({
            TableName: userTable,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        }));

        if (!result.Items || result.Items.length === 0) {
            return badRequest("Credenciales invalidas (usuario no encontrado)");
        }

        const user = result.Items[0];

        // 2. Verificar contraseña (comparación en texto plano para mantener compatibilidad con register.ts)
        if (user.password !== password) {
            return badRequest("Credenciales invalidas (contraseña incorrecta)");
        }

        // 3. Generar tokens JWT
        const payload = {
            userId: user.userId,
            role: user.role || 'buyer'
        };

        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        // 4. Guardar refresh token en DynamoDB con expiración (TTL de 7 días)
        const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 días
        await dynamo.send(new PutCommand({
            TableName: refreshTokensTable,
            Item: {
                token: refreshToken,
                userId: user.userId,
                expiresAt
            }
        }));

        // Excluir contraseña del objeto de respuesta
        const { password: _, ...userResponse } = user;

        return ok({
            success: true,
            message: "Login exitoso",
            accessToken,
            refreshToken,
            user: userResponse
        });

    } catch (error: any) {
        console.error("Error en el handler de login:", error);
        return internalServerError(error.message || "Error interno al iniciar sesion");
    }
};

export const handler = withCors(baseHandler);
